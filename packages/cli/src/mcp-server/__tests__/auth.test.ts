import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createAuthMiddleware,
  redactToken,
  isLoopbackIp,
} from '../middleware/auth.js';

const TOKEN = 'test-secret-token-uuid';

function appWithAuth(overrides?: { allowLoopbackWithoutToken?: boolean }) {
  const app = express();
  app.set('trust proxy', true);
  app.use(
    createAuthMiddleware({
      token: TOKEN,
      allowLoopbackWithoutToken: overrides?.allowLoopbackWithoutToken ?? true,
    }),
  );
  app.get('/protected', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('createAuthMiddleware', () => {
  it('should_allow_loopback_without_token', async () => {
    const res = await request(appWithAuth())
      .get('/protected')
      .set('Host', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('should_reject_non_loopback_without_token', async () => {
    const app = express();
    app.set('trust proxy', true);
    app.use((req, _res, next) => {
      Object.defineProperty(req, 'ip', { value: '203.0.113.1', configurable: true });
      Object.defineProperty(req.socket, 'remoteAddress', {
        value: '203.0.113.1',
        configurable: true,
      });
      next();
    });
    app.use(createAuthMiddleware({ token: TOKEN, allowLoopbackWithoutToken: true }));
    app.get('/protected', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('should_accept_valid_bearer', async () => {
    const res = await request(appWithAuth())
      .get('/protected')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('should_accept_query_token_on_loopback', async () => {
    const res = await request(appWithAuth())
      .get(`/protected?token=${TOKEN}`)
      .set('Host', '127.0.0.1');
    expect(res.status).toBe(200);
  });

  it('should_reject_invalid_token', async () => {
    const res = await request(appWithAuth())
      .get('/protected')
      .set('Authorization', 'Bearer wrong-token');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('should_redact_token_in_logs', () => {
    expect(redactToken(TOKEN)).toBe('test...uuid');
    expect(redactToken(TOKEN)).not.toContain(TOKEN);
    expect(redactToken('short')).toBe('[REDACTED]');
  });

  it('isLoopbackIp recognizes loopback addresses', () => {
    expect(isLoopbackIp('127.0.0.1')).toBe(true);
    expect(isLoopbackIp('::1')).toBe(true);
    expect(isLoopbackIp('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackIp('10.0.0.1')).toBe(false);
  });
});
