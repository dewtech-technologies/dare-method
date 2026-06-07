import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import type { GraphEdge, GraphNode } from '../graphrag/types.js';
import type { VerificationResult } from './types.js';

const GATE_NODE_TYPE = 'gate' as const;
const VERIFIED_BY_EDGE = 'verified_by' as const;

export interface VerificationTelemetrySummary {
  readonly passed: boolean;
  readonly mutationScore?: number;
  readonly aspects: ReadonlyArray<{
    readonly aspect: string;
    readonly verdict: string;
    readonly score?: number;
  }>;
  readonly durationMs: number;
}

function summarizeResult(result: VerificationResult): VerificationTelemetrySummary {
  return {
    passed: result.passed,
    mutationScore: result.mutationScore,
    aspects: result.aspects.map((a) => ({
      aspect: a.aspect,
      verdict: a.verdict,
      score: a.score,
    })),
    durationMs: result.durationMs,
  };
}

function gateNode(taskId: string, result: VerificationResult): GraphNode {
  return {
    id: `gate:${taskId}`,
    type: GATE_NODE_TYPE,
    label: `verification ${taskId}`,
    metadata: {
      passed: result.passed,
      mutationScore: result.mutationScore,
      aspects: result.aspects,
      durationMs: result.durationMs,
    },
  };
}

function verifiedByEdge(taskId: string): GraphEdge {
  return {
    id: `edge:${taskId}:verified_by`,
    sourceId: `task:${taskId}`,
    targetId: `gate:${taskId}`,
    type: VERIFIED_BY_EDGE,
  };
}

function fallbackToTaskMetadata(
  graph: KnowledgeGraph,
  taskId: string,
  result: VerificationResult,
): void {
  const taskNodeId = `task:${taskId}`;
  const existing = graph.getNode(taskNodeId);
  const summary = summarizeResult(result);

  if (!existing) {
    graph.addNode({
      id: taskNodeId,
      type: 'task',
      label: taskId,
      metadata: { verification: summary },
    });
    return;
  }

  graph.addNode({
    ...existing,
    metadata: {
      ...existing.metadata,
      verification: summary,
    },
  });
}

/**
 * Records verification verdict in GraphRAG: gate node + verified_by edge.
 * Falls back to task.metadata.verification when the backend rejects new types.
 */
export function recordVerification(
  graph: KnowledgeGraph,
  result: VerificationResult,
): void {
  const taskId = result.taskId;

  try {
    graph.addNode(gateNode(taskId, result));
    graph.addEdge(verifiedByEdge(taskId));
  } catch {
    fallbackToTaskMetadata(graph, taskId, result);
  }
}
