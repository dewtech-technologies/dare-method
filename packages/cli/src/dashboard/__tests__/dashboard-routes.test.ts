import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, finalizeApp } from '../../http/app.js';
import { mountDashboardRoutes, resolveDashboardTemplateRoot } from '../routes.js';

const TOKEN = 'dashboard-routes-test-token';

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

function createDashboardApp(projectRoot: string, allowLoopbackWithoutToken = true): express.Express {
  const app = createApp({ token: TOKEN, projectRoot, allowLoopbackWithoutToken });
  mountDashboardRoutes(app, { projectRoot });
  return finalizeApp(app);
}

describe('dashboard routes', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-dash-routes-'));
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

  it('returns_401_without_token_off_loopback', async () => {
    const app = nonLoopbackApp(createDashboardApp(projectRoot, false));
    const res = await request(app).get('/api/telemetry');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns_telemetry_snapshot_shape', async () => {
    const app = createDashboardApp(projectRoot);
    const res = await request(app).get('/api/telemetry').set('Host', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      dag: { total: 0, byStatus: {}, ranks: 0 },
      gates: { verified: 0, proven: 0 },
      cost: { totalUsd: 0, totalTokens: 0, byTask: [] },
      emptyHints: expect.arrayContaining(['no tasks — run dare execute']),
    });
  });

  it('serves_dashboard_html', async () => {
    const app = createDashboardApp(projectRoot);
    const res = await request(app).get('/dashboard').set('Host', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('DARE Telemetry');
    expect(res.text).toContain('id="dag-panel"');
  });

  it('serves_assets_confined_to_template_root', async () => {
    const app = createDashboardApp(projectRoot);
    const ok = await request(app)
      .get('/dashboard/assets/style.css')
      .set('Host', '127.0.0.1');
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toMatch(/css/);

    const traversal = await request(app)
      .get('/dashboard/assets/..%2f..%2fpackage.json')
      .set('Host', '127.0.0.1');
    expect(traversal.status).toBe(403);
  });

  it('is_read_only_no_mutating_routes', async () => {
    const app = createDashboardApp(projectRoot);
    const postTelemetry = await request(app)
      .post('/api/telemetry')
      .set('Host', '127.0.0.1')
      .send({ mutate: true });
    expect(postTelemetry.status).toBe(404);

    const putDashboard = await request(app)
      .put('/dashboard')
      .set('Host', '127.0.0.1')
      .send({});
    expect(putDashboard.status).toBe(404);
  });

  it('template_root_resolves_to_packages_cli_templates', () => {
    const root = resolveDashboardTemplateRoot();
    expect(fs.existsSync(path.join(root, 'index.html'))).toBe(true);
  });
});
