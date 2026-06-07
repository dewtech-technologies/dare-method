import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { JsonGraph } from '../../graphrag/json-graph.js';
import { buildGraphFromFixture, loadFixture } from '../../__tests__/graphrag/fixtures/dual-graph/build-fixture-graph.js';
import { formatLocateJson } from '../graph-queries.js';

describe('locate command helpers', () => {
  it('hits expected targets in top-5 for locate fixtures (O-04)', async () => {
    const cases = [
      { fixture: 'locate/math', seed: 'math', expected: ['code_symbol:src/math.ts::add'] },
      {
        fixture: 'locate/auth',
        seed: 'auth',
        expected: ['code_symbol:src/auth/login.ts::authenticate', 'file:src/auth/login.ts'],
      },
    ];

    let hits = 0;
    for (const { fixture, seed, expected } of cases) {
      const file = path.join(os.tmpdir(), `locate-cmd-${fixture}-${Date.now()}.json`);
      const graph = new JsonGraph(file);
      await graph.init();
      buildGraphFromFixture(graph, loadFixture(fixture));
      const result = graph.locate(seed, { limit: 5 });
      const topIds = result.candidates.map((c) => c.node.id);
      const hit = expected.some((id) => topIds.includes(id));
      if (hit) hits++;
      const json = formatLocateJson(seed, result);
      expect(json.seed).toBe(seed);
      expect(json.candidates.length).toBeGreaterThan(0);
    }
    expect(hits / cases.length).toBeGreaterThanOrEqual(0.85);
  });
});
