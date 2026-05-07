/**
 * Ralph Loop — runs **for every single task** before it can transition to
 * DONE. There is no flag to skip it, no config to disable it, no exception
 * for "small" or "doc-only" tasks. Every `dare execute --complete <id>`
 * dispatches build → test → lint and only marks the task DONE if all three
 * pass.
 *
 * The set of gate commands is hardcoded **per stack** (the project's stack
 * is read from `dare.config.json`). The mapping is the same for every task
 * in that project — what changes is the *codebase state* the gates are
 * evaluated against.
 *
 * If any gate fails, the task transitions to FAILED with the failing gate's
 * stderr captured in `task.error`. The agent must fix the failure and call
 * `dare execute --complete <id>` again.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';

export type GateName = 'build' | 'test' | 'lint';

export interface RalphLoopGate {
  name: GateName;
  command: string;
}

export interface RalphLoopResult {
  passed: boolean;
  failedAt?: GateName;
  failedCommand?: string;
  stderr?: string;
  stdout?: string;
  durationMs: number;
}

/**
 * Resolve gates for the project's stack. The stack is read from
 * `dare.config.json` — there is no override mechanism on purpose.
 */
export function gatesFor(stack: string): RalphLoopGate[] {
  switch (stack) {
    case 'php-laravel':
      return [
        { name: 'build', command: 'composer dump-autoload --no-interaction' },
        { name: 'test', command: 'php artisan test' },
        { name: 'lint', command: './vendor/bin/pint --test' },
      ];
    case 'node-nestjs':
      return [
        { name: 'build', command: 'npm run build' },
        { name: 'test', command: 'npm test -- --passWithNoTests' },
        { name: 'lint', command: 'npm run lint' },
      ];
    case 'python-fastapi':
      return [
        {
          name: 'build',
          command: pythonShellPath('python', '-m', 'compileall', '-q', '.'),
        },
        { name: 'test', command: pythonShellPath('pytest', '-q', '--tb=short') },
        { name: 'lint', command: pythonShellPath('ruff', 'check', '.') },
      ];
    case 'rust-axum':
      return [
        { name: 'build', command: 'cargo build --quiet' },
        { name: 'test', command: 'cargo test --quiet' },
        { name: 'lint', command: 'cargo clippy --quiet -- -D warnings' },
      ];
    case 'go-gin':
    case 'go-stdlib':
      return [
        { name: 'build', command: 'go build ./...' },
        { name: 'test', command: 'go test ./...' },
        { name: 'lint', command: 'go vet ./...' },
      ];
    case 'react':
    case 'vue':
      return [
        { name: 'build', command: 'npm run build' },
        { name: 'test', command: 'npm test -- --run --passWithNoTests' },
        { name: 'lint', command: 'npm run lint' },
      ];
    case 'mcp-server-node-ts':
      return [
        { name: 'build', command: 'npm run build' },
        { name: 'test', command: 'npm test -- --run --passWithNoTests' },
        { name: 'lint', command: 'npm run lint' },
      ];
    case 'mcp-server-python':
      return [
        {
          name: 'build',
          command: pythonShellPath('python', '-m', 'compileall', '-q', '.'),
        },
        { name: 'test', command: pythonShellPath('pytest', '-q', '--tb=short') },
        { name: 'lint', command: pythonShellPath('ruff', 'check', '.') },
      ];
    default:
      throw new Error(
        `Ralph Loop has no gate definition for stack="${stack}". ` +
          `Update gatesFor() in src/dag-runner/ralph-loop.ts.`,
      );
  }
}

export interface RunRalphLoopOptions {
  stack: string;
  cwd: string;
  /** Cap on captured stderr per gate (chars). Defaults to 4000. */
  maxStderrChars?: number;
  /** Per-gate timeout in seconds. Defaults to 600. */
  timeoutSeconds?: number;
  /** Receives a status line every time a gate starts/finishes. */
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

  const gates = gatesFor(stack);
  const start = Date.now();

  for (const gate of gates) {
    onProgress?.({ gate: gate.name, phase: 'start' });
    const result = await runShell(gate.command, cwd, timeoutSeconds, maxStderrChars);
    if (result.code !== 0) {
      onProgress?.({ gate: gate.name, phase: 'fail' });
      return {
        passed: false,
        failedAt: gate.name,
        failedCommand: gate.command,
        stderr: result.stderr,
        stdout: result.stdout,
        durationMs: Date.now() - start,
      };
    }
    onProgress?.({ gate: gate.name, phase: 'pass' });
  }

  return { passed: true, durationMs: Date.now() - start };
}

// ─── Internal ────────────────────────────────────────────────────────────────

interface ShellResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runShell(
  command: string,
  cwd: string,
  timeoutSeconds: number,
  maxChars: number,
): Promise<ShellResult> {
  return new Promise((resolve) => {
    const proc = spawn(command, {
      cwd,
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk) => {
      stdout = appendCapped(stdout, chunk.toString(), maxChars);
    });
    proc.stderr?.on('data', (chunk) => {
      stderr = appendCapped(stderr, chunk.toString(), maxChars);
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      stderr += `\n[Ralph Loop] timed out after ${timeoutSeconds}s`;
    }, timeoutSeconds * 1000);

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        code: 1,
        stdout,
        stderr: appendCapped(stderr, `spawn error: ${err.message}`, maxChars),
      });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

function appendCapped(buffer: string, chunk: string, max: number): string {
  if (buffer.length >= max) return buffer;
  return (buffer + chunk).slice(0, max);
}

/**
 * Resolve a Python tool path: prefers `.venv/bin/<tool>` (or `.venv\Scripts\<tool>.exe`
 * on Windows) when a venv is present in the project. Falls back to the bare
 * command on PATH otherwise.
 */
function pythonShellPath(tool: string, ...args: string[]): string {
  // We can't probe at module load (we don't know cwd yet), so encode the
  // resolution in the shell command itself: try venv first, otherwise PATH.
  const venvWin = `.venv\\Scripts\\${tool}.exe`;
  const venvNix = `.venv/bin/${tool}`;
  const argsStr = args.join(' ');
  if (process.platform === 'win32') {
    return `if exist ${venvWin} (${venvWin} ${argsStr}) else (${tool} ${argsStr})`;
  }
  return `if [ -x ${venvNix} ]; then ${venvNix} ${argsStr}; else ${tool} ${argsStr}; fi`;
}

/**
 * Read the project's stack from `dare.config.json`. Combines `structure`,
 * `backend`, `frontend` and (for MCP) `mcpLanguage` into the stack key used
 * by `gatesFor()`.
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
  // For monorepo / backend, prefer the backend stack; for frontend-only, the frontend.
  if (cfg.backend) return cfg.backend;
  if (cfg.frontend) return cfg.frontend;
  throw new Error(
    `dare.config.json has no backend/frontend/mcpLanguage to derive Ralph Loop gates from.`,
  );
}
