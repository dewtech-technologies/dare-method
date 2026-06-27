import { describe, expect, it } from 'vitest';
import { getRunner } from '../index.js';

describe('core/commands registration', () => {
  it('loads all semantic command runners via index imports', () => {
    for (const cmd of [
      'reverse',
      'dna',
      'migrate',
      'design',
      'patterns',
      'blueprint',
      'review',
      'refine',
    ] as const) {
      expect(() => getRunner(cmd)).not.toThrow();
    }
  });
});
