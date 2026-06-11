import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { JsonGraph } from '../../graphrag/json-graph.js';
import type { KnowledgeGraph } from '../../graphrag/knowledge-graph.js';
import type { GraphEdge, GraphNode } from '../../graphrag/types.js';
import type { VerificationResult } from '../types.js';
import { recordVerification } from '../telemetry.js';

function sampleResult(taskId: string): VerificationResult {
  return {
    taskId,
    passed: true,
    aspects: [
      { aspect: 'test', verdict: 'PASS', reason: 'ok', durationMs: 2 },
      { aspect: 'mutation', verdict: 'PASS', score: 0.82, reason: 'ok', durationMs: 3 },
    ],
    mutationScore: 0.82,
    durationMs: 10,
  };
}

class RejectingGraph implements KnowledgeGraph {
  private readonly inner: JsonGraph;
  private rejectNewTypes = true;

  constructor(filePath: string) {
    this.inner = new JsonGraph(filePath);
  }

  async init(): Promise<void> {
    await this.inner.init();
  }

  setRejectNewTypes(value: boolean): void {
    this.rejectNewTypes = value;
  }

  addNode(node: GraphNode): void {
    if (this.rejectNewTypes && node.type === 'gate') {
      throw new Error('unsupported node type: gate');
    }
    this.inner.addNode(node);
  }

  getNode(id: string): GraphNode | null {
    return this.inner.getNode(id);
  }

  queryNodes(type?: GraphNode['type'], limit?: number): GraphNode[] {
    return this.inner.queryNodes(type, limit);
  }

  searchNodes(query: string, limit?: number) {
    return this.inner.searchNodes(query, limit);
  }

  deleteNode(id: string): void {
    this.inner.deleteNode(id);
  }

  addEdge(edge: GraphEdge): void {
    if (this.rejectNewTypes && edge.type === 'verified_by') {
      throw new Error('unsupported edge type: verified_by');
    }
    this.inner.addEdge(edge);
  }

  getEdges(nodeId: string, direction?: 'out' | 'in' | 'both'): GraphEdge[] {
    return this.inner.getEdges(nodeId, direction);
  }

  getNodeDependencies(nodeId: string, depth?: number): GraphNode[] {
    return this.inner.getNodeDependencies(nodeId, depth);
  }

  getStatistics() {
    return this.inner.getStatistics();
  }

  exportToJson() {
    return this.inner.exportToJson();
  }

  importFromJson(data: { nodes: GraphNode[]; edges: GraphEdge[] }): void {
    this.inner.importFromJson(data);
  }

  traverse(opts: Parameters<JsonGraph['traverse']>[0]) {
    return this.inner.traverse(opts);
  }

  locate(seed: string, opts?: Parameters<JsonGraph['locate']>[1]) {
    return this.inner.locate(seed, opts);
  }

  findByQualifiedName(qn: string) {
    return this.inner.findByQualifiedName(qn);
  }

  loadVectors() {
    return this.inner.loadVectors();
  }

  close(): void {
    this.inner.close();
  }
}

describe('recordVerification', () => {
  let filePath: string;
  let graph: JsonGraph;

  beforeEach(async () => {
    filePath = path.join(
      os.tmpdir(),
      `dare-telemetry-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    graph = new JsonGraph(filePath);
    await graph.init();
    graph.addNode({ id: 'task:task-070', type: 'task', label: 'task-070' });
  });

  afterEach(async () => {
    await fs.remove(filePath).catch(() => undefined);
  });

  it('should_add_gate_node_and_verified_by_edge', () => {
    recordVerification(graph, sampleResult('task-070'));

    const gate = graph.getNode('gate:task-070');
    expect(gate?.type).toBe('gate');
    expect(gate?.metadata?.passed).toBe(true);
    expect(gate?.metadata?.mutationScore).toBe(0.82);

    const edges = graph.getEdges('task:task-070', 'out');
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe('verified_by');
    expect(edges[0].targetId).toBe('gate:task-070');
  });

  it('should_fallback_to_task_metadata', async () => {
    const rejecting = new RejectingGraph(filePath);
    await rejecting.init();
    rejecting.addNode({ id: 'task:task-fb', type: 'task', label: 'task-fb' });

    recordVerification(rejecting, sampleResult('task-fb'));

    const task = rejecting.getNode('task:task-fb');
    const verification = task?.metadata?.verification as { passed: boolean };
    expect(verification.passed).toBe(true);
    expect(rejecting.getNode('gate:task-fb')).toBeNull();
  });

  it('should_be_idempotent', () => {
    const result = sampleResult('task-idem');
    graph.addNode({ id: 'task:task-idem', type: 'task', label: 'task-idem' });

    recordVerification(graph, result);
    recordVerification(graph, result);

    const stats = graph.getStatistics();
    expect(stats.nodesByType.gate).toBe(1);
    expect(stats.edgesByType.verified_by).toBe(1);
  });
});
