import { describe, it, expect } from 'vitest';
import { initAstLoader, loadGrammar } from '../loader.js';
import { resolveWasmPath } from '../paths.js';

describe('ast/loader', () => {
  it('initAstLoader returns status without throwing', async () => {
    const status = await initAstLoader();
    expect(typeof status.available).toBe('boolean');
    expect(Array.isArray(status.loadedLanguages)).toBe(true);
    if (!status.available) {
      expect(status.reason).toBeTruthy();
    }
  });

  it('resolveWasmPath returns null for missing grammar file', async () => {
    const p = await resolveWasmPath('tree-sitter-not-a-real-lang.wasm' as 'tree-sitter.wasm');
    expect(p).toBeNull();
  });

  it('loadGrammar resolves typescript grammar when deps present', async () => {
    const status = await initAstLoader();
    if (!status.available) return;
    const grammar = await loadGrammar('typescript');
    expect(grammar).not.toBeNull();
  });
});
