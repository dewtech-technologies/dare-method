import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { GraphRAG } from '../../graphrag/graph-rag.js';

describe('GraphRAG', () => {
  let graph: GraphRAG;
  let dbPath: string;

  beforeEach(async () => {
    // Use a unique temp file per test (sql.js .save() always writes to disk)
    dbPath = path.join(os.tmpdir(), `dare-graphrag-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    graph = new GraphRAG(dbPath);
    await graph.init();
  });

  afterEach(async () => {
    await fs.remove(dbPath).catch(() => undefined);
  });

  it('should add and retrieve a node', async () => {
    await graph.addNode({
      id: 'test-node-1',
      type: 'task',
      label: 'Test Task',
      description: 'A test task',
      metadata: { status: 'PENDING' }
    });

    const node = await graph.getNode('test-node-1');
    expect(node).toBeDefined();
    expect(node?.id).toBe('test-node-1');
    expect(node?.label).toBe('Test Task');
  });

  it('should add and retrieve an edge', async () => {
    await graph.addNode({ id: 'node-1', type: 'task', label: 'Node 1' });
    await graph.addNode({ id: 'node-2', type: 'task', label: 'Node 2' });
    
    await graph.addEdge({
      id: 'edge-1',
      sourceId: 'node-1',
      targetId: 'node-2',
      type: 'depends_on'
    });

    const edges = await graph.getEdges('node-1');
    expect(edges.length).toBe(1);
    expect(edges[0].targetId).toBe('node-2');
  });

  it('traverse, locate and findByQualifiedName delegate to traverse.ts', async () => {
    graph.addNode({
      id: 'code_symbol:src/x.ts::main',
      type: 'code_symbol',
      label: 'main',
      metadata: { qualifiedName: 'src/x.ts::main', path: 'src/x.ts', symbol: 'main', kind: 'function' },
    });
    graph.addNode({ id: 'task:t9', type: 'task', label: 't9' });
    graph.addEdge({
      id: 'e9',
      sourceId: 'task:t9',
      targetId: 'code_symbol:src/x.ts::main',
      type: 'implements',
    });

    const walked = graph.traverse({ seedNodeIds: ['task:t9'], maxHops: 1 });
    expect(walked.nodes.some((n) => n.id === 'code_symbol:src/x.ts::main')).toBe(true);
    expect(graph.findByQualifiedName('src/x.ts::main')?.id).toBe('code_symbol:src/x.ts::main');
    expect(graph.locate('main').candidates.length).toBeGreaterThan(0);
  });

  it('empty graph stats have all types at zero (RNF-05)', () => {
    const stats = graph.getStatistics();
    expect(stats.totalNodes).toBe(0);
    for (const count of Object.values(stats.nodesByType)) {
      expect(count).toBe(0);
      expect(Number.isNaN(count)).toBe(false);
    }
    for (const count of Object.values(stats.edgesByType)) {
      expect(count).toBe(0);
      expect(Number.isNaN(count)).toBe(false);
    }
  });

  it('should search nodes', async () => {
    await graph.addNode({ id: 'search-1', type: 'task', label: 'Find this label' });
    await graph.addNode({ id: 'search-2', type: 'file', label: 'Ignore this one' });
    
    const results = await graph.searchNodes('Find this');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].node.id).toBe('search-1');
  });
});
