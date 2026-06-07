import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { JsonGraph } from '../../../graphrag/json-graph.js';
import { GraphRAG } from '../../../graphrag/graph-rag.js';
import { Neo4jGraph } from '../../../graphrag/neo4j-graph.js';
import { runTraverseContract } from './traverse.contract.js';

const hasNeo4jUrl = Boolean(process.env.DARE_NEO4J_URL);

describe('traverse/locate contract', () => {
  it('json and sqlite backends match', async () => {
    const jsonPath = path.join(os.tmpdir(), `contract-json-${Date.now()}.json`);
    const sqlitePath = path.join(os.tmpdir(), `contract-sqlite-${Date.now()}.db`);

    const json = await runTraverseContract(async () => {
      const g = new JsonGraph(jsonPath);
      await g.init();
      return g;
    });
    const sqlite = await runTraverseContract(async () => {
      const g = new GraphRAG(sqlitePath);
      await g.init();
      return g;
    });

    expect(sqlite.traverseNodeIds).toEqual(json.traverseNodeIds);
    expect(sqlite.locateIds).toEqual(json.locateIds);
    expect(sqlite.locateScores).toEqual(json.locateScores);
  });
});

describe.skipIf(!hasNeo4jUrl)('traverse/locate contract neo4j', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('neo4j mock matches json baseline', async () => {
    const store = {
      nodes: new Map<string, Record<string, unknown>>(),
      edges: new Map<string, Record<string, unknown>>(),
    };

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        statements: Array<{ statement: string; parameters?: Record<string, unknown> }>;
      };
      const stmt = body.statements[0]?.statement ?? '';
      const params = body.statements[0]?.parameters ?? {};

      if (stmt.includes('MERGE (n:DareNode')) {
        store.nodes.set(String(params.id), params);
      }
      if (stmt.includes('MERGE (s)-[r:DARE_EDGE')) {
        store.edges.set(String(params.id), params);
      }

      if (stmt.includes('RETURN n.id')) {
        const rows = [...store.nodes.values()].map((p) => [
          p.id,
          p.type,
          p.label,
          p.description,
          p.metadata,
          p.createdAt,
          p.updatedAt,
        ]);
        return {
          ok: true,
          json: async () => ({ results: [{ data: rows.map((row) => ({ row })) }], errors: [] }),
        };
      }
      if (stmt.includes('RETURN r.id')) {
        const rows = [...store.edges.values()].map((p) => [
          p.id,
          p.sourceId,
          p.targetId,
          p.type,
          p.weight,
          p.metadata,
        ]);
        return {
          ok: true,
          json: async () => ({ results: [{ data: rows.map((row) => ({ row })) }], errors: [] }),
        };
      }

      return { ok: true, json: async () => ({ results: [{ data: [] }], errors: [] }) };
    });

    const jsonPath = path.join(os.tmpdir(), `contract-json-neo-${Date.now()}.json`);
    const baseline = await runTraverseContract(async () => {
      const g = new JsonGraph(jsonPath);
      await g.init();
      return g;
    });

    const neo = await runTraverseContract(async () => {
      const g = new Neo4jGraph({
        url: process.env.DARE_NEO4J_URL ?? 'http://localhost:7474',
        experimental: true,
      });
      await g.init();
      return g;
    });

    expect(neo.traverseNodeIds).toEqual(baseline.traverseNodeIds);
    expect(neo.locateIds).toEqual(baseline.locateIds);
  });
});
