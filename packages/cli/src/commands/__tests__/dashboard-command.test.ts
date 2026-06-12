import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDashboardApp } from '../dashboard.js';

describe('dare dashboard command', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-dash-cmd-'));
    await fs.ensureDir(path.join(projectRoot, '.dare'));
    await fs.writeJson(path.join(projectRoot, '.dare', 'state.json'), { version: 1, tasks: {} });
    await fs.writeJson(path.join(projectRoot, 'dare-graph.yml'), {
      backend: 'json',
      path: '.dare/graph.json',
    });
    await fs.writeJson(path.join(projectRoot, '.dare', 'graph.json'), { nodes: [], edges: [] });
  });

  afterEach(async () => {
    await fs.remove(projectRoot).catch(() => undefined);
  });

  it('createDashboardApp_serves_dashboard_and_telemetry', async () => {
    const request = (await import('supertest')).default;
    const app = createDashboardApp(projectRoot, 'dash-cmd-token');
    const dash = await request(app).get('/dashboard').set('Host', '127.0.0.1');
    expect(dash.status).toBe(200);
    expect(dash.text).toContain('DARE Telemetry');

    const api = await request(app).get('/api/telemetry').set('Host', '127.0.0.1');
    expect(api.status).toBe(200);
    expect(api.body).toHaveProperty('dag');
  });

  it('startDashboardServer_returns_url_and_closes', async () => {
    const { startDashboardServer } = await import('../dashboard.js');
    const handle = await startDashboardServer({
      projectRoot,
      port: 0,
      openBrowser: false,
      token: 'test-token',
      host: '127.0.0.1',
    });
    expect(handle.url).toContain('/dashboard');
    expect(handle.token).toBe('test-token');
    await handle.close();
  });

  it('dashboardCommand_registers_options', async () => {
    const { dashboardCommand } = await import('../dashboard.js');
    const portOpt = dashboardCommand.options.find((o) => o.long === '--port');
    expect(portOpt).toBeDefined();
    expect(dashboardCommand.name()).toBe('dashboard');
  });

  it('startDashboardServer_can_skip_browser_open', async () => {
    const { startDashboardServer } = await import('../dashboard.js');
    const handle = await startDashboardServer({
      projectRoot,
      port: 0,
      openBrowser: false,
      host: '127.0.0.1',
    });
    expect(handle.url).toContain('/dashboard');
    await handle.close();
  });
});
