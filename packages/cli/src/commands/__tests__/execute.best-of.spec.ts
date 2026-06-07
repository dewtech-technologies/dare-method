import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateBestOf,
  validatePolicy,
  applyPolicyOverride,
  resolveBestOfCount,
} from '../execute-verification.js';
import { DEFAULTS } from '../../verification/config.js';

describe('execute best-of flags', () => {
  it('should_reject_best_of_out_of_range', () => {
    expect(validateBestOf(0, 5)).toBe('Error: --best-of must be between 1 and 5 (got 0)');
    expect(validateBestOf(6, 5)).toBe('Error: --best-of must be between 1 and 5 (got 6)');
    expect(validateBestOf(3, 5)).toBeUndefined();
  });

  it('should_reject_invalid_policy', () => {
    expect(validatePolicy('linear')).toBe(
      "Error: --policy must be 'decay' or 'fixed' (got 'linear')",
    );
    expect(validatePolicy('decay')).toBeUndefined();
    expect(validatePolicy('fixed')).toBeUndefined();
  });

  it('should_apply_policy_override', () => {
    const cfg = applyPolicyOverride(DEFAULTS, 'fixed');
    expect(cfg.loop.policy).toBe('fixed');
  });

  it('should_default_best_of_from_config', () => {
    expect(resolveBestOfCount(undefined, DEFAULTS)).toBe(1);
    expect(resolveBestOfCount(3, DEFAULTS)).toBe(3);
  });
});
