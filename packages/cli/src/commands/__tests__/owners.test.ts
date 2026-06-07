import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { JsonGraph } from '../../graphrag/json-graph.js';
import { buildGraphFromFixture, loadFixture } from '../../__tests__/graphrag/fixtures/dual-graph/build-fixture-graph.js';
import { collectOwners, GraphPathError, GRAPH_PATH_ERROR } from '../graph-queries.js';

describe('owners', () => {
  let graph: JsonGraph;

  beforeEach(async () => {
    const file = path.join(os.tmpdir(), `owners-${Date.now()}.json`);
    graph = new JsonGraph(file);
    await graph.init();
    buildGraphFromFixture(graph, loadFixture('owners-chain'));
  });

  it('rejects unsafe paths with blueprint message', () => {
    expect(() => collectOwners(graph, '../etc/passwd')).toThrow(GraphPathError);
    try {
      collectOwners(graph, '../etc/passwd');
    } catch (e) {
      expect((e as Error).message).toBe(GRAPH_PATH_ERROR);
    }
  });

  it('returns tasks and requirements for a file path (O-02)', () => {
    const result = collectOwners(graph, 'src/commands/execute.ts');
    expect(result.durationMs).toBeLessThan(200);
    const ids = result.owners.map((o) => o.id);
    expect(ids).toContain('task:task-075');
    expect(ids).toContain('task:task-206');
    expect(ids).toContain('requirement:RF-10');
    expect(ids).toContain('requirement:O-02');
  });
});
