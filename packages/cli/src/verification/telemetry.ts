import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import type { GraphEdge, GraphNode } from '../graphrag/types.js';
import type { VerificationResult } from './types.js';
import type { FormalVerdict } from './types.js';

const GATE_NODE_TYPE = 'gate' as const;
const FORMAL_GATE_NODE_TYPE = 'formal-gate' as const;
const VERIFIED_BY_EDGE = 'verified_by' as const;
const PROVEN_BY_EDGE = 'proven_by' as const;

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

function formalGateNode(taskId: string, verdict: FormalVerdict): GraphNode {
  return {
    id: `formal-gate:${taskId}`,
    type: FORMAL_GATE_NODE_TYPE,
    label: `formal proof ${taskId}`,
    metadata: {
      backend: verdict.backend,
      verified: verdict.verified,
      stage: verdict.stage,
      bypassDetected: verdict.bypassDetected,
      repairIterations: verdict.repairIterations,
      solverExitCode: verdict.solverExitCode,
      durationMs: verdict.durationMs,
    },
  };
}

function provenByEdge(taskId: string): GraphEdge {
  return {
    id: `edge:${taskId}:proven_by`,
    sourceId: `task:${taskId}`,
    targetId: `formal-gate:${taskId}`,
    type: PROVEN_BY_EDGE,
  };
}

/** Grava aresta task --proven_by--> formal-gate; fallback em task.metadata.formalProof (RF-09). */
export function recordFormalProof(
  graph: KnowledgeGraph,
  taskId: string,
  verdict: FormalVerdict,
): void {
  try {
    graph.addNode(formalGateNode(taskId, verdict));
    graph.addEdge(provenByEdge(taskId));
  } catch {
    const taskNodeId = `task:${taskId}`;
    const existing = graph.getNode(taskNodeId);
    const base = existing ?? {
      id: taskNodeId,
      type: 'task' as const,
      label: taskId,
      metadata: {},
    };
    graph.addNode({
      ...base,
      metadata: { ...base.metadata, formalProof: verdict },
    });
  }
}
