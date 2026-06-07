import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { JsonGraph } from '../json-graph.js';
import { locate } from '../traverse.js';

describe('locate', () => {
  let graph: JsonGraph;

  beforeEach(async () => {
    const file = path.join(os.tmpdir(), `locate-${Date.now()}.json`);
    graph = new JsonGraph(file);
    await graph.init();
    graph.addNode({
      id: 'code_symbol:src/math.ts::add',
      type: 'code_symbol',
      label: 'add',
      metadata: { qualifiedName: 'src/math.ts::add', path: 'src/math.ts' },
    });
    graph.addNode({ id: 'file:src/math.ts', type: 'file', label: 'math' });
    graph.addEdge({
      id: 'contains:file->sym',
      sourceId: 'file:src/math.ts',
      targetId: 'code_symbol:src/math.ts::add',
      type: 'contains',
    });
  });

  afterEach(() => graph.close());

  it('resolves qualifiedName with score 1.0', () => {
    const result = locate(graph, 'src/math.ts::add');
    expect(result.candidates[0]?.score).toBe(1.0);
    expect(result.candidates[0]?.node.id).toBe('code_symbol:src/math.ts::add');
  });

  it('throws on path escape seed', () => {
    expect(() => locate(graph, '../etc/passwd')).toThrow(/must not contain|Path escape/i);
  });

  it('respects limit default', () => {
    for (let i = 0; i < 15; i++) {
      graph.addNode({ id: `file:f${i}.ts`, type: 'file', label: `f${i}` });
    }
    const result = locate(graph, 'math', { limit: 5 });
    expect(result.candidates.length).toBeLessThanOrEqual(5);
  });
});
