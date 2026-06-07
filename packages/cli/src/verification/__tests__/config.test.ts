import { describe, it, expect } from 'vitest';
import {
  DEFAULTS,
  parseVerificationConfig,
  VerificationConfigError,
} from '../config.js';

describe('parseVerificationConfig', () => {
  it('should_default_disabled_when_block_absent', () => {
    expect(parseVerificationConfig({})).toEqual({
      ...DEFAULTS,
      enabled: false,
    });
    expect(parseVerificationConfig(undefined)).toEqual({
      ...DEFAULTS,
      enabled: false,
    });
  });

  it('should_merge_partial_block', () => {
    const cfg = parseVerificationConfig({
      verification: {
        enabled: true,
        mutation: { minScore: 0.9 },
      },
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.mutation.minScore).toBe(0.9);
    expect(cfg.mutation.incremental).toBe(DEFAULTS.mutation.incremental);
    expect(cfg.loop.maxAttempts).toBe(DEFAULTS.loop.maxAttempts);
  });

  it('should_throw_on_invalid', () => {
    expect(() =>
      parseVerificationConfig({
        verification: { mutation: { minScore: '70' } },
      }),
    ).toThrow(VerificationConfigError);

    try {
      parseVerificationConfig({
        verification: { mutation: { minScore: '70' } },
      });
    } catch (err) {
      expect(err).toBeInstanceOf(VerificationConfigError);
      const issues = (err as VerificationConfigError).issues;
      expect(issues[0]?.path).toBe('mutation.minScore');
    }
  });

  it('should_reject_out_of_range', () => {
    expect(() =>
      parseVerificationConfig({
        verification: { mutation: { minScore: 1.5 } },
      }),
    ).toThrow(VerificationConfigError);

    expect(() =>
      parseVerificationConfig({
        verification: { bestOfN: { default: 6, max: 3 } },
      }),
    ).toThrow(VerificationConfigError);
  });
});
