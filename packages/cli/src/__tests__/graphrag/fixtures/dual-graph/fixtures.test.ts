import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { JsonGraph } from '../../../../graphrag/json-graph.js';
import {
  buildGraphFromFixture,
  listFixturePaths,
  loadFixture,
} from './build-fixture-graph.js';

describe('dual-graph fixtures', () => {
  let filePath: string;
  let graph: JsonGraph;

  beforeEach(async () => {
    filePath = path.join(os.tmpdir(), `dual-graph-fixture-${Date.now()}.json`);
    graph = new JsonGraph(filePath);
    await graph.init();
  });

  afterEach(async () => {
    await fs.remove(filePath).catch(() => undefined);
  });

  it('loads every fixture JSON without dangling edge endpoints', () => {
    const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
    for (const file of listFixturePaths()) {
      const rel = path.relative(fixtureDir, file).replace(/\\/g, '/');
      const fixture = loadFixture(rel);
      expect(fixture.nodes.length).toBeGreaterThan(0);
      expect(fixture.edges.length).toBeGreaterThan(0);

      const nodeIds = new Set(fixture.nodes.map((n) => n.id));
      for (const edge of fixture.edges) {
        expect(nodeIds.has(edge.sourceId)).toBe(true);
        expect(nodeIds.has(edge.targetId)).toBe(true);
        expect(Number.isNaN(edge.weight as number)).toBe(false);
      }

      if (fixture.expect) {
        expect(Object.keys(fixture.expect).length).toBeGreaterThan(0);
      }
    }
  });

  it('buildGraphFromFixture materializes nodes and edges', () => {
    const fixture = loadFixture('impact-chain');
    buildGraphFromFixture(graph, fixture);
    const stats = graph.getStatistics();
    expect(stats.totalNodes).toBe(fixture.nodes.length);
    expect(stats.totalEdges).toBe(fixture.edges.length);
    expect(graph.findByQualifiedName('src/math.ts::add')?.id).toBe(
      'code_symbol:src/math.ts::add',
    );
  });
});
