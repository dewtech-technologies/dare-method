import { describe, it, expect } from 'vitest';
import {
  parseVerificationConfig,
  VerificationConfigError,
} from '../../verification/config.js';

describe('loop.maxDepth config', () => {
  it('defaults_to_2', () => {
    const cfg = parseVerificationConfig({
      verification: { enabled: true },
    });
    expect(cfg.loop.maxDepth).toBe(2);
  });

  it('parses_custom', () => {
    const cfg = parseVerificationConfig({
      verification: {
        enabled: true,
        loop: { maxDepth: 5 },
      },
    });
    expect(cfg.loop.maxDepth).toBe(5);
  });

  it('rejects_zero_or_negative', () => {
    expect(() =>
      parseVerificationConfig({
        verification: { loop: { maxDepth: 0 } },
      }),
    ).toThrow(VerificationConfigError);

    expect(() =>
      parseVerificationConfig({
        verification: { loop: { maxDepth: -1 } },
      }),
    ).toThrow(VerificationConfigError);
  });
});
