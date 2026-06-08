import path from 'node:path';
import fs from 'fs-extra';
import type {
  Aspect,
  AttemptRecord,
  LoopVerdict,
  VerificationConfig,
  VerificationResult,
} from '../verification/types.js';
import { parseVerificationConfig } from '../verification/config.js';
import { decideNextAction } from '../verification/decay/policy.js';
import { failureSignature } from '../verification/decay/signature.js';
import { FailToPassMissingError } from '../verification/gates/fail-to-pass.js';
import { MutationToolNotFoundError } from '../verification/gates/mutation/adapter.js';
import { FormalToolNotFoundError } from '../verification/gates/formal/backend.js';
import {
  createRunVerification,
  type RunVerificationOptions,
} from '../verification/runner.js';
import { appendAttempt, getAttempts } from '../dag-runner/state-store.js';
import { safeSpawn } from '../exec/safe-spawn.js';
import { readProjectConfig } from '../utils/UpdateDetector.js';

export const VERIFICATION_ARTIFACT_DIR = '.dare/verification';

export function mutationToolErrorMessage(tool: string, stack: string): string {
  return `Error: mutation tool '${tool}' not found on PATH for stack '${stack}'. Install it or set verification.mutation.enabled=false.`;
}

export function formalToolErrorMessage(backend: string, target: string): string {
  return `Error: formal backend '${backend}' not found for marked module '${target}'. Install the toolchain or unmark the module.`;
}

export function failToPassMissingMessage(taskId: string): string {
  return `Error: fail-to-pass spec required but no baseline recorded for '${taskId}'. Generate EXECUTION/${taskId}.tests.* first.`;
}

export function shouldRunVerification(args: {
  readonly verify?: boolean;
  readonly noVerify?: boolean;
  readonly configEnabled: boolean;
}): boolean {
  if (args.noVerify) return false;
  if (args.verify) return true;
  return args.configEnabled;
}

export function applyFullMutationFlag(
  config: VerificationConfig,
  fullMutation?: boolean,
): VerificationConfig {
  if (!fullMutation) return config;
  return {
    ...config,
    mutation: { ...config.mutation, incremental: false },
  };
}

export function validateBestOf(n: number, max: number): string | undefined {
  if (!Number.isInteger(n) || n < 1 || n > max) {
    return `Error: --best-of must be between 1 and ${max} (got ${n})`;
  }
  return undefined;
}

export function validatePolicy(policy: string): string | undefined {
  if (policy !== 'decay' && policy !== 'fixed') {
    return `Error: --policy must be 'decay' or 'fixed' (got '${policy}')`;
  }
  return undefined;
}

export function validateFormalBackend(backend: string): string | undefined {
  if (backend !== 'dafny' && backend !== 'verus' && backend !== 'lean') {
    return `Error: --formal-backend must be 'dafny', 'verus' or 'lean' (got '${backend}')`;
  }
  return undefined;
}

export function applyFormalFlags(
  config: VerificationConfig,
  flags: {
    readonly formal?: boolean;
    readonly noFormal?: boolean;
    readonly formalBackend?: string;
  },
): VerificationConfig {
  let formal = config.formal;
  if (flags.noFormal) formal = { ...formal, enabled: false };
  else if (flags.formal) formal = { ...formal, enabled: true };
  if (flags.formalBackend) {
    formal = {
      ...formal,
      backend: flags.formalBackend as VerificationConfig['formal']['backend'],
    };
  }
  return { ...config, formal };
}

export function applyPolicyOverride(
  config: VerificationConfig,
  policy?: string,
): VerificationConfig {
  if (!policy) return config;
  return {
    ...config,
    loop: { ...config.loop, policy: policy as VerificationConfig['loop']['policy'] },
  };
}

export function resolveBestOfCount(
  bestOfFlag: number | undefined,
  config: VerificationConfig,
): number {
  return bestOfFlag ?? config.bestOfN.default;
}

export async function loadVerificationConfig(
  cwd: string,
  fullMutation?: boolean,
  formalFlags?: {
    readonly formal?: boolean;
    readonly noFormal?: boolean;
    readonly formalBackend?: string;
  },
): Promise<VerificationConfig> {
  const raw = await readProjectConfig(cwd);
  let config = parseVerificationConfig(raw);
  config = applyFullMutationFlag(config, fullMutation);
  if (formalFlags) config = applyFormalFlags(config, formalFlags);
  return config;
}

