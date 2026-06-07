/**
 * Ralph Loop — runs **for every single task** before it can transition to
 * DONE. There is no flag to skip it, no config to disable it, no exception
 * for "small" or "doc-only" tasks. Every `dare execute --complete <id>`
 * dispatches build → test → lint and only marks the task DONE if all three
 * pass.
 */
import path from 'node:path';
import fs from 'fs-extra';
import { safeSpawn } from '../exec/safe-spawn.js';
import { npmInvoke } from '../exec/npm-invoke.js';

export type GateName = 'build' | 'test' | 'lint';

export interface RalphLoopGate {
  name: GateName;
  command: string;
  args: string[];
}

export interface RalphLoopResult {
  passed: boolean;
  failedAt?: GateName;
  failedCommand?: string;
  stderr?: string;
  stdout?: string;
  durationMs: number;
}

function gate(name: GateName, command: string, args: string[]): RalphLoopGate {
  return { name, command, args };
}

function npmGate(name: GateName, args: string[]): RalphLoopGate {
  const npm = npmInvoke(args);
  return gate(name, npm.command, npm.args);
}

function pythonGate(
  cwd: string,
  name: GateName,
  tool: string,
  args: string[],
): RalphLoopGate {
  return gate(name, resolvePythonBin(cwd, tool), args);
}

const LEPTOS_CLIPPY: RalphLoopGate = gate('lint', 'cargo', [
  'clippy',
  '--all-targets',
  '--all-features',
  '--',
  '-D',
  'warnings',
]);

const LEPTOS_FMT: RalphLoopGate = gate('lint', 'cargo', ['fmt', '--check']);

/**
 * Resolve a Python tool path: prefers project venv when present.
 */
export function resolvePythonBin(cwd: string, tool: string): string {
  const winPath = path.join(cwd, '.venv', 'Scripts', `${tool}.exe`);
  const nixPath = path.join(cwd, '.venv', 'bin', tool);
  if (fs.existsSync(winPath)) return winPath;
  if (fs.existsSync(nixPath)) return nixPath;
  return tool;
}

/**
 * Resolve gates for the project's stack (argv, no shell).
 */
export function gatesFor(stack: string, cwd: string = process.cwd()): RalphLoopGate[] {
  switch (stack) {
    case 'php-laravel':
      return [
        gate('build', 'composer', ['dump-autoload', '--no-interaction']),
        gate('test', 'php', ['artisan', 'test']),
        gate('lint', path.join('vendor', 'bin', 'pint'), ['--test']),
      ];
    case 'node-nestjs':
      return [
        npmGate('build', ['run', 'build']),
        npmGate('test', ['test', '--', '--passWithNoTests']),
        npmGate('lint', ['run', 'lint']),
      ];
    case 'python-fastapi':
      return [
        pythonGate(cwd, 'build', 'python', ['-m', 'compileall', '-q', '.']),
        pythonGate(cwd, 'test', 'pytest', ['-q', '--tb=short']),
        pythonGate(cwd, 'lint', 'ruff', ['check', '.']),
      ];
    case 'rust-axum':
      return [
        gate('build', 'cargo', ['build', '--quiet']),
        gate('test', 'cargo', ['test', '--quiet']),
        gate('lint', 'cargo', ['clippy', '--quiet', '--', '-D', 'warnings']),
      ];
    case 'go-gin':
    case 'go-stdlib':
      return [
        gate('build', 'go', ['build', './...']),
        gate('test', 'go', ['test', './...']),
        gate('lint', 'go', ['vet', './...']),
      ];
    case 'react':
    case 'vue':
      return [
        npmGate('build', ['run', 'build']),
        npmGate('test', ['test', '--', '--run', '--passWithNoTests']),
        npmGate('lint', ['run', 'lint']),
      ];
    case 'rust-leptos':
      return [
        gate('build', 'cargo', ['leptos', 'build', '--release']),
        gate('test', 'cargo', ['test', '--workspace']),
        LEPTOS_CLIPPY,
        LEPTOS_FMT,
      ];
    case 'rust-leptos-csr':
      return [
        gate('build', 'trunk', ['build', '--release']),
        gate('test', 'cargo', ['test', '--workspace']),
        LEPTOS_CLIPPY,
        LEPTOS_FMT,
      ];
    case 'mcp-server-node-ts':
      return [
        npmGate('build', ['run', 'build']),
        npmGate('test', ['test', '--', '--run', '--passWithNoTests']),
        npmGate('lint', ['run', 'lint']),
      ];
    case 'mcp-server-python':
      return [
        pythonGate(cwd, 'build', 'python', ['-m', 'compileall', '-q', '.']),
        pythonGate(cwd, 'test', 'pytest', ['-q', '--tb=short']),
        pythonGate(cwd, 'lint', 'ruff', ['check', '.']),
      ];
    default:
      throw new Error(
        `Ralph Loop has no gate definition for stack="${stack}". ` +
          `Update gatesFor() in src/dag-runner/ralph-loop.ts.`,
      );
  }
}

