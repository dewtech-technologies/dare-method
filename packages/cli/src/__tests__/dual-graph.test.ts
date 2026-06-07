import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import { extractSymbolsFromPaths } from '../graphrag/code-index.js';
import { JsonGraph } from '../graphrag/json-graph.js';
import { traverse } from '../graphrag/traverse.js';
import { collectImpact, collectOwners, traceRequirement } from '../commands/graph-queries.js';
import {
  buildGraphFromFixture,
  loadFixture,
} from './graphrag/fixtures/dual-graph/build-fixture-graph.js';

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../graphrag/__tests__/fixtures/code-index',
);
const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('dual-graph integration (O-01…O-07)', () => {
  let projectRoot: string;
  let graph: JsonGraph;

  beforeEach(async () => {
    projectRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dual-graph-int-'));
    const file = path.join(projectRoot, 'graph.json');
    graph = new JsonGraph(file);
    await graph.init();
  });

  it('O-01: extractSymbolsFromPaths ≥90% top-level symbols', async () => {
    const codeFixtures = path.join(fixturesDir);
    for (const name of await fs.promises.readdir(codeFixtures)) {
      if (name.endsWith('.json')) continue;
      await fs.promises.copyFile(path.join(codeFixtures, name), path.join(projectRoot, name));
    }
    const expected = JSON.parse(
      fs.readFileSync(path.join(codeFixtures, 'multi-lang-expected.json'), 'utf8'),
    ) as { expectedSymbols: string[] };
    const paths = ['sample.ts', 'sample.py', 'sample.go', 'sample.rs', 'sample.php'];
    const syms = extractSymbolsFromPaths(paths, projectRoot);
    const found = new Set(syms.map((s) => s.qualifiedName));
    const ratio =
      expected.expectedSymbols.filter((q: string) => found.has(q)).length /
      expected.expectedSymbols.length;
    expect(ratio).toBeGreaterThanOrEqual(0.9);
  });

  it('O-02: owners durationMs < 200', () => {
    buildGraphFromFixture(graph, loadFixture('owners-chain'));
    const result = collectOwners(graph, 'src/commands/execute.ts');
    expect(result.durationMs).toBeLessThan(200);
    expect(result.owners.some((o) => o.type === 'task')).toBe(true);
  });

  it('O-03: impact recall 100% on impact-chain', () => {
    buildGraphFromFixture(graph, loadFixture('impact-chain'));
    const result = collectImpact(graph, 'src/math.ts');
    expect(result.durationMs).toBeLessThan(500);
    expect(result.impacted.tasks).toContain('task-201');
    expect(result.impacted.requirements).toContain('RF-03');
  });

  it('O-04: locate top-5 hit rate ≥85%', async () => {
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
      const g = new JsonGraph(path.join(projectRoot, `${fixture}.json`));
      await g.init();
      buildGraphFromFixture(g, loadFixture(fixture));
      const top = g.locate(seed, { limit: 5 }).candidates.map((c) => c.node.id);
      if (expected.some((id) => top.includes(id))) hits++;
    }
    expect(hits / cases.length).toBeGreaterThanOrEqual(0.85);
  });

  it('O-05: json persistence write→reopen→read', async () => {
    const file = path.join(projectRoot, 'persist.json');
    const g1 = new JsonGraph(file);
    await g1.init();
    g1.addNode({ id: 'task:persist', type: 'task', label: 'persist' });
    g1.close();
    const g2 = new JsonGraph(file);
    await g2.init();
    expect(g2.getNode('task:persist')?.label).toBe('persist');
  });

  it('O-07: trace ≤3 hops requirement→task→symbol', () => {
    buildGraphFromFixture(graph, loadFixture('impact-chain'));
    const result = traceRequirement(graph, 'RF-03');
    expect(result.symbols).toContain('src/math.ts::add');
    expect(result.path.length).toBeLessThanOrEqual(4);
    expect(result.path[0]?.type).toBe('requirement');
  });
});

describe('dual-graph §11 guards', () => {
  it('neo4j-graph has zero void this.runMany', () => {
    const src = fs.readFileSync(path.join(srcRoot, 'graphrag', 'neo4j-graph.ts'), 'utf8');
    expect(src).not.toMatch(/void this\.runMany/);
  });

  it('neo4j cypher uses parameterized statements only', () => {
    const src = fs.readFileSync(path.join(srcRoot, 'graphrag', 'neo4j-graph.ts'), 'utf8');
    expect(src).not.toMatch(/statement:\s*`[^`]*\$\{/);
    expect(src).toMatch(/\$id|\$sourceId|\$limit/);
    expect(src).toContain('parameters:');
  });

  it('no LLM imports in deterministic graph modules', () => {
    for (const file of ['graphrag/code-index.ts', 'graphrag/requirement-ingest.ts', 'graphrag/traverse.ts']) {
      const src = fs.readFileSync(path.join(srcRoot, file), 'utf8');
      expect(src).not.toMatch(/openai|anthropic|@google\/generative-ai|langchain/i);
    }
  });

  it('locate returns real candidates for known seed', async () => {
    const file = path.join(os.tmpdir(), `dual-locate-${Date.now()}.json`);
    const g = new JsonGraph(file);
    await g.init();
    buildGraphFromFixture(g, loadFixture('locate/math'));
    const result = g.locate('math', { limit: 5 });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.some((c) => c.node.id.includes('math'))).toBe(true);
  });

  it('traverse clamps maxFanout', async () => {
    const file = path.join(os.tmpdir(), `dual-fanout-${Date.now()}.json`);
    const g = new JsonGraph(file);
    await g.init();
    g.addNode({ id: 'task:t1', type: 'task', label: 't1' });
    for (let i = 0; i < 60; i++) {
      g.addNode({ id: `file:e${i}.ts`, type: 'file', label: `e${i}` });
      g.addEdge({
        id: `e${i}`,
        sourceId: 'task:t1',
        targetId: `file:e${i}.ts`,
        type: 'implements',
      });
    }
    const walked = traverse(g, { seedNodeIds: ['task:t1'], maxHops: 1, maxFanout: 5, direction: 'out' });
    expect(walked.edges.length).toBeLessThanOrEqual(5);
  });

  it('owners includes task nodes not only file', async () => {
    const file = path.join(os.tmpdir(), `dual-owners-${Date.now()}.json`);
    const g = new JsonGraph(file);
    await g.init();
    buildGraphFromFixture(g, loadFixture('owners-chain'));
    const result = collectOwners(g, 'src/commands/execute.ts');
    expect(result.owners.some((o) => o.type === 'task')).toBe(true);
    expect(result.owners.some((o) => o.type === 'requirement')).toBe(true);
  });
});
