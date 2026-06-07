import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { JsonGraph } from '../../graphrag/json-graph.js';
import { ALL_EDGE_TYPES, ALL_NODE_TYPES } from '../../graphrag/types.js';

describe('JsonGraph', () => {
  let filePath: string;
  let graph: JsonGraph;

  beforeEach(async () => {
    filePath = path.join(os.tmpdir(), `dare-json-graph-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    graph = new JsonGraph(filePath);
    await graph.init();
  });

  afterEach(async () => {
    await fs.remove(filePath).catch(() => undefined);
  });

  it('upserts nodes by id', async () => {
    graph.addNode({ id: 'n1', type: 'task', label: 'first' });
    graph.addNode({ id: 'n1', type: 'task', label: 'updated' });
    expect(graph.getNode('n1')?.label).toBe('updated');
  });

  it('searches nodes by label substring', () => {
    graph.addNode({ id: 'a', type: 'task', label: 'authentication module' });
    graph.addNode({ id: 'b', type: 'file', label: 'README.md' });
    const results = graph.searchNodes('auth');
    expect(results.length).toBe(1);
    expect(results[0].node.id).toBe('a');
  });

  it('cascades edge cleanup when a node is deleted', () => {
    graph.addNode({ id: 'a', type: 'task', label: 'a' });
    graph.addNode({ id: 'b', type: 'task', label: 'b' });
    graph.addEdge({ id: 'e1', sourceId: 'a', targetId: 'b', type: 'depends_on' });
    graph.deleteNode('a');
    expect(graph.getEdges('b')).toHaveLength(0);
  });

  it('persists state across instances', async () => {
    graph.addNode({ id: 'a', type: 'task', label: 'persisted' });
    graph.addEdge({ id: 'e', sourceId: 'a', targetId: 'a', type: 'related_to' });

    const reloaded = new JsonGraph(filePath);
    await reloaded.init();
    expect(reloaded.getNode('a')?.label).toBe('persisted');
    expect(reloaded.getEdges('a')).toHaveLength(1);
  });

  it('reports stats by type', () => {
    graph.addNode({ id: 'a', type: 'task', label: 'A' });
    graph.addNode({ id: 'b', type: 'task', label: 'B' });
    graph.addNode({ id: 'c', type: 'file', label: 'C' });
    graph.addEdge({ id: 'e1', sourceId: 'a', targetId: 'c', type: 'implements' });

    const stats = graph.getStatistics();
    expect(stats.totalNodes).toBe(3);
    expect(stats.totalEdges).toBe(1);
    expect(stats.nodesByType.task).toBe(2);
    expect(stats.nodesByType.file).toBe(1);
    expect(stats.edgesByType.implements).toBe(1);
    for (const t of ALL_NODE_TYPES) {
      expect(Number.isNaN(stats.nodesByType[t])).toBe(false);
      if (t !== 'task' && t !== 'file') expect(stats.nodesByType[t]).toBe(0);
    }
    for (const t of ALL_EDGE_TYPES) {
      expect(Number.isNaN(stats.edgesByType[t])).toBe(false);
      if (t !== 'implements') expect(stats.edgesByType[t]).toBe(0);
    }
  });

  it('traverse/locate match standalone traverse.ts', () => {
    graph.addNode({ id: 'task:t1', type: 'task', label: 't1' });
    graph.addNode({
      id: 'code_symbol:src/a.ts::fn',
      type: 'code_symbol',
      label: 'fn',
      metadata: { qualifiedName: 'src/a.ts::fn', path: 'src/a.ts', symbol: 'fn', kind: 'function' },
    });
    graph.addEdge({
      id: 'e1',
      sourceId: 'task:t1',
      targetId: 'code_symbol:src/a.ts::fn',
      type: 'implements',
    });

    const walked = graph.traverse({ seedNodeIds: ['task:t1'], maxHops: 1 });
    expect(walked.nodes.some((n) => n.id === 'code_symbol:src/a.ts::fn')).toBe(true);

    const located = graph.locate('src/a.ts::fn');
    expect(located.candidates[0]?.node.id).toBe('code_symbol:src/a.ts::fn');
    expect(graph.findByQualifiedName('src/a.ts::fn')?.symbol).toBeUndefined();
    expect(graph.findByQualifiedName('src/a.ts::fn')?.metadata?.symbol).toBe('fn');
    expect(graph.findByQualifiedName('missing::x')).toBeNull();
  });

  it('rebuilds qualifiedName index after importFromJson', () => {
    graph.importFromJson({
      nodes: [
        {
          id: 'code_symbol:src/b.ts::run',
          type: 'code_symbol',
          label: 'run',
          metadata: { qualifiedName: 'src/b.ts::run' },
        },
      ],
      edges: [],
    });
    expect(graph.findByQualifiedName('src/b.ts::run')?.id).toBe('code_symbol:src/b.ts::run');
  });

  it('empty graph stats have all types at zero (RNF-05)', () => {
    const stats = graph.getStatistics();
    expect(stats.totalNodes).toBe(0);
    for (const t of ALL_NODE_TYPES) {
      expect(stats.nodesByType[t]).toBe(0);
    }
    for (const t of ALL_EDGE_TYPES) {
      expect(stats.edgesByType[t]).toBe(0);
    }
  });
});