export function formatGateCommand(gateDef: RalphLoopGate): string {
  return [gateDef.command, ...gateDef.args].join(' ');
}

export interface RunRalphLoopOptions {
  stack: string;
  cwd: string;
  maxStderrChars?: number;
  timeoutSeconds?: number;
  onProgress?: (event: { gate: GateName; phase: 'start' | 'pass' | 'fail' }) => void;
}

/**
 * Run all gates sequentially. Stops at the first failure.
 */
export async function runRalphLoop(
  options: RunRalphLoopOptions,
): Promise<RalphLoopResult> {
  const {
    stack,
    cwd,
    maxStderrChars = 4000,
    timeoutSeconds = 600,
    onProgress,
  } = options;

  const gates = gatesFor(stack, cwd);
  const start = Date.now();

  for (const gateDef of gates) {
    onProgress?.({ gate: gateDef.name, phase: 'start' });
    const result = await safeSpawn(gateDef.command, gateDef.args, {
      cwd,
      timeoutSeconds,
      maxChars: maxStderrChars,
    });

    const stderr = result.timedOut
      ? appendCapped(
          result.stderr,
          `\n[Ralph Loop] timed out after ${timeoutSeconds}s`,
          maxStderrChars,
        )
      : result.stderr;

    const code =
      result.timedOut && result.code === 0 ? 124 : result.code;

    if (code !== 0) {
      onProgress?.({ gate: gateDef.name, phase: 'fail' });
      return {
        passed: false,
        failedAt: gateDef.name,
        failedCommand: formatGateCommand(gateDef),
        stderr,
        stdout: result.stdout,
        durationMs: Date.now() - start,
      };
    }
    onProgress?.({ gate: gateDef.name, phase: 'pass' });
  }

  return { passed: true, durationMs: Date.now() - start };
}

function appendCapped(buffer: string, chunk: string, max: number): string {
  if (buffer.length >= max) return buffer;
  return (buffer + chunk).slice(0, max);
}

/**
 * Read the project's stack from `dare.config.json`.
 */
export async function resolveStackFromConfig(cwd: string): Promise<string> {
  const cfgPath = path.join(cwd, 'dare.config.json');
  if (!(await fs.pathExists(cfgPath))) {
    throw new Error(
      `dare.config.json not found in ${cwd}. Ralph Loop needs the project config to resolve gates.`,
    );
  }
  const cfg = (await fs.readJson(cfgPath)) as {
    structure?: string;
    backend?: string;
    frontend?: string;
    mcpLanguage?: string;
  };

  if (cfg.structure === 'mcp-server') {
    return `mcp-server-${cfg.mcpLanguage ?? 'node-ts'}`;
  }
  if (cfg.backend) return cfg.backend;
  if (cfg.frontend) return cfg.frontend;
  throw new Error(
    `dare.config.json has no backend/frontend/mcpLanguage to derive Ralph Loop gates from.`,
  );
}
