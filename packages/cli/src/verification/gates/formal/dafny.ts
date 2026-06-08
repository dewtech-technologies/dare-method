import { safeSpawn } from '../../../exec/safe-spawn.js';
import type { FormalStage, FormalVerdict } from '../../types.js';
import type { FormalBackend, FormalRunInput } from './backend.js';
import { FormalBackendError, FormalToolNotFoundError } from './backend.js';

const DAFNY_BIN = 'dafny';
const MIN_VERSION = '4.0.0';

export interface DafnyParse {
  readonly verified: boolean;
  readonly stage: FormalStage;
  readonly reason: string;
}

function classifyStage(output: string): FormalStage {
  const lower = output.toLowerCase();
  const hasSpec =
    /\brequires\b/.test(lower) ||
    /precondition might not hold/.test(lower) ||
    /precondition could not be proved/.test(lower);
  const hasImpl =
    /\bensures\b/.test(lower) ||
    /postcondition might not hold/.test(lower) ||
    /postcondition could not be proved/.test(lower) ||
    /assertion might not hold/.test(lower);
  if (hasSpec && hasImpl) return 'both';
  if (hasSpec) return 'spec';
  if (hasImpl) return 'impl';
  return 'impl';
}

function extractStableReason(output: string): string {
  const lines = output.split(/\r?\n/);
  const patterns = [
    /postcondition might not hold/i,
    /precondition might not hold/i,
    /assertion might not hold/i,
    /postcondition could not be proved/i,
    /precondition could not be proved/i,
    /(\d+) errors?\b/i,
  ];
  for (const line of lines) {
    const trimmed = line.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    for (const p of patterns) {
      if (p.test(trimmed)) return trimmed.slice(0, 200);
    }
  }
  const errCount = output.match(/(\d+) errors?\b/i);
  if (errCount) return `dafny: ${errCount[0]}`;
  return 'dafny: proof rejected';
}

/** Parse Dafny stdout/stderr + exit code into a deterministic verdict core. */
export function parseDafnyOutput(args: {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly timedOut: boolean;
}): DafnyParse {
  const combined = `${args.stdout}\n${args.stderr}`;

  if (args.timedOut) {
    return { verified: false, stage: 'none', reason: 'proof timed out' };
  }

  const errorMatch = combined.match(/(\d+) errors?\b/i);
  const errorCount = errorMatch ? Number.parseInt(errorMatch[1] ?? '0', 10) : 0;
  const hasProofFailure =
    errorCount > 0 ||
    /assertion might not hold/i.test(combined) ||
    /postcondition might not hold/i.test(combined) ||
    /precondition might not hold/i.test(combined) ||
    /postcondition could not be proved/i.test(combined) ||
    /precondition could not be proved/i.test(combined);

  if (hasProofFailure) {
    return {
      verified: false,
      stage: classifyStage(combined),
      reason: extractStableReason(combined),
    };
  }

  if (args.code === 0 && /\bverified\b/i.test(combined)) {
    return { verified: true, stage: 'none', reason: 'dafny: verified' };
  }

  return { verified: false, stage: 'none', reason: 'dafny: unparseable' };
}

export function buildDafnyArgv(input: FormalRunInput): string[] {
  return [
    'verify',
    input.specPath,
    '--solver-path',
    'z3',
    '--verification-time-limit',
    String(input.proofTimeoutSeconds),
  ];
}

async function probeDafny(cwd: string): Promise<boolean> {
  const r = await safeSpawn(DAFNY_BIN, ['--version'], {
    cwd,
    timeoutSeconds: 30,
    maxChars: 2000,
  });
  return r.code === 0;
}

async function isAvailable(cwd: string): Promise<boolean> {
  return probeDafny(cwd);
}

async function run(input: FormalRunInput): Promise<FormalVerdict> {
  const start = Date.now();
  if (!(await isAvailable(input.cwd))) {
    throw new FormalToolNotFoundError('dafny');
  }

  const argv = buildDafnyArgv(input);
  const r = await safeSpawn(DAFNY_BIN, argv, {
    cwd: input.cwd,
    timeoutSeconds: input.proofTimeoutSeconds,
    maxChars: 8000,
  });

  const parse = parseDafnyOutput({
    stdout: r.stdout,
    stderr: r.stderr,
    code: r.code,
    timedOut: r.timedOut,
  });

  if (r.code !== 0 && !r.timedOut && parse.reason === 'dafny: unparseable') {
    throw new FormalBackendError(`dafny exited ${r.code}`, r.stderr);
  }

  return {
    backend: 'dafny',
    verified: parse.verified,
    stage: parse.stage,
    bypassDetected: false,
    repairIterations: 0,
    solverExitCode: r.code,
    reason: parse.reason,
    durationMs: Date.now() - start,
  };
}

export const dafnyBackend: FormalBackend = {
  backend: 'dafny',
  minVersion: MIN_VERSION,
  isAvailable,
  run,
};

export const backend = dafnyBackend;
