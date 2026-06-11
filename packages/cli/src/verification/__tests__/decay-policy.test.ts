import { describe, it, expect } from 'vitest';
import { decideNextAction, isSaturated } from '../decay/policy.js';
import type { AttemptRecord, LoopConfig } from '../types.js';

const loopBase: LoopConfig = {
  policy: 'decay',
  maxAttempts: 5,
  maxDepth: 2,
  saturationWindow: 3,
  onSaturation: 'fresh-start',
};

function attempt(
  n: number,
  passed: boolean,
  signature?: string,
): AttemptRecord {
  return {
    n,
    at: `2026-06-04T10:0${n}:00Z`,
    passed,
    failureSignature: passed ? undefined : signature,
    failedAspect: passed ? undefined : 'test',
  };
}

describe('isSaturated', () => {
  it('should_require_exact_window_with_same_signature', () => {
    const history = [
      attempt(1, false, 'abc12345'),
      attempt(2, false, 'abc12345'),
    ];
    expect(isSaturated(history, 3)).toBe(false);
    expect(isSaturated([...history, attempt(3, false, 'abc12345')], 3)).toBe(
      true,
    );
  });

  it('should_not_saturate_when_signatures_differ', () => {
    const history = [
      attempt(1, false, 'aaaa1111'),
      attempt(2, false, 'bbbb2222'),
      attempt(3, false, 'aaaa1111'),
    ];
    expect(isSaturated(history, 3)).toBe(false);
  });
});

describe('decideNextAction', () => {
  it('should_return_DONE_when_passed', () => {
    const current = attempt(2, true);
    const verdict = decideNextAction({
      result: { passed: true },
      current,
      history: [attempt(1, false, 'sig'), current],
      loop: loopBase,
    });
    expect(verdict.action).toBe('DONE');
    expect(verdict.reason).toBe('verification passed');
  });

  it('should_ESCALATE_at_max_attempts', () => {
    const current = attempt(5, false, 'deadbeef');
    const verdict = decideNextAction({
      result: { passed: false, failedAspect: 'test' },
      current,
      history: Array.from({ length: 5 }, (_, i) =>
        attempt(i + 1, false, 'deadbeef'),
      ),
      loop: loopBase,
    });
    expect(verdict.action).toBe('ESCALATE');
    expect(verdict.reason).toBe('max attempts reached');
  });

  it('should_FRESH_START_on_saturation', () => {
    const history = [
      attempt(1, false, 'cafebabe'),
      attempt(2, false, 'cafebabe'),
      attempt(3, false, 'cafebabe'),
    ];
    const current = history[2]!;
    const verdict = decideNextAction({
      result: { passed: false },
      current,
      history,
      loop: { ...loopBase, onSaturation: 'fresh-start' },
    });
    expect(verdict.action).toBe('FRESH_START');
    expect(verdict.saturated).toBe(true);
    expect(verdict.reason).toBe('failure saturation: fresh-start');
  });

  it('should_REPLAN_on_saturation', () => {
    const history = [
      attempt(1, false, '11111111'),
      attempt(2, false, '11111111'),
      attempt(3, false, '11111111'),
    ];
    const verdict = decideNextAction({
      result: { passed: false },
      current: history[2]!,
      history,
      loop: { ...loopBase, onSaturation: 'replan' },
    });
    expect(verdict.action).toBe('REPLAN');
    expect(verdict.reason).toBe('failure saturation: replan');
  });

  it('should_ESCALATE_on_saturation_when_configured', () => {
    const history = [
      attempt(1, false, '22222222'),
      attempt(2, false, '22222222'),
      attempt(3, false, '22222222'),
    ];
    const verdict = decideNextAction({
      result: { passed: false },
      current: history[2]!,
      history,
      loop: { ...loopBase, onSaturation: 'escalate' },
    });
    expect(verdict.action).toBe('ESCALATE');
    expect(verdict.reason).toBe('failure saturation: escalate');
  });

  it('should_CONTINUE_under_fixed_policy', () => {
    const current = attempt(2, false, 'abcd0001');
    const verdict = decideNextAction({
      result: { passed: false },
      current,
      history: [attempt(1, false, 'abcd0002'), current],
      loop: { ...loopBase, policy: 'fixed' },
    });
    expect(verdict.action).toBe('CONTINUE');
    expect(verdict.reason).toBe('fixed policy: continue');
    expect(verdict.saturated).toBe(false);
  });

  it('should_CONTINUE_when_not_saturated_decay', () => {
    const current = attempt(2, false, 'sig-a');
    const verdict = decideNextAction({
      result: { passed: false },
      current,
      history: [attempt(1, false, 'sig-b'), current],
      loop: loopBase,
    });
    expect(verdict.action).toBe('CONTINUE');
    expect(verdict.reason).toBe('decay policy: continue');
  });
});
