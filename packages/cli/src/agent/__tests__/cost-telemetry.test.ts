import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { TokenUsage } from '../driver.js';
import { JsonGraph } from '../../graphrag/json-graph.js';
import { recordCostTelemetry } from '../telemetry.js';

const sampleUsage: TokenUsage = {
  inputTokens: 120,
  outputTokens: 45,
  costUsd: 0.03125,
  model: 'claude-sonnet',
};

describe('recordCostTelemetry', () => {
  let filePath: string;
  let graph: JsonGraph;

  beforeEach(async () => {
    filePath = path.join(
      os.tmpdir(),
      `dare-cost-telemetry-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    graph = new JsonGraph(filePath);
    await graph.init();
  });

  afterEach(async () => {
    graph.close();
    await fs.remove(filePath).catch(() => undefined);
  });

  it('writes_cost_metadata_on_task_node', () => {
    graph.addNode({
      id: 'task:task-607',
      type: 'task',
      label: 'task-607',
      metadata: { status: 'DONE' },
    });

    recordCostTelemetry(graph, 'task-607', sampleUsage, 3);

    const taskNode = graph.getNode('task:task-607');
    expect(taskNode?.metadata?.status).toBe('DONE');
    expect(taskNode?.metadata?.inputTokens).toBe(120);
    expect(taskNode?.metadata?.outputTokens).toBe(45);
    expect(taskNode?.metadata?.costUsd).toBe(0.03125);
    expect(taskNode?.metadata?.model).toBe('claude-sonnet');
    expect(taskNode?.metadata?.attempts).toBe(3);
  });

  it('is_queryable_via_graph', () => {
    graph.addNode({
      id: 'task:task-608',
      type: 'task',
      label: 'task-608',
    });

    recordCostTelemetry(graph, 'task-608', sampleUsage, 1);

    const fetched = graph.getNode('task:task-608');
    expect(fetched?.metadata?.costUsd).toBe(0.03125);

    const matches = graph.searchNodes('task-608', 5);
    expect(matches.some((entry) => entry.node.id === 'task:task-608')).toBe(true);
    const queried = matches.find((entry) => entry.node.id === 'task:task-608');
    expect(queried?.node.metadata?.inputTokens).toBe(120);
  });

  it('no_throw_on_missing_node', () => {
    expect(() => {
      recordCostTelemetry(graph, 'task-missing', sampleUsage, 2);
    }).not.toThrow();
  });
});
