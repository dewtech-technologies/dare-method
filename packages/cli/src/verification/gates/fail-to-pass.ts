import path from 'node:path';
import fs from 'fs-extra';
import { safeSpawn } from '../../exec/safe-spawn.js';
import { npmInvoke } from '../../exec/npm-invoke.js';
import { resolveStackFromConfig } from '../../dag-runner/ralph-loop.js';
import type { AspectResult } from '../types.js';
import type { TamperSnapshot } from './anti-tamper.js';

export interface FailToPassBaseline {
  readonly recordedAt: string;
  readonly ranAgainst: string;
  readonly failed: ReadonlyArray<string>;
  readonly allFailed: boolean;
}

export interface VerificationArtifact {
  readonly specGlob?: string;
  readonly failToPassBaseline?: FailToPassBaseline;
  readonly tamperSnapshot?: TamperSnapshot;
}

export class FailToPassMissingError extends Error {
  readonly taskId: string;

  constructor(taskId: string) {
    super(`fail-to-pass baseline missing for task ${taskId}`);
    this.name = 'FailToPassMissingError';
    this.taskId = taskId;
  }
}

const BASELINE_DIR = '.dare/verification';

function artifactPath(cwd: string, taskId: string): string {
  return path.join(cwd, BASELINE_DIR, `${taskId}.json`);
}

export async function readVerificationArtifact(
  cwd: string,
  taskId: string,
): Promise<VerificationArtifact | undefined> {
  const file = artifactPath(cwd, taskId);
  if (!(await fs.pathExists(file))) return undefined;
  return (await fs.readJson(file)) as VerificationArtifact;
}

async function readArtifact(
  cwd: string,
  taskId: string,
): Promise<VerificationArtifact | undefined> {
  return readVerificationArtifact(cwd, taskId);
}

async function writeArtifact(
  cwd: string,
  taskId: string,
  patch: Partial<VerificationArtifact>,
): Promise<void> {
  const file = artifactPath(cwd, taskId);
  await fs.ensureDir(path.dirname(file));
  const prev = (await readArtifact(cwd, taskId)) ?? {};
  await fs.writeJson(file, { ...prev, ...patch }, { spaces: 2 });
}

async function gitHead(cwd: string): Promise<string> {
  const result = await safeSpawn('git', ['rev-parse', 'HEAD'], {
    cwd,
    timeoutSeconds: 30,
    maxChars: 200,
  });
  if (result.code === 0) return result.stdout.trim();
  return 'unknown';
}

/** Map stack → test runner argv for a spec glob/path. */
export function testCommandFor(
  stack: string,
  specGlob: string,
): { command: string; args: string[] } {
  switch (stack) {
    case 'node-nestjs':
    case 'react':
    case 'vue':
    case 'mcp-server-node-ts':
      return npmInvoke(['exec', 'vitest', 'run', specGlob, '--reporter=json']);
    case 'python-fastapi':
    case 'mcp-server-python':
      return {
        command: 'pytest',
        args: [specGlob, '-q', '--tb=short'],
      };
    case 'rust-axum':
    case 'rust-leptos':
    case 'rust-leptos-csr':
      return { command: 'cargo', args: ['test', '--quiet', specGlob] };
    case 'php-laravel':
      return { command: 'php', args: ['artisan', 'test', specGlob] };
    case 'go-gin':
    case 'go-stdlib':
      return { command: 'go', args: ['test', specGlob] };
    default:
      throw new Error(`No fail-to-pass test runner for stack: ${stack}`);
  }
}

interface SuiteRun {
  readonly exitCode: number;
  readonly passed: string[];
  readonly failed: string[];
  readonly stderr: string;
}

interface VitestJsonReport {
  testResults?: Array<{
    name?: string;
    assertionResults?: Array<{
      fullName?: string;
      status?: string;
    }>;
  }>;
}

function testId(file: string, name: string): string {
  return `${file}::${name}`;
}

function parseVitestJson(stdout: string): { passed: string[]; failed: string[] } {
  const passed: string[] = [];
  const failed: string[] = [];
  try {
    const report = JSON.parse(stdout) as VitestJsonReport;
    for (const fileResult of report.testResults ?? []) {
      const file = fileResult.name ?? 'unknown';
      for (const assertion of fileResult.assertionResults ?? []) {
        const id = testId(file, assertion.fullName ?? 'unknown');
        if (assertion.status === 'passed') passed.push(id);
        else if (assertion.status === 'failed') failed.push(id);
      }
    }
  } catch {
    // fallback: no structured results
  }
  return { passed, failed };
}

async function runSpecSuite(
  cwd: string,
  stack: string,
  specGlob: string,
): Promise<SuiteRun> {
  const { command, args } = testCommandFor(stack, specGlob);
  const result = await safeSpawn(command, args, {
    cwd,
    timeoutSeconds: 300,
    maxChars: 200_000,
  });

  const { passed, failed } = parseVitestJson(result.stdout);
  return {
    exitCode: result.code,
    passed,
    failed,
    stderr: result.stderr,
  };
}

/**
 * Record baseline: spec must fail entirely against pre-implementation code.
 */
export async function recordFailToPassBaseline(args: {
  readonly taskId: string;
  readonly cwd: string;
  readonly specGlob: string;
}): Promise<FailToPassBaseline> {
  const stack = await resolveStackFromConfig(args.cwd);
  const run = await runSpecSuite(args.cwd, stack, args.specGlob);

  if (run.passed.length > 0) {
    throw new Error(
      `fail-to-pass baseline requires all tests to fail; passed: ${run.passed.join(', ')}`,
    );
  }
  if (run.failed.length === 0 && run.exitCode === 0) {
    throw new Error(
      'fail-to-pass baseline requires a failing spec (all tests must fail before implementation)',
    );
  }

  const baseline: FailToPassBaseline = {
    recordedAt: new Date().toISOString(),
    ranAgainst: await gitHead(args.cwd),
    failed: run.failed.length > 0 ? run.failed : [`${args.specGlob}::(suite)`],
    allFailed: true,
  };

  await writeArtifact(args.cwd, args.taskId, {
    specGlob: args.specGlob,
    failToPassBaseline: baseline,
  });

  return baseline;
}

function failAspect(reason: string, durationMs = 0): AspectResult {
  return {
    aspect: 'fail-to-pass',
    verdict: 'FAIL',
    reason,
    durationMs,
  };
}

function passAspect(reason: string, durationMs: number): AspectResult {
  return {
    aspect: 'fail-to-pass',
    verdict: 'PASS',
    reason,
    durationMs,
  };
}

/**
 * Verify fail-to-pass gate at task completion.
 */
export async function checkFailToPass(args: {
  readonly taskId: string;
  readonly cwd: string;
}): Promise<AspectResult> {
  const start = Date.now();
  const artifact = await readArtifact(args.cwd, args.taskId);
  const baseline = artifact?.failToPassBaseline;
  const specGlob = artifact?.specGlob;

  if (!baseline || !specGlob) {
    return failAspect('no baseline recorded');
  }

  const stack = await resolveStackFromConfig(args.cwd);
  const run = await runSpecSuite(args.cwd, stack, specGlob);
  const durationMs = Date.now() - start;

  if (run.failed.length > 0) {
    return failAspect(
      `tests still failing: ${run.failed.join(', ')}`,
      durationMs,
    );
  }

  if (run.exitCode !== 0) {
    return failAspect(
      `spec suite did not pass (exit ${run.exitCode})`,
      durationMs,
    );
  }

  if (!baseline.allFailed) {
    return failAspect('baseline was not allFailed', durationMs);
  }

  return passAspect('all baseline tests now pass', durationMs);
}
