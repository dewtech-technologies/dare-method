import path from 'node:path';
import fs from 'fs-extra';
import type {
  AspectResult,
  CriticalModuleMarker,
  FormalGateConfig,
  FormalVerdict,
} from '../../types.js';
import { resolveFormalTargets } from './marker.js';
import { backendForConfig } from './registry.js';
import {
  detectBypass,
  formatBypassRejection,
} from './anti-bypass.js';
import type { FormalBackend, FormalRunInput } from './backend.js';
import { FormalToolNotFoundError } from './backend.js';

const VERIFICATION_DIR = '.dare/verification';

async function persistFormalProof(
  cwd: string,
  taskId: string,
  proof: FormalVerdict,
): Promise<void> {
  const file = path.join(cwd, VERIFICATION_DIR, `${taskId}.json`);
  await fs.ensureDir(path.dirname(file));
  const prev = (await fs.pathExists(file))
    ? ((await fs.readJson(file)) as Record<string, unknown>)
    : {};
  await fs.writeJson(file, { ...prev, formalProof: proof }, { spaces: 2 });
}

export interface FormalRunnerDeps {
  readonly resolveFormalTargets: typeof resolveFormalTargets;
  readonly backendForConfig: typeof backendForConfig;
  readonly detectBypass: typeof detectBypass;
  readonly readSource: (cwd: string, relPath: string) => Promise<string>;
  readonly persistFormalProof: (
    cwd: string,
    taskId: string,
    proof: FormalVerdict,
  ) => Promise<void>;
}

export const defaultFormalRunnerDeps: FormalRunnerDeps = {
  resolveFormalTargets,
  backendForConfig,
  detectBypass,
  readSource: async (cwd, relPath) =>
    fs.readFile(path.resolve(cwd, relPath), 'utf8'),
  persistFormalProof,
};

function targetLabel(marker: CriticalModuleMarker): string {
  return marker.symbol ? `${marker.file}::${marker.symbol}` : marker.file;
}

function formalRunInput(
  taskId: string,
  cwd: string,
  target: CriticalModuleMarker,
  proofTimeoutSeconds: number,
): FormalRunInput {
  const specPath = path.join('EXECUTION', `${taskId}.formal`, 'spec.dfy');
  return {
    cwd,
    target,
    specPath,
    implPath: target.file,
    proofTimeoutSeconds,
  };
}

/**
 * Aspecto formal — marker → isAvailable → run → anti-bypass → AspectResult.
 * Loop PREFACE NÃO roda aqui (A-8); a skill itera fora do CLI.
 */
export function createCheckFormal(
  deps: Partial<FormalRunnerDeps> = {},
): (args: {
  readonly taskId: string;
  readonly stack: string;
  readonly cwd: string;
  readonly config: FormalGateConfig;
  readonly changedFiles: ReadonlyArray<string>;
}) => Promise<AspectResult> {
  const d: FormalRunnerDeps = { ...defaultFormalRunnerDeps, ...deps };

  return async function checkFormal(args): Promise<AspectResult> {
    const start = Date.now();
    const targets = await d.resolveFormalTargets({
      cwd: args.cwd,
      changedFiles: args.changedFiles,
      config: args.config,
    });

    if (targets.length === 0) {
      return {
        aspect: 'formal',
        verdict: 'SKIP',
        reason: 'no marked module',
        durationMs: Date.now() - start,
      };
    }

    const backend: FormalBackend = await d.backendForConfig(args.config);
    const available = await backend.isAvailable(args.cwd);
    if (!available) {
      throw new FormalToolNotFoundError(backend.backend, targetLabel(targets[0]!));
    }

    let lastVerdict: FormalVerdict | undefined;
    let failReason: string | undefined;

    for (const target of targets) {
      const input = formalRunInput(
        args.taskId,
        args.cwd,
        target,
        args.config.proofTimeoutSeconds,
      );
      const verdict = await backend.run(input);

      let specSource = '';
      let implSource = '';
      try {
        specSource = await d.readSource(args.cwd, input.specPath);
      } catch {
        specSource = '';
      }
      try {
        implSource = await d.readSource(args.cwd, input.implPath);
      } catch {
        implSource = '';
      }

      const solverPassed = verdict.verified;
      const bypass = args.config.antiBypass
        ? d.detectBypass({ specSource, implSource })
        : { bypassDetected: false as const, pattern: undefined };
      const verified = solverPassed && !bypass.bypassDetected;
      const finalVerdict: FormalVerdict = {
        ...verdict,
        verified,
        bypassDetected: bypass.bypassDetected,
      };

      await d.persistFormalProof(args.cwd, args.taskId, finalVerdict);
      lastVerdict = finalVerdict;

      if (!verified) {
        failReason = bypass.bypassDetected
          ? formatBypassRejection(targetLabel(target), bypass.pattern ?? 'unknown')
          : finalVerdict.reason;
        break;
      }
    }

    const durationMs = Date.now() - start;

    if (lastVerdict?.verified) {
      return {
        aspect: 'formal',
        verdict: 'PASS',
        reason: lastVerdict.reason,
        durationMs,
      };
    }

    return {
      aspect: 'formal',
      verdict: 'FAIL',
      reason: failReason ?? lastVerdict?.reason ?? 'formal verification failed',
      durationMs,
    };
  };
}

export const checkFormal = createCheckFormal();
