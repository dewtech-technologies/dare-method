import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Neo4jGraph,
  Neo4jQueryError,
  parseEdgeFromRecord,
  parseNodeFromRecord,
} from '../../graphrag/neo4j-graph.js';

describe('neo4j-graph', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parseNodeFromRecord rejects malformed payload', () => {
    expect(() => parseNodeFromRecord(['', 'task', 'x'])).toThrow(Neo4jQueryError);
  });

  it('parseEdgeFromRecord accepts valid edge row', () => {
    const edge = parseEdgeFromRecord([
      'e1',
      'task:t1',
      'file:a.ts',
      'implements',
      1,
      '{}',
    ]);
    expect(edge.id).toBe('e1');
    expect(edge.type).toBe('implements');
  });

  it('init hydrates cache from server rows', async () => {
    const ok = (data: unknown[]) => ({
      ok: true,
      json: async () => ({ results: [{ data: data.map((row) => ({ row })) }], errors: [] }),
    });
    fetchMock
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([['task:t1', 'task', 'T1', null, '{}', '2020', '2020']]))
      .mockResolvedValueOnce(ok([]));

    const graph = new Neo4jGraph({ url: 'http://localhost:7474', username: 'n', password: 'p' });
    await graph.init();
    expect(graph.getNode('task:t1')?.label).toBe('T1');
    await graph.close();
  });

  it('queues writes and flushes on close (no fire-and-forget)', async () => {
    const ok = (data: unknown[]) => ({
      ok: true,
      json: async () => ({ results: [{ data: data.map((row) => ({ row })) }], errors: [] }),
    });
    fetchMock
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]));

    const graph = new Neo4jGraph({ url: 'http://localhost:7474' });
    await graph.init();
    graph.addNode({ id: 'task:new', type: 'task', label: 'New' });
    await graph.close();

    const writeCall = fetchMock.mock.calls.find((c) => {
      const body = JSON.parse(String(c[1]?.body ?? '{}')) as {
        statements?: Array<{ statement: string }>;
      };
      return body.statements?.some((s) => s.statement.includes('MERGE (n:DareNode'));
    });
    expect(writeCall).toBeDefined();
  });

  it('flush error keeps pending queue intact', async () => {
    const ok = (data: unknown[]) => ({
      ok: true,
      json: async () => ({ results: [{ data: data.map((row) => ({ row })) }], errors: [] }),
    });
    fetchMock
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'ERR',
        text: async () => 'fail',
      });

    const graph = new Neo4jGraph({ url: 'http://localhost:7474' });
    await graph.init();
    graph.addNode({ id: 'task:err', type: 'task', label: 'err' });
    await expect(graph.flush()).rejects.toBeInstanceOf(Neo4jQueryError);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'ERR',
      text: async () => 'fail again',
    });
    await expect(graph.flush()).rejects.toBeInstanceOf(Neo4jQueryError);
  });

  it('throws Neo4jQueryError on HTTP failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'ERR', text: async () => 'fail' });
    const graph = new Neo4jGraph({ url: 'http://localhost:7474' });
    await expect(graph.init()).rejects.toBeInstanceOf(Neo4jQueryError);
  });

  it('throws Neo4jQueryError on cypher errors array', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [],
        errors: [{ code: 'Neo.ClientError', message: 'bad cypher' }],
      }),
    });
    const graph = new Neo4jGraph({ url: 'http://localhost:7474' });
    await expect(graph.init()).rejects.toBeInstanceOf(Neo4jQueryError);
  });
});
