import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { JsonGraph } from '../../graphrag/json-graph.js';

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
  });
});