/** List changed files via git (argv, no shell). */
export async function gitChangedFiles(cwd: string): Promise<string[]> {
  const result = await safeSpawn('git', ['diff', '--name-only'], {
    cwd,
    timeoutSeconds: 30,
    maxChars: 500_000,
  });
  if (result.code !== 0) return [];
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function persistVerificationArtifact(
  cwd: string,
  taskId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const file = path.join(cwd, VERIFICATION_ARTIFACT_DIR, `${taskId}.json`);
  await fs.ensureDir(path.dirname(file));
  const prev = (await fs.pathExists(file))
    ? ((await fs.readJson(file)) as Record<string, unknown>)
    : {};
  await fs.writeJson(file, { ...prev, ...patch }, { spaces: 2 });
}

export function gateToAspect(gate?: string): Aspect {
  if (gate === 'build' || gate === 'test' || gate === 'lint') return gate;
  return 'test';
}

export function formatVerdictOutput(verdict: LoopVerdict, verdictJson?: boolean): void {
  if (verdictJson) {
    console.log(JSON.stringify(verdict));
    return;
  }
  console.log(
    `Loop verdict: ${verdict.action} (attempt ${verdict.attempt}, saturated=${verdict.saturated}) — ${verdict.reason}`,
  );
}

export interface RecordFailureArgs {
  readonly cwd: string;
  readonly taskId: string;
  readonly stack: string;
  readonly passed: boolean;
  readonly failedAspect?: Aspect;
  readonly stderr?: string;
  readonly loop: VerificationConfig['loop'];
  readonly verdictJson?: boolean;
}

export async function recordFailureAndVerdict(
  args: RecordFailureArgs,
): Promise<LoopVerdict> {
  const sig =
    args.passed || !args.stderr
      ? undefined
      : failureSignature({
          failedAspect: args.failedAspect ?? 'test',
          stderr: args.stderr,
        });

  const attempt = await appendAttempt(args.cwd, args.taskId, {
    at: new Date().toISOString(),
    passed: args.passed,
    failureSignature: sig,
    failedAspect: args.passed ? undefined : args.failedAspect,
  });

  const history = await getAttempts(args.cwd, args.taskId);
  const verdict = decideNextAction({
    result: { passed: args.passed, failedAspect: args.failedAspect },
    current: attempt,
    history,
    loop: args.loop,
  });

  formatVerdictOutput(verdict, args.verdictJson);
  await persistVerificationArtifact(args.cwd, args.taskId, { verdict });
  return verdict;
}

export interface PostRalphVerificationArgs {
  readonly taskId: string;
  readonly cwd: string;
  readonly stack: string;
  readonly verify?: boolean;
  readonly noVerify?: boolean;
  readonly fullMutation?: boolean;
  readonly verdictJson?: boolean;
  readonly formal?: boolean;
  readonly noFormal?: boolean;
  readonly formalBackend?: string;
}

export interface PostRalphVerificationResult {
  readonly ran: boolean;
  readonly passed: boolean;
  readonly exitCode: number;
  readonly errorMessage?: string;
  readonly verificationResult?: VerificationResult;
  readonly verdict?: LoopVerdict;
}

export async function runPostRalphVerification(
  args: PostRalphVerificationArgs,
  runVerification = createRunVerification(),
): Promise<PostRalphVerificationResult> {
  const config = await loadVerificationConfig(args.cwd, args.fullMutation, {
    formal: args.formal,
    noFormal: args.noFormal,
    formalBackend: args.formalBackend,
  });
  if (!shouldRunVerification({
    verify: args.verify,
    noVerify: args.noVerify,
    configEnabled: config.enabled,
  })) {
    return { ran: false, passed: true, exitCode: 0 };
  }

  try {
    const changedFiles = await gitChangedFiles(args.cwd);
    const verificationResult = await runVerification({
      taskId: args.taskId,
      stack: args.stack,
      cwd: args.cwd,
      config,
      changedFiles,
    } satisfies RunVerificationOptions);

    if (verificationResult.passed) {
      const verdict: LoopVerdict = {
        action: 'DONE',
        attempt: (await getAttempts(args.cwd, args.taskId)).length || 1,
        saturated: false,
        reason: 'verification passed',
      };
      formatVerdictOutput(verdict, args.verdictJson);
      await persistVerificationArtifact(args.cwd, args.taskId, {
        verificationResult,
        verdict,
      });
      return {
        ran: true,
        passed: true,
        exitCode: 0,
        verificationResult,
        verdict,
      };
    }

    const failedAspect = verificationResult.aspects.find((a) => a.verdict === 'FAIL')
      ?.aspect;
    const verdict = await recordFailureAndVerdict({
      cwd: args.cwd,
      taskId: args.taskId,
      stack: args.stack,
      passed: false,
      failedAspect,
      stderr: verificationResult.aspects
        .filter((a) => a.verdict === 'FAIL')
        .map((a) => a.reason)
        .join('\n'),
      loop: config.loop,
      verdictJson: args.verdictJson,
    });

    return {
      ran: true,
      passed: false,
      exitCode: 1,
      verificationResult,
      verdict,
    };
  } catch (err) {
    if (err instanceof FailToPassMissingError) {
      return {
        ran: true,
        passed: false,
        exitCode: 4,
        errorMessage: failToPassMissingMessage(args.taskId),
      };
    }
    if (err instanceof MutationToolNotFoundError) {
      return {
        ran: true,
        passed: false,
        exitCode: 3,
        errorMessage: mutationToolErrorMessage(err.tool, args.stack),
      };
    }
    if (err instanceof FormalToolNotFoundError) {
      return {
        ran: true,
        passed: false,
        exitCode: 5,
        errorMessage: formalToolErrorMessage(err.backend, err.target),
      };
    }
    throw err;
  }
}
