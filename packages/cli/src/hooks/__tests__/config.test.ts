import { describe, it, expect } from 'vitest';
import {
  HOOK_DEFAULTS,
  parseHookConfig,
  HookConfigError,
  seedHooksDefaultsIfAbsent,
} from '../config.js';

describe('parseHookConfig', () => {
  it('returns inert defaults when hooks block is absent', () => {
    expect(parseHookConfig({})).toEqual({ on: {}, trusted: false });
    expect(parseHookConfig({ verification: { enabled: false } })).toEqual({
      on: {},
      trusted: false,
    });
    expect(parseHookConfig(undefined)).toEqual({ on: {}, trusted: false });
  });

  it('parses valid hooks block', () => {
    const cfg = parseHookConfig({
      hooks: {
        on: { 'on-save': [{ action: 'lint' }] },
        trusted: true,
      },
    });
    expect(cfg.trusted).toBe(true);
    expect(cfg.on['on-save']).toEqual([{ action: 'lint' }]);
  });

  it('rejects invalid hook event', () => {
    expect(() =>
      parseHookConfig({ hooks: { on: { 'on-deploy': [] } } }),
    ).toThrow(HookConfigError);

    try {
      parseHookConfig({ hooks: { on: { 'on-deploy': [] } } });
    } catch (err) {
      expect(err).toBeInstanceOf(HookConfigError);
      const issues = (err as HookConfigError).issues;
      expect(issues.some((i) => i.path.includes('on-deploy'))).toBe(true);
      expect((err as Error).message).toMatch(/^Invalid hooks config:/);
    }
  });

  it('rejects invalid action key', () => {
    expect(() =>
      parseHookConfig({
        hooks: { on: { 'on-save': [{ action: 'rm-rf' }] } },
      }),
    ).toThrow(HookConfigError);
  });

  it('rejects path-escape args', () => {
    expect(() =>
      parseHookConfig({
        hooks: {
          on: {
            'on-save': [{ action: 'lint', args: ['../../etc/passwd'] }],
          },
        },
      }),
    ).toThrow();
  });
});

describe('seedHooksDefaultsIfAbsent', () => {
  it('inserts inert block when absent', () => {
    const cfg: Record<string, unknown> = {};
    expect(seedHooksDefaultsIfAbsent(cfg)).toBe(true);
    expect(cfg.hooks).toEqual(HOOK_DEFAULTS);
    expect(seedHooksDefaultsIfAbsent(cfg)).toBe(false);
  });
});
