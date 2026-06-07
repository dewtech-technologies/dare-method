import type {
  AttemptRecord,
  LoopConfig,
  LoopVerdict,
  SaturationAction,
  VerificationResult,
} from '../types.js';

type DecayResult =
  | VerificationResult
  | { readonly passed: boolean; readonly failedAspect?: string };

const SATURATION_ACTION: Readonly<
  Record<SaturationAction, LoopVerdict['action']>
> = {
  'fresh-start': 'FRESH_START',
  replan: 'REPLAN',
  escalate: 'ESCALATE',
};

/** True when the last `window` attempts share the same non-null failureSignature. */
export function isSaturated(
  history: ReadonlyArray<AttemptRecord>,
  window: number,
): boolean {
  if (window < 1 || history.length < window) return false;

  const slice = history.slice(-window);
  const signature = slice[0]?.failureSignature;
  if (!signature) return false;

  return slice.every((record) => record.failureSignature === signature);
}

/** Canonical loop decision (RF-06) — deterministic, no LLM. */
export function decideNextAction(args: {
  readonly result: DecayResult;
  readonly current: AttemptRecord;
  readonly history: ReadonlyArray<AttemptRecord>;
  readonly loop: LoopConfig;
}): LoopVerdict {
  const { result, current, history, loop } = args;

  if (result.passed) {
    return {
      action: 'DONE',
      attempt: current.n,
      saturated: false,
      reason: 'verification passed',
    };
  }

  if (current.n >= loop.maxAttempts) {
    return {
      action: 'ESCALATE',
      attempt: current.n,
      saturated: false,
      reason: 'max attempts reached',
      failureSignature: current.failureSignature,
    };
  }

  const saturated = isSaturated(history, loop.saturationWindow);
  if (saturated) {
    const action = SATURATION_ACTION[loop.onSaturation];
    return {
      action,
      attempt: current.n,
      saturated: true,
      reason: `failure saturation: ${loop.onSaturation}`,
      failureSignature: current.failureSignature,
    };
  }

  if (loop.policy === 'fixed' && current.n < loop.maxAttempts) {
    return {
      action: 'CONTINUE',
      attempt: current.n,
      saturated: false,
      reason: 'fixed policy: continue',
      failureSignature: current.failureSignature,
    };
  }

  return {
    action: 'CONTINUE',
    attempt: current.n,
    saturated: false,
    reason: 'decay policy: continue',
    failureSignature: current.failureSignature,
  };
}
