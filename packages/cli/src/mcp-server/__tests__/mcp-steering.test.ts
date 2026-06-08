import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createMcpServer } from '../server.js';
import { createAuthMiddleware } from '../middleware/auth.js';

const TOKEN = 'steering-test-token';

describe('MCP GET /steering', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-steering-'));
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    await fs.writeFile(
      path.join(projectRoot, 'DARE', 'PROJECT-DNA.md'),
      '# DNA\nBase steering.',
    );
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), { name: 'steering-mcp' });
    const dir = path.join(projectRoot, '.dare', 'steering');
    await fs.ensureDir(dir);
    await fs.writeFile(
      path.join(dir, 'auth.md'),
      `---
scope: glob
glob: src/auth/**
priority: 5
---
# Auth
`,
    );
  });

  afterEach(async () => {
    await fs.remove(projectRoot).catch(() => undefined);
  });

  function app() {
    return createMcpServer(projectRoot, {
      authToken: TOKEN,
      allowLoopbackWithoutToken: true,
    });
  }

  it('lists get_steering in GET /tools', async () => {
    const res = await request(app()).get('/tools');
    const names = (res.body.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain('get_steering');
  });

  it('returns resolved blocks for matching file', async () => {
    const res = await request(app())
      .get('/steering')
      .query({ file: 'src/auth/login.ts' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.file).toBe('src/auth/login.ts');
    expect(res.body.blocks[0]?.isBase).toBe(true);
    expect(res.body.blocks.some((b: { source: string }) => b.source.includes('auth.md'))).toBe(
      true,
    );
  });

  it('rejects missing file param', async () => {
    const res = await request(app()).get('/steering');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('file is required');
  });

  it('rejects file param over 200 chars', async () => {
    const res = await request(app())
      .get('/steering')
      .query({ file: 'a'.repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('file too long');
  });

  it('rejects path escape with 403', async () => {
    const res = await request(app())
      .get('/steering')
      .query({ file: '../etc/passwd' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('regression: non-loopback without token is unauthorized', async () => {
    const base = express();
    base.set('trust proxy', true);
    base.use((req, _res, next) => {
      Object.defineProperty(req, 'ip', { value: '203.0.113.1', configurable: true });
      Object.defineProperty(req.socket, 'remoteAddress', {
        value: '203.0.113.1',
        configurable: true,
      });
      next();
    });
    base.use(createAuthMiddleware({ token: TOKEN, allowLoopbackWithoutToken: true }));
    base.use(createMcpServer(projectRoot, { authToken: TOKEN, allowLoopbackWithoutToken: true }));

    const res = await request(base)
      .get('/steering')
      .query({ file: 'src/foo.ts' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });
});
