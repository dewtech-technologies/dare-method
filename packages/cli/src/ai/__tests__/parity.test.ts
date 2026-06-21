import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { PARITY_CONTRACTS, parityFor, SEMANTIC_COMMANDS } from '../parity.js';
import { schemaForCommand } from '../schemas.js';

function zodTopLevelKeys(schema: z.ZodTypeAny): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.keys(schema.shape);
  }
  return [];
}

describe('ai/parity', () => {
  it('every_semantic_command_has_contract', () => {
    expect(SEMANTIC_COMMANDS.length).toBe(8);
    for (const command of SEMANTIC_COMMANDS) {
      expect(parityFor(command).command).toBe(command);
    }
  });

  it('schema_fields_exist_in_schemas', () => {
    for (const contract of PARITY_CONTRACTS) {
      const schemaKeys = new Set(zodTopLevelKeys(schemaForCommand(contract.command)));
      for (const field of contract.schemaFields) {
        expect(schemaKeys.has(field), `${contract.command}.${field}`).toBe(true);
      }
    }
  });

  it('parityFor_returns_contract', () => {
    const reverse = parityFor('reverse');
    expect(reverse.skillSlug).toBe('/dare-reverse');
    expect(reverse.terminal).toContain('--ai');
    expect(reverse.artifacts.length).toBeGreaterThan(0);
  });

  it('contracts_cover_all_parity_commands', () => {
    expect(PARITY_CONTRACTS.map((c) => c.command).sort()).toEqual(
      [...SEMANTIC_COMMANDS].sort(),
    );
  });
});
