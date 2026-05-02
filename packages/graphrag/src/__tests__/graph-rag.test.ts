import { describe, it, expect, beforeEach } from 'vitest';
import { GraphRAG } from '../graph-rag.js';

describe('GraphRAG', () => {
  let graph: GraphRAG;

  beforeEach(async () => {
    // Use in-memory DB for tests
    graph = new GraphRAG(':memory:');
    await graph.init();
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

  it('should search nodes', async () => {
    await graph.addNode({ id: 'search-1', type: 'task', label: 'Find this label' });
    await graph.addNode({ id: 'search-2', type: 'file', label: 'Ignore this one' });
    
    const results = await graph.searchNodes('Find this');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].node.id).toBe('search-1');
  });
});
