import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Neo4jGraph } from '../../graphrag/neo4j-graph.js';

const serverUp = process.env.NEO4J_TEST_URL !== undefined;

describe.skipIf(!serverUp)('neo4j persistence (O-05)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('write → close → reopen → read returns the same node', async () => {
    const store = new Map<string, unknown>();

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        statements: Array<{ statement: string; parameters?: Record<string, unknown> }>;
      };
      for (const stmt of body.statements) {
        if (stmt.statement.includes('MERGE (n:DareNode')) {
          const id = String(stmt.parameters?.id);
          store.set(id, stmt.parameters);
        }
      }

      if (body.statements[0]?.statement.includes('RETURN n.id')) {
        const rows = [...store.values()].map((p) => {
          const params = p as Record<string, unknown>;
          return [
            params.id,
            params.type,
            params.label,
            params.description,
            params.metadata,
            params.createdAt,
            params.updatedAt,
          ];
        });
        return {
          ok: true,
          json: async () => ({ results: [{ data: rows.map((row) => ({ row })) }], errors: [] }),
        };
      }

      return {
        ok: true,
        json: async () => ({ results: [{ data: [] }], errors: [] }),
      };
    });

    const graph1 = new Neo4jGraph({ url: 'http://localhost:7474' });
    await graph1.init();
    graph1.addNode({ id: 'task:persist', type: 'task', label: 'persisted' });
    await graph1.close();

    const graph2 = new Neo4jGraph({ url: 'http://localhost:7474' });
    await graph2.init();
    expect(graph2.getNode('task:persist')?.label).toBe('persisted');
    await graph2.close();
  });
});

describe('neo4j persistence (mock, always runs)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('O-05 mock: addNode flush close then hydrate on reopen', async () => {
    type GraphNodeRow = {
      id: string;
      type: string;
      label: string;
      description: string | null;
      metadata: string;
      createdAt: string;
      updatedAt: string;
    };
    const nodes: Record<string, GraphNodeRow> = {};

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        statements: Array<{ statement: string; parameters?: Record<string, unknown> }>;
      };
      const stmt = body.statements[0]?.statement ?? '';

      if (stmt.includes('MERGE (n:DareNode')) {
        const p = body.statements[0]!.parameters!;
        nodes[String(p.id)] = {
          id: String(p.id),
          type: String(p.type),
          label: String(p.label),
          description: (p.description as string | null) ?? null,
          metadata: String(p.metadata),
          createdAt: String(p.createdAt),
          updatedAt: String(p.updatedAt),
        };
      }

      if (stmt.includes('RETURN n.id')) {
        const rows = Object.values(nodes).map((n) => [
          n.id,
          n.type,
          n.label,
          n.description,
          n.metadata,
          n.createdAt,
          n.updatedAt,
        ]);
        return {
          ok: true,
          json: async () => ({ results: [{ data: rows.map((row) => ({ row })) }], errors: [] }),
        };
      }

      return {
        ok: true,
        json: async () => ({ results: [{ data: [] }], errors: [] }),
      };
    });

    const g1 = new Neo4jGraph({ url: 'http://mock:7474' });
    await g1.init();
    g1.addNode({ id: 'task:o05', type: 'task', label: 'O-05' });
    await g1.close();

    const g2 = new Neo4jGraph({ url: 'http://mock:7474' });
    await g2.init();
    expect(g2.getNode('task:o05')?.label).toBe('O-05');
    await g2.close();
  });
});
