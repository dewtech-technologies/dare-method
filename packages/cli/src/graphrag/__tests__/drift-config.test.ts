import { describe, expect, it } from 'vitest';
import {
  defaultDriftConfigForProject,
  DriftConfigError,
  parseDriftConfig,
} from '../../verification/config.js';

describe('parseDriftConfig', () => {
  it('defaults_when_absent', () => {
    expect(parseDriftConfig({})).toEqual(defaultDriftConfigForProject());
    expect(parseDriftConfig(undefined).enabled).toBe(false);
  });

  it('parses_full_block', () => {
    const cfg = parseDriftConfig({
      drift: {
        enabled: true,
        maxOrphanReqs: 2,
        maxOrphanCode: 3,
        failOnStale: true,
        ignore: ['src/**', '**/*.gen.ts'],
      },
    });

    expect(cfg.enabled).toBe(true);
    expect(cfg.maxOrphanReqs).toBe(2);
    expect(cfg.maxOrphanCode).toBe(3);
    expect(cfg.failOnStale).toBe(true);
    expect(cfg.ignore).toEqual(['src/**', '**/*.gen.ts']);
  });

  it('rejects_negative_thresholds', () => {
    expect(() =>
      parseDriftConfig({
        drift: { maxOrphanReqs: -1 },
      }),
    ).toThrow(DriftConfigError);

    expect(() =>
      parseDriftConfig({
        drift: { maxOrphanCode: -1 },
      }),
    ).toThrow(DriftConfigError);
  });
});
