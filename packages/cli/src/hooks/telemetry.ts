import pino from 'pino';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import type { HookResult } from './types.js';

const logger = pino({ level: process.env.DARE_HOOKS_LOG_LEVEL ?? 'info' });

export interface HookTelemetryRecord {
  readonly event: HookResult['event'];
  readonly action: HookResult['action'];
  readonly exitCode: number;
  readonly skipped: boolean;
  readonly verdict?: 'pass' | 'fail';
  readonly triggeredAt: string;
}

function hookNodeId(event: string, action: string, triggeredAt: string): string {
  return `concept:hook:${event}:${action}:${triggeredAt}`;
}

function eventNodeId(event: string): string {
  return `concept:event:${event}`;
}

function verdictNodeId(verdict: 'pass' | 'fail'): string {
  return `concept:verdict:${verdict}`;
}

export function recordHookTrigger(graph: KnowledgeGraph, record: HookTelemetryRecord): void {
  const hookId = hookNodeId(record.event, record.action, record.triggeredAt);
  const eventId = eventNodeId(record.event);

  graph.addNode({
    id: hookId,
    type: 'concept',
    label: `hook:${record.event}:${record.action}`,
    metadata: {
      kind: 'hook',
      event: record.event,
      action: record.action,
      verdict: record.verdict,
      exitCode: record.exitCode,
      skipped: record.skipped,
      triggeredAt: record.triggeredAt,
    },
  });

  graph.addNode({
    id: eventId,
    type: 'concept',
    label: record.event,
    metadata: { kind: 'hook_event', event: record.event },
  });

  graph.addEdge({
    id: `references:${hookId}->${eventId}`,
    sourceId: hookId,
    targetId: eventId,
    type: 'references',
    metadata: { relation: 'triggered_by' },
  });

  if (record.verdict) {
    const verdictId = verdictNodeId(record.verdict);
    graph.addNode({
      id: verdictId,
      type: 'concept',
      label: record.verdict,
      metadata: { kind: 'hook_verdict', verdict: record.verdict },
    });
    graph.addEdge({
      id: `related_to:${hookId}->${verdictId}`,
      sourceId: hookId,
      targetId: verdictId,
      type: 'related_to',
      metadata: { relation: 'produced' },
    });
  }

  logger.info(
    {
      event: record.event,
      action: record.action,
      exitCode: record.exitCode,
      skipped: record.skipped,
      verdict: record.verdict,
    },
    'hook telemetry recorded',
  );
}
