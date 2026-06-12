import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDashboardApp } from '../commands/dashboard.js';

const TOKEN = 'dashboard-regression-token';

function nonLoopbackApp(app: express.Express): express.Express {
  const wrapper = express();
  wrapper.set('trust proxy', true);
  wrapper.use((req, _res, next) => {
    Object.defineProperty(req, 'ip', { value: '203.0.113.1', configurable: true });
    Object.defineProperty(req.socket, 'remoteAddress', {
      value: '203.0.113.1',
      configurable: true,
    });
    next();
  });
  wrapper.use(app);
  return wrapper;
}

describe('dashboard regression', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-dash-reg-'));
    await fs.ensureDir(path.join(projectRoot, '.dare'));
    await fs.writeJson(path.join(projectRoot, '.dare', 'state.json'), {
      version: 1,
      updatedAt: '2026-06-11T00:00:00.000Z',
      tasks: {},
    });
    await fs.writeJson(path.join(projectRoot, 'dare-graph.yml'), {
      backend: 'json',
      path: '.dare/graph.json',
    });
    await fs.writeJson(path.join(projectRoot, '.dare', 'graph.json'), { nodes: [], edges: [] });
  });

  afterEach(async () => {
    await fs.remove(projectRoot).catch(() => undefined);
  });

  it('reuses_mcp_auth_401_without_token_off_loopback', async () => {
    const app = nonLoopbackApp(createDashboardApp(projectRoot, TOKEN));
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(401);
  });

  it('read_only_no_post_put_mutations', async () => {
    const app = createDashboardApp(projectRoot, TOKEN);
    expect((await request(app).post('/api/telemetry').set('Host', '127.0.0.1').send({})).status).toBe(404);
    expect((await request(app).put('/api/telemetry').set('Host', '127.0.0.1').send({})).status).toBe(404);
    expect((await request(app).delete('/dashboard').set('Host', '127.0.0.1')).status).toBe(404);
  });

  it('assets_confined_no_traversal', async () => {
    const app = createDashboardApp(projectRoot, TOKEN);
    const blocked = await request(app)
      .get('/dashboard/assets/..%2f..%2fpackage.json')
      .set('Host', '127.0.0.1');
    expect(blocked.status).toBe(403);
  });

  it('empty_graph_returns_emptyHints', async () => {
    const app = createDashboardApp(projectRoot, TOKEN);
    const res = await request(app).get('/api/telemetry').set('Host', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.body.emptyHints).toContain('no tasks — run dare execute');
    expect(res.body.dag.total).toBe(0);
  });
});
