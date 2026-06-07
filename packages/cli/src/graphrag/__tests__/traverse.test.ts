import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { JsonGraph } from '../json-graph.js';
import { traverse } from '../traverse.js';

describe('traverse', () => {
  let graph: JsonGraph;

  beforeEach(async () => {
    const file = path.join(os.tmpdir(), `traverse-${Date.now()}.json`);
    graph = new JsonGraph(file);
    await graph.init();
    graph.addNode({ id: 'task:t1', type: 'task', label: 't1' });
    graph.addNode({ id: 'file:a.ts', type: 'file', label: 'a' });
    graph.addNode({ id: 'code_symbol:a.ts::fn', type: 'code_symbol', label: 'fn' });
    graph.addNode({ id: 'task:t2', type: 'task', label: 't2' });
    for (let i = 0; i < 60; i++) {
      graph.addNode({ id: `file:extra${i}.ts`, type: 'file', label: `e${i}` });
      graph.addEdge({
        id: `implements:t1->extra${i}`,
        sourceId: 'task:t1',
        targetId: `file:extra${i}.ts`,
        type: 'implements',
      });
    }
    graph.addEdge({
      id: 'implements:t1->a',
      sourceId: 'task:t1',
      targetId: 'file:a.ts',
      type: 'implements',
    });
    graph.addEdge({
      id: 'contains:a->sym',
      sourceId: 'file:a.ts',
      targetId: 'code_symbol:a.ts::fn',
      type: 'contains',
    });
    graph.addEdge({
      id: 'depends:t2->t1',
      sourceId: 'task:t2',
      targetId: 'task:t1',
      type: 'depends_on',
    });
  });

  afterEach(() => graph.close());

  it('respects maxFanout clamp', () => {
    const result = traverse(graph, {
      seedNodeIds: ['task:t1'],
      maxHops: 1,
      maxFanout: 5,
      direction: 'out',
    });
    expect(result.edges.length).toBeLessThanOrEqual(5);
  });

  it('filters by edgeTypes and nodeTypes', () => {
    const result = traverse(graph, {
      seedNodeIds: ['file:a.ts'],
      maxHops: 1,
      edgeTypes: ['contains'],
      nodeTypes: ['code_symbol'],
      direction: 'out',
    });
    expect(result.nodes.some((n) => n.type === 'code_symbol')).toBe(true);
    expect(result.edges.every((e) => e.type === 'contains')).toBe(true);
  });

  it('returns deterministic ordering', () => {
    const a = traverse(graph, { seedNodeIds: ['task:t1'], maxHops: 1, maxFanout: 3 });
    const b = traverse(graph, { seedNodeIds: ['task:t1'], maxHops: 1, maxFanout: 3 });
    expect(a).toEqual(b);
  });
});
