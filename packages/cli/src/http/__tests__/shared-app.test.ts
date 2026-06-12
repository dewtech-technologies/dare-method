import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { createMcpServer } from '../../mcp-server/server.js';

const TOKEN = 'shared-app-test-token';

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

describe('createApp (shared Express app)', () => {
  it('app_requires_token_off_loopback', async () => {
    const app = nonLoopbackApp(
      createApp({ token: TOKEN, projectRoot: '/tmp/test-project' }),
    );
    app.get('/probe', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/probe');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('accepts_valid_bearer_off_loopback', async () => {
    const app = nonLoopbackApp(
      createApp({ token: TOKEN, projectRoot: '/tmp/test-project' }),
    );
    app.get('/probe', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('helmet_and_cors_applied', async () => {
    const app = createApp({ token: TOKEN, projectRoot: '/tmp/test-project' });
    app.get('/probe', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/probe')
      .set('Host', '127.0.0.1')
      .set('Origin', 'http://127.0.0.1:4100');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4100');
  });

  it('mcp_routes_still_work', async () => {
    const app = createMcpServer(process.cwd(), { authToken: TOKEN });
    const res = await request(app).get('/health').set('Host', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('projectRoot');
  });
});
