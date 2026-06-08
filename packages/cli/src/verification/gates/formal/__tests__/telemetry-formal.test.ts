import { describe, it, expect } from 'vitest';
import { JsonGraph } from '../../../../graphrag/json-graph.js';
import { recordFormalProof } from '../../../telemetry.js';
import type { FormalVerdict } from '../../../types.js';

const verdict: FormalVerdict = {
  backend: 'dafny',
  verified: true,
  stage: 'none',
  bypassDetected: false,
  repairIterations: 0,
  solverExitCode: 0,
  reason: 'dafny: verified',
  durationMs: 12,
};

describe('recordFormalProof', () => {
  it('creates formal-gate node and proven_by edge', async () => {
    const graph = new JsonGraph(':memory:');
    await graph.init();
    recordFormalProof(graph, 'task-509', verdict);
    expect(graph.getNode('formal-gate:task-509')).toBeTruthy();
    const stats = graph.getStatistics();
    expect(stats.nodesByType['formal-gate']).toBe(1);
    expect(stats.edgesByType.proven_by).toBe(1);
    expect(Number.isNaN(stats.nodesByType['formal-gate'])).toBe(false);
    graph.close();
  });
});
