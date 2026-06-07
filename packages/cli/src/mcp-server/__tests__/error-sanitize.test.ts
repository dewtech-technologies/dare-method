import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createErrorHandler } from '../middleware/error-handler.js';
import { createCorsMiddleware } from '../middleware/cors.js';

describe('createErrorHandler', () => {
  it('should_never_leak_absolute_paths_in_5xx_body', async () => {
    const logger = { error: vi.fn() };
    const app = express();
    app.get('/boom', () => {
      const err = new Error('failed at C:\\Users\\secret\\proj and /etc/passwd');
      (err as Error & { stack?: string }).stack =
        'Error: failed\n    at /home/user/app/src/index.ts:10:1';
      throw err;
    });
    app.use(createErrorHandler(logger));

    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/([A-Za-z]:\\|\/etc\/|\/home\/)/);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.success).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  it('should_include_correlation_id', async () => {
    const app = express();
    app.get('/boom', () => {
      throw new Error('kaboom');
    });
    app.use(createErrorHandler({ error: vi.fn() }));

    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe('createCorsMiddleware', () => {
  it('should_block_unknown_origin', async () => {
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/x', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .options('/x')
      .set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should_allow_requests_without_origin', async () => {
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/x', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/x');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('should_allow_localhost_origin', async () => {
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/x', (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/x')
      .set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
});
