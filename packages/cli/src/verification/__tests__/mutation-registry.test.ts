import { describe, it, expect } from 'vitest';
import {
  adapterForStack,
  listMutationAdapters,
} from '../registry.js';
import { UnknownMutationStackError } from '../gates/mutation/adapter.js';

describe('mutation registry', () => {
  it('should_resolve_stryker_for_node', async () => {
    const adapter = await adapterForStack('node-nestjs');
    expect(adapter.tool).toBe('stryker');
    expect(adapter.stacks).toContain('mcp-server-node-ts');
  });

  it('should_resolve_mutmut_for_python', async () => {
    const adapter = await adapterForStack('python-fastapi');
    expect(adapter.tool).toBe('mutmut');
  });

  it('should_throw_unknown_stack', async () => {
    await expect(adapterForStack('go-gin')).rejects.toThrow(
      UnknownMutationStackError,
    );
  });

  it('should_list_all_adapters', async () => {
    const adapters = await listMutationAdapters();
    const tools = adapters.map((a) => a.tool).sort();
    expect(tools).toEqual([
      'cargo-mutants',
      'infection',
      'mutmut',
      'stryker',
    ]);
  });
});
