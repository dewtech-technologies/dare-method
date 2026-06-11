import { describe, expect, it } from 'vitest';
import {
  defaultSemanticConfigForProject,
  parseSemanticConfig,
  SemanticConfigError,
} from '../../verification/config.js';

describe('parseSemanticConfig', () => {
  it('defaults_when_absent', () => {
    expect(parseSemanticConfig({})).toEqual(defaultSemanticConfigForProject());
    expect(parseSemanticConfig(undefined).enabled).toBe(false);
    expect(parseSemanticConfig(undefined).rrfK).toBe(60);
  });

  it('parses_full_block', () => {
    const cfg = parseSemanticConfig({
      graphrag: {
        backend: 'sqlite',
        semantic: {
          enabled: true,
          model: 'all-MiniLM-L12-v2',
          modelHash: 'sha256:abc123',
          rrfK: 75,
        },
      },
    });

    expect(cfg.enabled).toBe(true);
    expect(cfg.model).toBe('all-MiniLM-L12-v2');
    expect(cfg.modelHash).toBe('sha256:abc123');
    expect(cfg.rrfK).toBe(75);
  });

  it('rejects_non_positive_rrfK', () => {
    expect(() =>
      parseSemanticConfig({
        graphrag: {
          semantic: { rrfK: 0 },
        },
      }),
    ).toThrow(SemanticConfigError);

    expect(() =>
      parseSemanticConfig({
        graphrag: {
          semantic: { rrfK: -1 },
        },
      }),
    ).toThrow(SemanticConfigError);
  });
});
