import { describe, expect, it } from 'vitest';
import { getRunner, registerRunner, COMMAND_RUNNERS } from '../types.js';
import type { CommandRunResult } from '../types.js';

describe('core/commands/types', () => {
  it('getRunner throws when command is not registered', () => {
    expect(() => getRunner('reverse')).toThrow(/No command runner registered/);
  });

  it('registerRunner and getRunner round-trip', async () => {
    const result: CommandRunResult = {
      command: 'dna',
      ok: true,
      facts: { sample: true },
      artifacts: ['DARE/dna-facts.json'],
    };
    registerRunner('dna', async () => result);
    const runner = getRunner('dna');
    await expect(runner({ cwd: '/tmp' })).resolves.toEqual(result);
    delete COMMAND_RUNNERS.dna;
  });
});
