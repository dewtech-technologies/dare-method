// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { go_stdlib } from '../scaffold.js';
import { DARE_DNA } from '../../types.js';

let tmpRoot: string;
let appDir: string;
let result: Awaited<ReturnType<typeof go_stdlib.generate>>;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gostd-scaffold-'));
  appDir = path.join(tmpRoot, 'my-api');
  await fs.ensureDir(appDir);
  result = await go_stdlib.generate({
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

describe('go-stdlib scaffold', () => {
  describe('metadata', () => {
    it('id is go-stdlib, backend, stable', () => {
      expect(go_stdlib.id).toBe('go-stdlib');
      expect(go_stdlib.category).toBe('backend');
      expect(go_stdlib.status).toBe('stable');
    });
  });

  describe('filesWritten', () => {
    it('emits ≥ 25 files', () => {
      expect(result.filesWritten.length).toBeGreaterThanOrEqual(25);
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
      'internal/httpx/json.go',
      'internal/handler/auth_handler.go',
      'internal/handler/users_handler.go',
      'internal/handler/ws_handler.go',
      'internal/service/auth_service.go',
      'internal/service/users_service.go',
      'internal/repository/users_repository.go',
      'internal/model/user.go',
      'internal/middleware/chain.go',
      'internal/middleware/jwt.go',
      'internal/middleware/rate_limit.go',
      'internal/middleware/cors.go',
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

  describe('go.mod — minimum-deps philosophy', () => {
    let mod: string;
    beforeAll(async () => {
      mod = await fs.readFile(path.join(appDir, 'go.mod'), 'utf8');
    });

    it('uses moduleName from projectName', () => {
      expect(mod).toMatch(/^module\s+my-api/m);
    });

    it('targets Go 1.22+ (required for ServeMux patterns)', () => {
      expect(mod).toMatch(/^go 1\.2[2-9]/m);
    });

    it('does NOT declare a web framework (gin/echo/chi/fiber)', () => {
      expect(mod).not.toContain('gin-gonic');
      expect(mod).not.toContain('labstack/echo');
      expect(mod).not.toContain('go-chi/chi');
      expect(mod).not.toContain('gofiber/fiber');
    });

    it('uses coder/websocket (modern nhooyr fork)', () => {
      expect(mod).toContain('coder/websocket');
    });

    it('declares pgx + jwt + bcrypt + uuid + env + time/rate', () => {
      expect(mod).toContain('jackc/pgx/v5');
      expect(mod).toContain('golang-jwt/jwt/v5');
      expect(mod).toContain('golang.org/x/crypto');
      expect(mod).toContain('google/uuid');
      expect(mod).toContain('caarlos0/env');
      expect(mod).toContain('golang.org/x/time');
    });
  });

  describe('main.go — net/http 1.22 patterns', () => {
    let main: string;
    beforeAll(async () => {
      main = await fs.readFile(path.join(appDir, 'cmd/server/main.go'), 'utf8');
    });

    it('uses http.NewServeMux (no gin/chi)', () => {
      expect(main).toContain('http.NewServeMux');
      expect(main).not.toContain('gin.New');
    });

    it('uses method+pattern routing (Go 1.22)', () => {
      expect(main).toMatch(/"POST \/auth\/login"/);
      expect(main).toMatch(/"GET \/users"/);
      expect(main).toMatch(/"POST \/users"/);
    });

    it('applies middleware via Chain helper', () => {
      expect(main).toContain('middleware.Chain');
    });

    it('uses moduleName-prefixed imports', () => {
      expect(main).toContain('"my-api/internal/');
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

  describe('Middleware', () => {
    it('Chain composes left-to-right', async () => {
      const chain = await fs.readFile(
        path.join(appDir, 'internal/middleware/chain.go'),
        'utf8',
      );
      expect(chain).toContain('type Middleware');
      expect(chain).toContain('Chain(h http.Handler');
      expect(chain).toContain('ClaimsContextKey');
    });

    it('RateLimit uses x/time/rate per IP', async () => {
      const rl = await fs.readFile(
        path.join(appDir, 'internal/middleware/rate_limit.go'),
        'utf8',
      );
      expect(rl).toContain('rate.NewLimiter');
      expect(rl).toContain('rate.Limit');
    });

    it('CORS uses whitelist (never *)', async () => {
      const cors = await fs.readFile(
        path.join(appDir, 'internal/middleware/cors.go'),
        'utf8',
      );
      expect(cors).toContain('Access-Control-Allow-Origin');
      expect(cors).not.toMatch(/Access-Control-Allow-Origin.*\*/);
    });
  });

  describe('Migration', () => {
    it('up creates users with UNIQUE email + index', async () => {
      const sql = await fs.readFile(
        path.join(appDir, 'db/migrations/0001_create_users.up.sql'),
        'utf8',
      );
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('UNIQUE');
      expect(sql).toContain('ix_users_email');
    });

    it('down rolls back', async () => {
      const sql = await fs.readFile(
        path.join(appDir, 'db/migrations/0001_create_users.down.sql'),
        'utf8',
      );
      expect(sql).toContain('DROP TABLE');
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

    it('dare-ci.yml has govulncheck + golangci-lint + go test', async () => {
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
    it('includes go mod tidy + sqlc generate + go run', () => {
      const j = result.postInstallSteps.join('\n');
      expect(j).toContain('cd my-api');
      expect(j).toContain('go mod tidy');
      expect(j).toContain('sqlc generate');
      expect(j).toContain('go run ./cmd/server');
    });

    it('does NOT install swag (this stack ships static openapi.json)', () => {
      const j = result.postInstallSteps.join('\n');
      expect(j).not.toContain('swag init');
    });
  });
});
