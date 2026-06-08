import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { JsonGraph } from '../../graphrag/json-graph.js';
import { recordHookTrigger } from '../telemetry.js';

describe('hooks telemetry', () => {
  let graph: JsonGraph;

  beforeEach(async () => {
    const file = path.join(os.tmpdir(), `hook-tel-${Date.now()}.json`);
    graph = new JsonGraph(file);
    await graph.init();
  });

  afterEach(() => graph.close());

  it('records hook node and triggered_by edge', () => {
    recordHookTrigger(graph, {
      event: 'on-save',
      action: 'lint',
      exitCode: 0,
      skipped: false,
      triggeredAt: '2026-06-07T12:00:00.000Z',
    });
    const edges = graph.getEdges('concept:hook:on-save:lint:2026-06-07T12:00:00.000Z', 'out');
    expect(edges.some((e) => e.type === 'references' && e.metadata?.relation === 'triggered_by')).toBe(
      true,
    );
  });

  it('records produced edge when verdict is present', () => {
    recordHookTrigger(graph, {
      event: 'on-task-complete',
      action: 'dare-review',
      exitCode: 0,
      skipped: false,
      verdict: 'pass',
      triggeredAt: '2026-06-07T12:00:01.000Z',
    });
    const hookId = 'concept:hook:on-task-complete:dare-review:2026-06-07T12:00:01.000Z';
    const edges = graph.getEdges(hookId, 'out');
    expect(edges.some((e) => e.type === 'related_to' && e.metadata?.relation === 'produced')).toBe(
      true,
    );
  });

  it('upserts without duplicating nodes on re-register', () => {
    const record = {
      event: 'pre-commit' as const,
      action: 'dare-validate' as const,
      exitCode: 0,
      skipped: false,
      triggeredAt: '2026-06-07T12:00:02.000Z',
    };
    recordHookTrigger(graph, record);
    recordHookTrigger(graph, record);
    const stats = graph.getStatistics();
    expect(stats.totalNodes).toBeLessThanOrEqual(3);
  });
});
