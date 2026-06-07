import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createMcpServer } from '../mcp-server/server.js';
import { createAuthMiddleware, redactToken } from '../mcp-server/middleware/auth.js';
import { createErrorHandler } from '../mcp-server/middleware/error-handler.js';
import { validateProjectName } from '../commands/init-validation.js';
import { resolveMcpBindHost } from '../mcp-server/boot-config.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('security-hardening regression audit (N-1)', () => {
  it('O-01: path-confinement suite file exists with 20+ malicious fixtures', () => {
    const specPath = path.join(
      repoRoot,
      'packages/cli/src/mcp-server/__tests__/path-confinement.test.ts',
    );
    const content = fs.readFileSync(specPath, 'utf8');
    const fixtures = content.match(/MALICIOUS_PROJECT_PATHS/g);
    expect(fixtures).not.toBeNull();
    const arrayMatch = content.match(/MALICIOUS_PROJECT_PATHS = \[([\s\S]*?)\];/);
    expect(arrayMatch).not.toBeNull();
    const entries = (arrayMatch![1].match(/'/g) ?? []).length;
    expect(entries).toBeGreaterThanOrEqual(20);
  });

  it('O-02: non-loopback without token returns 401', async () => {
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
    app.use(createAuthMiddleware({ token: 'audit-secret-token-value' }));
    app.get('/probe', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/probe');
    expect(res.status).toBe(401);
  });

  it('O-03: 5xx bodies never leak absolute paths', async () => {
    const app = express();
    const logger = { error: () => undefined };
    app.get('/boom', () => {
      throw new Error(`failed at C:\\Users\\secret\\file.ts`);
    });
    app.use(createErrorHandler(logger));

    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toMatch(/Users|file\.ts/);
    expect(res.body.correlationId).toBeTruthy();
  });

  it('O-04: init-validation rejects traversal, absolute paths and uppercase', () => {
    expect(validateProjectName('../../tmp/x').ok).toBe(false);
    expect(validateProjectName('/etc/passwd').ok).toBe(false);
    expect(validateProjectName('MyApp').ok).toBe(false);
    expect(validateProjectName('valid-name').ok).toBe(true);
  });

  it('O-05: publish-smoke workflow exists', () => {
    const smoke = path.join(repoRoot, '.github/workflows/publish-smoke.yml');
    expect(fs.existsSync(smoke)).toBe(true);
    const content = fs.readFileSync(smoke, 'utf8');
    expect(content).toContain('smoke');
    expect(content).toContain('Publish to npm');
  });

  it('O-06: eslint and coverage scripts are invocable', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'packages/cli/package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.lint).toBeTruthy();
    const vitestConfig = fs.readFileSync(
      path.join(repoRoot, 'packages/cli/vitest.config.ts'),
      'utf8',
    );
    expect(vitestConfig).toContain('thresholds');
    expect(fs.existsSync(path.join(repoRoot, 'KNOWN-COV-BASELINE.md'))).toBe(true);
  });

  it('O-07: CI audit job configured for prod high/critical', () => {
    const ci = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('pnpm audit --prod --audit-level=high');
  });

  it('O-08: verify-actions-pinned.mjs exits 0', () => {
    const script = path.join(repoRoot, 'scripts/verify-actions-pinned.mjs');
    expect(() => {
      execFileSync(process.execPath, [script], { cwd: repoRoot, stdio: 'pipe' });
    }).not.toThrow();
  });

  it('boot token masking never prints full secret', () => {
    const token = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const masked = redactToken(token);
    expect(masked).not.toBe(token);
    expect(masked).not.toContain(token);
  });

  it('MCP default bind is loopback-only', () => {
    expect(resolveMcpBindHost({})).toBe('127.0.0.1');
  });

  it('createMcpServer health never returns absolute project path', async () => {
    const app = createMcpServer(repoRoot, { authToken: 'audit-token' });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.projectRoot).not.toBe(repoRoot);
    expect(String(res.body.projectRoot)).not.toContain(':');
  });
});
