import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createMcpServer } from '../server.js';
import { buildGraphFromFixture, loadFixture } from '../../__tests__/graphrag/fixtures/dual-graph/build-fixture-graph.js';
import { JsonGraph } from '../../graphrag/json-graph.js';

describe('MCP graph tools', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-graph-'));
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), { name: 'mcp-graph-test' });
    await fs.writeFile(
      path.join(projectRoot, 'dare-graph.yml'),
      'backend: json\njson:\n  path: .dare/graph.json\n',
    );

    const graphPath = path.join(projectRoot, '.dare', 'graph.json');
    const graph = new JsonGraph(graphPath);
    await graph.init();
    buildGraphFromFixture(graph, loadFixture('impact-chain'));
    graph.close();
  });

  afterEach(async () => {
    await fs.remove(projectRoot).catch(() => undefined);
  });

  function app() {
    return createMcpServer(projectRoot, { allowLoopbackWithoutToken: true });
  }

  it('lists graph tools in GET /tools', async () => {
    const res = await request(app()).get('/tools');
    const names = (res.body.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain('graph_locate');
    expect(names).toContain('graph_map_requirement');
    expect(names).toContain('graph_traverse');
  });

  it('POST /graph/locate returns candidates', async () => {
    const res = await request(app())
      .post('/graph/locate')
      .send({ seed: 'math', hops: 3, limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.candidates.length).toBeGreaterThan(0);
  });

  it('POST /graph/locate rejects missing seed', async () => {
    const res = await request(app()).post('/graph/locate').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('seed is required');
  });

  it('POST /graph/locate rejects path escape', async () => {
    const res = await request(app()).post('/graph/locate').send({ seed: '../etc/passwd' });
    expect(res.status).toBe(403);
  });

  it('POST /graph/map-requirement maps RF-03', async () => {
    const res = await request(app()).post('/graph/map-requirement').send({ reqId: 'RF-03' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.symbols).toContain('src/math.ts::add');
    expect(res.body.tasks).toContain('task-201');
  });

  it('POST /graph/map-requirement rejects invalid reqId', async () => {
    const res = await request(app()).post('/graph/map-requirement').send({ reqId: 'BAD' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid reqId');
  });

  it('POST /graph/traverse returns nodes and edges', async () => {
    const res = await request(app()).post('/graph/traverse').send({
      seedNodeIds: ['requirement:RF-03'],
      maxHops: 3,
      edgeTypes: ['depends_on', 'implements', 'affects'],
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.nodes.length).toBeGreaterThan(0);
  });

  it('POST /graph/traverse requires seedNodeIds', async () => {
    const res = await request(app()).post('/graph/traverse').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('seedNodeIds is required');
  });

  it('deterministic locate responses', async () => {
    const a = await request(app()).post('/graph/locate').send({ seed: 'math' });
    const b = await request(app()).post('/graph/locate').send({ seed: 'math' });
    expect(a.body).toEqual(b.body);
  });
});
