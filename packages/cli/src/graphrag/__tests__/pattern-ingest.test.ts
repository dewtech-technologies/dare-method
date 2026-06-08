import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonGraph } from '../json-graph.js';
import { ingestPatterns } from '../pattern-ingest.js';
import type { PatternsFacts } from '../../utils/pattern-detector.js';

const FIXTURE: PatternsFacts = {
  generatedAt: '2026-06-07T12:00:00.000Z',
  fileInventorySource: 'module-detector',
  patterns: [
    {
      id: 'naming-idiom:service-suffix',
      kind: 'naming-idiom',
      description: '2 arquivos usam sufixo .service.ts',
      frequency: 2,
      coverage: 0.5,
      evidence: [{ file: 'src/a.service.ts' }, { file: 'src/b.service.ts', line: 1 }],
      modules: ['src'],
      marker: 'confirmed',
    },
  ],
};

describe('pattern-ingest', () => {
  let projectRoot: string;
  let graph: JsonGraph;

  beforeEach(async () => {
    projectRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pattern-ingest-'));
    graph = new JsonGraph(path.join(projectRoot, '.dare', 'graph.json'));
    await graph.init();
  });

  afterEach(async () => {
    graph.close();
    await fs.promises.rm(projectRoot, { recursive: true, force: true });
  });

  it('creates pattern nodes and typed edges idempotently', () => {
    const first = ingestPatterns(graph, FIXTURE, projectRoot);
    expect(first.nodes).toBe(1);
    expect(first.edges).toBeGreaterThanOrEqual(2);

    const second = ingestPatterns(graph, FIXTURE, projectRoot);
    expect(second.nodes).toBe(1);

    const stats = graph.getStatistics();
    expect(stats.nodesByType.pattern).toBe(1);
    expect(Number.isNaN(stats.nodesByType.pattern)).toBe(false);
    expect(stats.edgesByType.evidenced_by).toBeGreaterThanOrEqual(1);
    expect(stats.edgesByType.exhibits).toBeGreaterThanOrEqual(1);

    expect(graph.getNode('pattern:naming-idiom:service-suffix')).toBeTruthy();
  });
});
