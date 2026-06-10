import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import type { TokenUsage } from './driver.js';

function resolveTaskNodeId(taskId: string): string {
  return taskId.startsWith('task:') ? taskId : `task:${taskId}`;
}

export function recordCostTelemetry(
  graph: KnowledgeGraph,
  taskId: string,
  total: TokenUsage,
  attempts: number,
): void {
  const canonicalTaskId = resolveTaskNodeId(taskId);
  const node = graph.getNode(canonicalTaskId) ?? graph.getNode(taskId);
  if (!node) return;

  graph.addNode({
    ...node,
    metadata: {
      ...node.metadata,
      inputTokens: total.inputTokens,
      outputTokens: total.outputTokens,
      costUsd: total.costUsd,
      model: total.model,
      attempts,
    },
  });

  const pendingFlush = graph.flush?.();
  if (pendingFlush) {
    void pendingFlush.catch(() => undefined);
  }
}
