import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { JsonGraph } from '../../graphrag/json-graph.js';
import type { KnowledgeGraph } from '../../graphrag/knowledge-graph.js';
import type { GraphEdge, GraphNode } from '../../graphrag/types.js';
import { recordVerification } from '../../verification/telemetry.js';
import type { VerificationResult } from '../../verification/types.js';

function sampleResult(taskId: string): VerificationResult {
  return {
    taskId,
    passed: true,
    aspects: [{ aspect: 'mutation', verdict: 'PASS', score: 0.9, reason: 'ok', durationMs: 1 }],
    mutationScore: 0.9,
    durationMs: 10,
  };
}

class RejectingGraph implements KnowledgeGraph {
  private readonly inner: JsonGraph;

  constructor(filePath: string) {
    this.inner = new JsonGraph(filePath);
  }

  async init(): Promise<void> {
    await this.inner.init();
  }

  addNode(node: GraphNode): void {
    if (node.type === 'gate') throw new Error('unsupported node type: gate');
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
    if (edge.type === 'verified_by') throw new Error('unsupported edge type');
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

  close(): void {
    this.inner.close();
  }
}

describe('execute telemetry wire (RF-10)', () => {
  let filePath: string;
  let graph: JsonGraph;

  beforeEach(async () => {
    filePath = path.join(os.tmpdir(), `dare-exec-tel-${Date.now()}.json`);
    graph = new JsonGraph(filePath);
    await graph.init();
    graph.addNode({ id: 'task:task-075', type: 'task', label: 'task-075' });
  });

  afterEach(async () => {
    graph.close();
    await fs.remove(filePath).catch(() => undefined);
  });

  it('should_record_gate_and_verified_by_on_done', () => {
    recordVerification(graph, sampleResult('task-075'));
    expect(graph.getNode('gate:task-075')).toBeDefined();
    const edges = graph.getEdges('task:task-075', 'out');
    expect(edges.some((e) => e.type === 'verified_by')).toBe(true);
  });

  it('should_fallback_without_failing_task', async () => {
    const rejecting = new RejectingGraph(filePath);
    await rejecting.init();
    rejecting.addNode({ id: 'task:task-fb', type: 'task', label: 'task-fb' });

    recordVerification(rejecting, sampleResult('task-fb'));

    const task = rejecting.getNode('task:task-fb');
    expect((task?.metadata?.verification as { passed: boolean }).passed).toBe(true);
    expect(rejecting.getNode('gate:task-fb')).toBeNull();
  });
});
