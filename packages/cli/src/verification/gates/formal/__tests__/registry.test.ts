import { describe, it, expect } from 'vitest';
import { backendForConfig } from '../registry.js';
import { FORMAL_DEFAULTS } from '../../../config.js';

describe('formal backend registry', () => {
  it('backend desconhecido ⇒ UnknownFormalBackendError com string EXATA (§5.2)', async () => {
    await expect(
      backendForConfig({
        ...FORMAL_DEFAULTS,
        enabled: true,
        backend: 'coq' as never,
      }),
    ).rejects.toThrowError(
      "Error: unknown formal backend 'coq'. Supported: dafny, verus, lean.",
    );
  });

  it('backendForConfig lazy-load resolve o backend dafny', async () => {
    const b = await backendForConfig({
      ...FORMAL_DEFAULTS,
      enabled: true,
      backend: 'dafny',
    });
    expect(b.backend).toBe('dafny');
    expect(b.minVersion).toBeTruthy();
  });
});
