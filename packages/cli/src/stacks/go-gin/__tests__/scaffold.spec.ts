// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { go_gin } from '../scaffold.js';
import { DARE_DNA } from '../../types.js';

let tmpRoot: string;
let appDir: string;
let result: Awaited<ReturnType<typeof go_gin.generate>>;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gogin-scaffold-'));
  appDir = path.join(tmpRoot, 'my-api');
  await fs.ensureDir(appDir);
  result = await go_gin.generate({
    dir: appDir,
    projectName: 'my-api',
    toolchain: 'auto',
    features: new Set(DARE_DNA),
    isMonorepo: false,
  });
});

afterAll(async () => {
  if (tmpRoot) await fs.remove(tmpRoot);
});

describe('go-gin scaffold', () => {
  describe('metadata', () => {
    it('id is go-gin, backend, stable', () => {
      expect(go_gin.id).toBe('go-gin');
      expect(go_gin.category).toBe('backend');
      expect(go_gin.status).toBe('stable');
    });
  });

  describe('filesWritten', () => {
    it('emits ≥ 22 files', () => {
      expect(result.filesWritten.length).toBeGreaterThanOrEqual(22);
    });

    it.each([
      'go.mod',
      'sqlc.yaml',
      '.env.example',
      'llms.txt',
      'openapi.json',
      'README.md',
      'cmd/server/main.go',
      'internal/config/config.go',
      'internal/db/postgres.go',
      'internal/handler/auth_handler.go',
      'internal/handler/users_handler.go',
      'internal/handler/ws_handler.go',
      'internal/service/auth_service.go',
      'internal/service/users_service.go',
      'internal/repository/users_repository.go',
      'internal/model/user.go',
      'internal/middleware/jwt.go',
      'internal/middleware/rate_limit.go',
      'internal/llm/provider.go',
      'internal/llm/dummy.go',
      'db/migrations/0001_create_users.up.sql',
      'db/migrations/0001_create_users.down.sql',
      'db/queries/users.sql',
      'tests/smoke_test.go',
      '.dare/skills.yml',
      '.github/workflows/dare-ci.yml',
    ])('writes anchor %s', (anchor) => {
      expect(result.filesWritten).toContain(anchor);
    });
  });

  describe('go.mod', () => {
    let mod: string;
    beforeAll(async () => {
      mod = await fs.readFile(path.join(appDir, 'go.mod'), 'utf8');
    });

    it('uses moduleName from projectName', () => {
      expect(mod).toMatch(/^module\s+my-api/m);
    });

    it('targets Go 1.22+', () => {
      expect(mod).toMatch(/^go 1\.2[2-9]/m);
    });

    it('declares gin + pgx + jwt + bcrypt + websocket', () => {
      expect(mod).toContain('gin-gonic/gin');
      expect(mod).toContain('jackc/pgx/v5');
      expect(mod).toContain('golang-jwt/jwt/v5');
      expect(mod).toContain('golang.org/x/crypto');
      expect(mod).toContain('gorilla/websocket');
    });

    it('declares uuid + env + time/rate', () => {
      expect(mod).toContain('google/uuid');
      expect(mod).toContain('caarlos0/env');
      expect(mod).toContain('golang.org/x/time');
    });
  });

  describe('main.go wires invariants', () => {
    let main: string;
    beforeAll(async () => {
      main = await fs.readFile(path.join(appDir, 'cmd/server/main.go'), 'utf8');
    });

    it('mounts auth + users + ws routes', () => {
      expect(main).toContain('/auth/login');
      expect(main).toContain('/auth/me');
      expect(main).toContain('/users');
      expect(main).toContain('/ws');
      expect(main).toContain('/openapi.json');
    });

    it('uses RateLimit + CORS + JWT middleware', () => {
      expect(main).toContain('middleware.RateLimit');
      expect(main).toContain('middleware.CORS');
      expect(main).toContain('middleware.JWT');
    });

    it('uses moduleName-prefixed imports', () => {
      expect(main).toContain('"my-api/internal/');
    });

    it('has swag-compatible annotations', () => {
      expect(main).toContain('@title');
      expect(main).toContain('@version');
    });
  });

  describe('Layered Design', () => {
    it('handlers never call pgx directly', async () => {
      const auth = await fs.readFile(
        path.join(appDir, 'internal/handler/auth_handler.go'),
        'utf8',
      );
      const users = await fs.readFile(
        path.join(appDir, 'internal/handler/users_handler.go'),
        'utf8',
      );
      expect(auth).not.toContain('pgx');
      expect(users).not.toContain('pgx');
    });

    it('repository owns SQL strings', async () => {
      const repo = await fs.readFile(
        path.join(appDir, 'internal/repository/users_repository.go'),
        'utf8',
      );
      expect(repo).toContain('SELECT');
      expect(repo).toContain('INSERT');
    });

    it('services have no SQL strings', async () => {
      const svc = await fs.readFile(
        path.join(appDir, 'internal/service/users_service.go'),
        'utf8',
      );
      expect(svc).not.toMatch(/\bSELECT\b/);
      expect(svc).not.toMatch(/\bINSERT\b/);
    });
  });

  describe('Rate limit middleware', () => {
    it('uses x/time/rate.Limiter per IP', async () => {
      const rl = await fs.readFile(
        path.join(appDir, 'internal/middleware/rate_limit.go'),
        'utf8',
      );
      expect(rl).toContain('rate.NewLimiter');
      expect(rl).toContain('rate.Limit');
      expect(rl).toContain('ClientIP');
    });
  });

  describe('sqlc setup', () => {
    it('sqlc.yaml targets pgx/v5 + internal/repository/sqlcgen', async () => {
      const y = await fs.readFile(path.join(appDir, 'sqlc.yaml'), 'utf8');
      expect(y).toContain('pgx/v5');
      expect(y).toContain('internal/repository/sqlcgen');
    });

    it('db/queries/users.sql has 5 named queries', async () => {
      const q = await fs.readFile(path.join(appDir, 'db/queries/users.sql'), 'utf8');
      expect(q).toContain('FindUserByEmail');
      expect(q).toContain('GetUserByID');
      expect(q).toContain('ListUsers');
      expect(q).toContain('CountUsers');
      expect(q).toContain('CreateUser');
    });
  });

  describe('Migration', () => {
    it('up creates users table with UNIQUE email + index', async () => {
      const sql = await fs.readFile(
        path.join(appDir, 'db/migrations/0001_create_users.up.sql'),
        'utf8',
      );
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('UNIQUE');
      expect(sql).toContain('ix_users_email');
    });

    it('down drops users table', async () => {
      const sql = await fs.readFile(
        path.join(appDir, 'db/migrations/0001_create_users.down.sql'),
        'utf8',
      );
      expect(sql).toContain('DROP TABLE');
    });
  });

  describe('LLM abstraction', () => {
    it('Provider interface + Dummy implementation', async () => {
      const p = await fs.readFile(path.join(appDir, 'internal/llm/provider.go'), 'utf8');
      const d = await fs.readFile(path.join(appDir, 'internal/llm/dummy.go'), 'utf8');
      expect(p).toContain('type Provider interface');
      expect(d).toContain('type DummyProvider');
    });
  });

  describe('DNA emission', () => {
    it('reports all 7 DNA artifacts', () => {
      expect([...result.dnaEmitted].sort()).toEqual([...DARE_DNA].sort());
    });

    it('llms.txt is substantive', async () => {
      const llms = await fs.readFile(path.join(appDir, 'llms.txt'), 'utf8');
      expect(llms.length).toBeGreaterThan(400);
      expect(llms).toMatch(/^#\s+my-api/m);
    });

    it('.env.example passes secret scan', async () => {
      const env = await fs.readFile(path.join(appDir, '.env.example'), 'utf8');
      for (const line of env.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const v = t.split('=', 2)[1] ?? '';
        expect(v).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
        expect(v).not.toMatch(/[a-f0-9]{32,}/);
      }
    });

    it('dare-ci.yml has audit/lint/test with govulncheck + golangci-lint + go test', async () => {
      const ci = await fs.readFile(
        path.join(appDir, '.github/workflows/dare-ci.yml'),
        'utf8',
      );
      expect(ci).toMatch(/^\s*audit:/m);
      expect(ci).toMatch(/^\s*lint:/m);
      expect(ci).toMatch(/^\s*test:/m);
      expect(ci).toContain('govulncheck');
      expect(ci).toContain('golangci-lint');
      expect(ci).toContain('go test');
    });
  });

  describe('postInstallSteps', () => {
    it('includes go mod tidy + sqlc generate + swag init + go run', () => {
      const j = result.postInstallSteps.join('\n');
      expect(j).toContain('cd my-api');
      expect(j).toContain('go mod tidy');
      expect(j).toContain('sqlc generate');
      expect(j).toContain('swag init');
      expect(j).toContain('go run ./cmd/server');
    });
  });
});
