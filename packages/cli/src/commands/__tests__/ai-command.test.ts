import { describe, it, expect } from 'vitest';
import { listProviderNames } from '../../ai/registry.js';

describe('dare ai command surface', () => {
  it('lists_all_terminal_providers', () => {
    expect(listProviderNames()).toEqual([
      'codex',
      'claude-code',
      'cursor-cli',
      'antigravity-cli',
      'mock',
    ]);
  });
});
