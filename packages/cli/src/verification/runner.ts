import type {
  AspectResult,
  VerificationConfig,
  VerificationResult,
} from './types.js';
import {
  checkFailToPass,
  FailToPassMissingError,
  readVerificationArtifact,
} from './gates/fail-to-pass.js';
import { checkAntiTamper } from './gates/anti-tamper.js';
import { checkTypes } from './gates/type-check.js';
import { adapterForStack } from './registry.js';
import type { MutationAdapter } from './gates/mutation/adapter.js';
import { MutationToolNotFoundError } from './gates/mutation/adapter.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('verification');

export interface RunVerificationOptions {
  readonly taskId: string;
  readonly stack: string;
  readonly cwd: string;
  readonly config: VerificationConfig;
  readonly changedFiles: ReadonlyArray<string>;
  readonly onProgress?: (e: {
    aspect: string;
    phase: 'start' | 'pass' | 'fail' | 'skip';
  }) => void;
}

export interface VerificationDeps {
  readonly readArtifact: typeof readVerificationArtifact;
  readonly checkFailToPass: typeof checkFailToPass;
  readonly checkAntiTamper: typeof checkAntiTamper;
  readonly checkTypes: typeof checkTypes;
  readonly adapterForStack: typeof adapterForStack;
}

export const defaultVerificationDeps: VerificationDeps = {
  readArtifact: readVerificationArtifact,
  checkFailToPass,
  checkAntiTamper,
  checkTypes,
  adapterForStack,
};

function notify(
  onProgress: RunVerificationOptions['onProgress'],
  aspect: string,
  phase: 'start' | 'pass' | 'fail' | 'skip',
): void {
  onProgress?.({ aspect, phase });
}

function logAspect(result: AspectResult): void {
  log.info(
    {
      aspect: result.aspect,
      verdict: result.verdict,
      score: result.score,
      reason: result.reason,
      durationMs: result.durationMs,
    },
    'verification aspect',
  );
}

function computePassed(aspects: ReadonlyArray<AspectResult>): boolean {
  return aspects.every(
    (a) => a.verdict === 'PASS' || a.verdict === 'SKIP',
  );
}

function finish(
  taskId: string,
  aspects: AspectResult[],
  startedAt: number,
): VerificationResult {
  const mutation = aspects.find((a) => a.aspect === 'mutation');
  return {
    taskId,
    passed: computePassed(aspects),
    aspects,
    mutationScore: mutation?.score,
    durationMs: Date.now() - startedAt,
  };
}

async function runMutationAspect(
  opts: RunVerificationOptions,
  deps: VerificationDeps,
): Promise<AspectResult> {
  const start = Date.now();
  const { config, stack, cwd, changedFiles } = opts;

  const adapter: MutationAdapter = await deps.adapterForStack(stack);
  const available = await adapter.isAvailable(cwd);
  if (!available) {
    throw new MutationToolNotFoundError(adapter.tool);
  }

  const output = await adapter.run({
    cwd,
    changedFiles,
    incremental: config.mutation.incremental,
    maxMutants: config.mutation.maxMutants,
    timeoutSeconds: config.mutation.timeoutSeconds,
  });
  const durationMs = Date.now() - start;

  if (Number.isNaN(output.score)) {
    return {
      aspect: 'mutation',
      verdict: 'SKIP',
      reason: 'zero mutants evaluated',
      durationMs,
    };
  }

  if (output.score < config.mutation.minScore) {
    return {
      aspect: 'mutation',
      verdict: 'FAIL',
      score: output.score,
      reason: `mutation score ${output.score.toFixed(4)} < minScore ${config.mutation.minScore}`,
      durationMs,
    };
  }

  return {
    aspect: 'mutation',
    verdict: 'PASS',
    score: output.score,
    reason: `mutation score ${output.score.toFixed(4)}`,
    durationMs,
  };
}

export function createRunVerification(
  deps: VerificationDeps = defaultVerificationDeps,
): (opts: RunVerificationOptions) => Promise<VerificationResult> {
  return async function runVerification(
    opts: RunVerificationOptions,
  ): Promise<VerificationResult> {
    const startedAt = Date.now();
    const { taskId, cwd, config } = opts;
    const aspects: AspectResult[] = [];

    if (!config.enabled) {
      return {
        taskId,
        passed: true,
        aspects: [],
        durationMs: Date.now() - startedAt,
      };
    }

    const artifact = await deps.readArtifact(cwd, taskId);

    if (config.failToPass.required) {
      notify(opts.onProgress, 'fail-to-pass', 'start');
      if (!artifact?.failToPassBaseline || !artifact.specGlob) {
        throw new FailToPassMissingError(taskId);
      }
      const ftp = await deps.checkFailToPass({ taskId, cwd });
      aspects.push(ftp);
      logAspect(ftp);
      notify(
        opts.onProgress,
        'fail-to-pass',
        ftp.verdict === 'PASS' ? 'pass' : 'fail',
      );
      if (ftp.verdict === 'FAIL') {
        return finish(taskId, aspects, startedAt);
      }
    }

    if (config.antiTamper.enabled) {
      notify(opts.onProgress, 'anti-tamper', 'start');
      if (!artifact?.tamperSnapshot) {
        const skipped: AspectResult = {
          aspect: 'anti-tamper',
          verdict: 'SKIP',
          reason: 'no tamper snapshot',
          durationMs: 0,
        };
        aspects.push(skipped);
        logAspect(skipped);
        notify(opts.onProgress, 'anti-tamper', 'skip');
      } else {
        const testGlob = artifact.specGlob ?? '**/*.test.ts';
        const at = await deps.checkAntiTamper({
          baseline: artifact.tamperSnapshot,
          cwd,
          testGlob,
        });
        aspects.push(at);
        logAspect(at);
        notify(
          opts.onProgress,
          'anti-tamper',
          at.verdict === 'PASS'
            ? 'pass'
            : at.verdict === 'SKIP'
              ? 'skip'
              : 'fail',
        );
        if (at.verdict === 'FAIL') {
          return finish(taskId, aspects, startedAt);
        }
      }
    }

    if (config.typeCheck.enabled) {
      notify(opts.onProgress, 'type', 'start');
      const tc = await deps.checkTypes({
        stack: opts.stack,
        cwd,
        timeoutSeconds: 120,
      });
      aspects.push(tc);
      logAspect(tc);
      notify(
        opts.onProgress,
        'type',
        tc.verdict === 'PASS'
          ? 'pass'
          : tc.verdict === 'SKIP'
            ? 'skip'
            : 'fail',
      );
      if (tc.verdict === 'FAIL') {
        return finish(taskId, aspects, startedAt);
      }
    }

    if (config.mutation.enabled) {
      notify(opts.onProgress, 'mutation', 'start');
      const mut = await runMutationAspect(opts, deps);
      aspects.push(mut);
      logAspect(mut);
      notify(
        opts.onProgress,
        'mutation',
        mut.verdict === 'PASS'
          ? 'pass'
          : mut.verdict === 'SKIP'
            ? 'skip'
            : 'fail',
      );
    }

    return finish(taskId, aspects, startedAt);
  };
}

export const runVerification = createRunVerification();
