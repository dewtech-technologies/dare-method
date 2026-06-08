import { safeSpawn } from '../../../exec/safe-spawn.js';
import type { FormalStage, FormalVerdict } from '../../types.js';
import type { FormalBackend, FormalRunInput } from './backend.js';
import { FormalBackendError, FormalToolNotFoundError } from './backend.js';

const VERUS_BIN = 'verus';
const MIN_VERSION = '0.0.0';

export interface VerusParse {
  readonly verified: boolean;
  readonly stage: FormalStage;
  readonly reason: string;
}

export function parseVerusOutput(args: {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly timedOut: boolean;
}): VerusParse {
  const combined = `${args.stdout}\n${args.stderr}`;
  if (args.timedOut) {
    return { verified: false, stage: 'none', reason: 'proof timed out' };
  }
  const verifiedMatch = /verification results:\s*(\d+)\s+verified,\s*0\s+errors/i.exec(
    combined,
  );
  if (args.code === 0 && verifiedMatch) {
    return { verified: true, stage: 'none', reason: 'verus: verified' };
  }
  if (/\berror\b/i.test(combined) || /\bfailed\b/i.test(combined)) {
    return { verified: false, stage: 'impl', reason: 'verus: proof rejected' };
  }
  if (args.code !== 0) {
    return { verified: false, stage: 'none', reason: 'verus: unparseable' };
  }
  return { verified: false, stage: 'none', reason: 'verus: unparseable' };
}

export function buildVerusArgv(input: FormalRunInput): string[] {
  return [input.specPath, '--time-limit', String(input.proofTimeoutSeconds)];
}

async function isAvailable(cwd: string): Promise<boolean> {
  const r = await safeSpawn(VERUS_BIN, ['--version'], {
    cwd,
    timeoutSeconds: 30,
    maxChars: 2000,
  });
  return r.code === 0;
}

async function run(input: FormalRunInput): Promise<FormalVerdict> {
  const start = Date.now();
  if (!(await isAvailable(input.cwd))) {
    throw new FormalToolNotFoundError('verus', input.target.file);
  }
  const r = await safeSpawn(VERUS_BIN, buildVerusArgv(input), {
    cwd: input.cwd,
    timeoutSeconds: input.proofTimeoutSeconds,
    maxChars: 8000,
  });
  const parse = parseVerusOutput(r);
  if (r.code !== 0 && !r.timedOut && parse.reason === 'verus: unparseable') {
    throw new FormalBackendError(`verus exited ${r.code}`, r.stderr);
  }
  return {
    backend: 'verus',
    verified: parse.verified,
    stage: parse.stage,
    bypassDetected: false,
    repairIterations: 0,
    solverExitCode: r.code,
    reason: parse.reason,
    durationMs: Date.now() - start,
  };
}

export const verusBackend: FormalBackend = {
  backend: 'verus',
  minVersion: MIN_VERSION,
  isAvailable,
  run,
};

export const backend = verusBackend;
