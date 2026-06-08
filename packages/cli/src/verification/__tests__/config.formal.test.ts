import { describe, it, expect } from 'vitest';
import {
  parseVerificationConfig,
  VerificationConfigError,
  FORMAL_DEFAULTS,
} from '../config.js';

describe('verification.formal config', () => {
  it('bloco verification ausente ⇒ formal.enabled false (RNF-01)', () => {
    const cfg = parseVerificationConfig({});
    expect(cfg.formal.enabled).toBe(false);
    expect(cfg.formal.backend).toBe('dafny');
  });

  it('verification presente sem bloco formal ⇒ FORMAL_DEFAULTS', () => {
    const cfg = parseVerificationConfig({ verification: { enabled: true } });
    expect(cfg.formal).toEqual(FORMAL_DEFAULTS);
  });

  it('merge parcial preenche defaults', () => {
    const cfg = parseVerificationConfig({
      verification: {
        enabled: true,
        formal: { enabled: true, modules: ['src/a.ts::f'] },
      },
    });
    expect(cfg.formal.enabled).toBe(true);
    expect(cfg.formal.backend).toBe('dafny');
    expect(cfg.formal.proofTimeoutSeconds).toBe(120);
  });

  it('backend fora do enum ⇒ erro zod com path formal.backend', () => {
    try {
      parseVerificationConfig({ verification: { formal: { backend: 'coq' } } });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(VerificationConfigError);
      expect(
        (e as VerificationConfigError).issues.some((i) => i.path === 'formal.backend'),
      ).toBe(true);
    }
  });

  it('.strict() rejeita chave desconhecida em formal', () => {
    expect(() =>
      parseVerificationConfig({ verification: { formal: { wat: 1 } } }),
    ).toThrow(VerificationConfigError);
  });
});
