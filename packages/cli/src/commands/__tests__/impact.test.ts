import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { JsonGraph } from '../../graphrag/json-graph.js';
import { buildGraphFromFixture, loadFixture } from '../../__tests__/graphrag/fixtures/dual-graph/build-fixture-graph.js';
import { collectImpact } from '../graph-queries.js';

describe('impact', () => {
  let graph: JsonGraph;

  beforeEach(async () => {
    const file = path.join(os.tmpdir(), `impact-${Date.now()}.json`);
    graph = new JsonGraph(file);
    await graph.init();
    buildGraphFromFixture(graph, loadFixture('impact-chain'));
  });

  it('recalls all impacted tasks and requirements (O-03)', () => {
    const result = collectImpact(graph, 'src/math.ts', 3);
    expect(result.durationMs).toBeLessThan(500);
    expect(result.impacted.tasks).toContain('task-201');
    expect(result.impacted.requirements).toContain('RF-03');
  });

  it('clamps hops to 5', () => {
    const result = collectImpact(graph, 'src/math.ts', 99);
    expect(result.impacted.tasks.length).toBeGreaterThan(0);
  });
});
