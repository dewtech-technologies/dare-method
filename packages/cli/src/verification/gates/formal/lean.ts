import { safeSpawn } from '../../../exec/safe-spawn.js';
import type { FormalStage, FormalVerdict } from '../../types.js';
import type { FormalBackend, FormalRunInput } from './backend.js';
import { FormalBackendError, FormalToolNotFoundError } from './backend.js';

const LAKE_BIN = 'lake';
const MIN_VERSION = '4.0.0';

export interface LeanParse {
  readonly verified: boolean;
  readonly stage: FormalStage;
  readonly reason: string;
}

export function parseLeanOutput(args: {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly timedOut: boolean;
}): LeanParse {
  const combined = `${args.stdout}\n${args.stderr}`;
  if (args.timedOut) {
    return { verified: false, stage: 'none', reason: 'proof timed out' };
  }
  if (/\bsorry\b/i.test(combined) || /\berror:/i.test(combined)) {
    return { verified: false, stage: 'impl', reason: 'lean: proof rejected' };
  }
  if (args.code === 0) {
    return { verified: true, stage: 'none', reason: 'lean: verified' };
  }
  return { verified: false, stage: 'none', reason: 'lean: unparseable' };
}

export function buildLeanArgv(input: FormalRunInput): string[] {
  return ['env', 'lean', input.specPath];
}

async function isAvailable(cwd: string): Promise<boolean> {
  const r = await safeSpawn(LAKE_BIN, ['--version'], {
    cwd,
    timeoutSeconds: 30,
    maxChars: 2000,
  });
  return r.code === 0;
}

async function run(input: FormalRunInput): Promise<FormalVerdict> {
  const start = Date.now();
  if (!(await isAvailable(input.cwd))) {
    throw new FormalToolNotFoundError('lean', input.target.file);
  }
  const r = await safeSpawn(LAKE_BIN, buildLeanArgv(input), {
    cwd: input.cwd,
    timeoutSeconds: input.proofTimeoutSeconds,
    maxChars: 8000,
  });
  const parse = parseLeanOutput(r);
  if (r.code !== 0 && !r.timedOut && parse.reason === 'lean: unparseable') {
    throw new FormalBackendError(`lean exited ${r.code}`, r.stderr);
  }
  return {
    backend: 'lean',
    verified: parse.verified,
    stage: parse.stage,
    bypassDetected: false,
    repairIterations: 0,
    solverExitCode: r.code,
    reason: parse.reason,
    durationMs: Date.now() - start,
  };
}

export const leanBackend: FormalBackend = {
  backend: 'lean',
  minVersion: MIN_VERSION,
  isAvailable,
  run,
};

export const backend = leanBackend;
