import { describe, it, expect } from 'vitest';
import {
  parseGuardConfig,
  GuardConfigError,
  defaultGuardConfigForProject,
} from '../config.js';

describe('parseGuardConfig', () => {
  it('defaults_when_absent', () => {
    expect(parseGuardConfig({})).toEqual(defaultGuardConfigForProject());
    expect(parseGuardConfig(undefined).enabled).toBe(false);
  });

  it('parses_full_block', () => {
    const cfg = parseGuardConfig({
      guard: {
        enabled: true,
        onExecute: false,
        unicode: 'block',
        trustedPaths: ['DARE/**'],
        signing: { enabled: true, publicKey: 'minisign.pub' },
      },
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.onExecute).toBe(false);
    expect(cfg.unicode).toBe('block');
    expect(cfg.trustedPaths).toEqual(['DARE/**']);
    expect(cfg.signing.enabled).toBe(true);
    expect(cfg.signing.publicKey).toBe('minisign.pub');
  });

  it('rejects_invalid_unicode_mode', () => {
    expect(() =>
      parseGuardConfig({ guard: { unicode: 'invalid' } }),
    ).toThrow(GuardConfigError);
  });

  it('disabled_skips_guard', () => {
    const cfg = parseGuardConfig({ guard: { enabled: false } });
    expect(cfg.enabled).toBe(false);
    expect(cfg.onExecute).toBe(true);
  });
});
