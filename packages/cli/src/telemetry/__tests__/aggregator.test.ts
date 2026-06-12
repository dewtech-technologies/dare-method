import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonGraph } from '../../graphrag/json-graph.js';
import type { VerificationResult } from '../../verification/types.js';
import { recordVerification } from '../../verification/telemetry.js';
import { recordCostTelemetry } from '../../agent/telemetry.js';
import { aggregateTelemetry } from '../aggregator.js';

describe('aggregateTelemetry', () => {
  let graphPath: string;
  let statePath: string;
  let graph: JsonGraph;

  beforeEach(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-agg-'));
    graphPath = path.join(dir, 'graph.json');
    statePath = path.join(dir, 'state.json');
    graph = new JsonGraph(graphPath);
    await graph.init();
  });

  afterEach(async () => {
    graph.close();
    await fs.remove(path.dirname(graphPath)).catch(() => undefined);
  });

  it('returns_empty_snapshot_with_hints_for_empty_graph', () => {
    const snapshot = aggregateTelemetry(graph, { stateFile: statePath });

    expect(snapshot.dag.total).toBe(0);
    expect(snapshot.dag.ranks).toBe(0);
    expect(snapshot.dag.byStatus).toEqual({});
    expect(snapshot.gates.verified).toBe(0);
    expect(snapshot.gates.proven).toBe(0);
    expect(snapshot.cost.totalUsd).toBe(0);
    expect(snapshot.cost.totalTokens).toBe(0);
    expect(snapshot.cost.byTask).toEqual([]);
    expect(snapshot.bestOfN).toBeUndefined();
    expect(snapshot.guard).toBeUndefined();
    expect(snapshot.drift).toBeUndefined();
    expect(snapshot.emptyHints).toContain('no tasks — run dare execute');
  });

  it('aggregates_full_fixture_from_graph_and_state_without_mutating_graph', () => {
    graph.addNode({
      id: 'task:task-a',
      type: 'task',
      label: 'Task A',
      metadata: { status: 'DONE', attempts: 3 },
    });
    graph.addNode({
      id: 'task:task-b',
      type: 'task',
      label: 'Task B',
      metadata: { status: 'FAILED' },
    });
    graph.addNode({
      id: 'task:task-c',
      type: 'task',
      label: 'Task C',
      metadata: { status: 'PENDING' },
    });
    graph.addEdge({
      id: 'edge:depends:task-c->task-a',
      sourceId: 'task:task-c',
      targetId: 'task:task-a',
      type: 'depends_on',
    });
    graph.addEdge({
      id: 'edge:depends:task-c->task-b',
      sourceId: 'task:task-c',
      targetId: 'task:task-b',
      type: 'depends_on',
    });

    recordCostTelemetry(
      graph,
      'task-a',
      { inputTokens: 100, outputTokens: 50, costUsd: 0.05, model: 'claude-sonnet' },
      3,
    );
    recordCostTelemetry(
      graph,
      'task-b',
      { inputTokens: 20, outputTokens: 10, costUsd: 0.01, model: 'claude-haiku' },
      1,
    );

    const verification: VerificationResult = {
      taskId: 'task-a',
      passed: true,
      mutationScore: 0.8,
      aspects: [
        { aspect: 'mutation', verdict: 'PASS', score: 0.8, reason: 'ok', durationMs: 1 },
      ],
      durationMs: 5,
    };
    recordVerification(graph, verification);

    graph.addEdge({
      id: 'edge:task-b:proven_by',
      sourceId: 'task:task-b',
      targetId: 'formal-gate:task-b',
      type: 'proven_by',
    });
    graph.addNode({
      id: 'formal-gate:task-b',
      type: 'formal-gate',
      label: 'formal task-b',
      metadata: { verified: true },
    });

    graph.addNode({
      id: 'concept:guard:artifact-1',
      type: 'concept',
      label: 'guard scan',
      metadata: { kind: 'guard', verdict: 'PASS' },
    });
    graph.addNode({
      id: 'concept:guard:artifact-2',
      type: 'concept',
      label: 'guard scan warn',
      metadata: { kind: 'guard', verdict: 'WARN' },
    });

    graph.addNode({
      id: 'concept:drift:summary',
      type: 'concept',
      label: 'drift summary',
      metadata: { kind: 'drift', orphanReqs: 2, orphanCode: 1, stale: 3 },
    });

    fs.writeJsonSync(statePath, {
      version: 1,
      updatedAt: '2026-06-11T00:00:00.000Z',
      tasks: {
        'task-a': { status: 'DONE', dependsOn: [] },
        'task-b': { status: 'FAILED', dependsOn: ['task-a'] },
        'task-c': { status: 'IN_PROGRESS', dependsOn: ['task-a', 'task-b'] },
      },
    });

    const before = graph.exportToJson();
    const snapshot = aggregateTelemetry(graph, { stateFile: statePath });
    const after = graph.exportToJson();

    expect(after).toEqual(before);

    expect(snapshot.dag.total).toBe(3);
    expect(snapshot.dag.byStatus).toEqual({
      DONE: 1,
      FAILED: 1,
      IN_PROGRESS: 1,
    });
    expect(snapshot.dag.ranks).toBe(3);

    expect(snapshot.gates.verified).toBe(1);
    expect(snapshot.gates.proven).toBe(1);
    expect(snapshot.gates.mutationAvg).toBeCloseTo(0.8, 5);

    expect(snapshot.cost.totalUsd).toBeCloseTo(0.06, 6);
    expect(snapshot.cost.totalTokens).toBe(180);
    expect(snapshot.cost.byTask).toEqual([
      { id: 'task-a', usd: 0.05, tokens: 150 },
      { id: 'task-b', usd: 0.01, tokens: 30 },
    ]);

    expect(snapshot.bestOfN).toEqual({ tasks: 1, avgCandidates: 3 });
    expect(snapshot.guard).toEqual({ pass: 1, warn: 1, fail: 0 });
    expect(snapshot.drift).toEqual({ orphanReqs: 2, orphanCode: 1, stale: 3 });
    expect(snapshot.emptyHints).not.toContain('no tasks — run dare execute');
  });

  it('prefers_state_json_status_over_graph_metadata', async () => {
    graph.addNode({
      id: 'task:task-x',
      type: 'task',
      label: 'Task X',
      metadata: { status: 'PENDING' },
    });

    await fs.writeJson(statePath, {
      version: 1,
      updatedAt: '2026-06-11T00:00:00.000Z',
      tasks: {
        'task-x': { status: 'DONE', dependsOn: [] },
      },
    });

    const snapshot = aggregateTelemetry(graph, { stateFile: statePath });

    expect(snapshot.dag.byStatus).toEqual({ DONE: 1 });
  });
});
