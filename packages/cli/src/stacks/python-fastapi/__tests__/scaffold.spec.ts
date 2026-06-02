// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { python_fastapi } from '../scaffold.js';
import { DARE_DNA } from '../../types.js';

let tmpRoot: string;
let appDir: string;
let result: Awaited<ReturnType<typeof python_fastapi.generate>>;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fastapi-scaffold-'));
  appDir = path.join(tmpRoot, 'my-api');
  await fs.ensureDir(appDir);
  result = await python_fastapi.generate({
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

describe('python-fastapi scaffold', () => {
  describe('metadata', () => {
    it('id is python-fastapi, category backend', () => {
      expect(python_fastapi.id).toBe('python-fastapi');
      expect(python_fastapi.category).toBe('backend');
      expect(python_fastapi.status).toBe('stable');
    });
  });

  describe('filesWritten', () => {
    it('emits ≥ 25 files', () => {
      expect(result.filesWritten.length).toBeGreaterThanOrEqual(25);
    });

    it.each([
      'pyproject.toml',
      'README.md',
      'llms.txt',
      'openapi.json',
      '.env.example',
      'app/main.py',
      'app/core/config.py',
      'app/core/security.py',
      'app/db/session.py',
      'app/models/user.py',
      'app/schemas/user.py',
      'app/repositories/user_repository.py',
      'app/services/auth_service.py',
      'app/services/user_service.py',
      'app/routers/auth.py',
      'app/routers/users.py',
      'alembic.ini',
      'alembic/env.py',
      'alembic/versions/0001_create_users.py',
      'tests/test_auth.py',
      '.dare/skills.yml',
      '.github/workflows/dare-ci.yml',
    ])('writes anchor %s', (anchor) => {
      expect(result.filesWritten).toContain(anchor);
    });
  });

  describe('pyproject.toml', () => {
    let content: string;
    beforeAll(async () => {
      content = await fs.readFile(path.join(appDir, 'pyproject.toml'), 'utf8');
    });

    it('declares FastAPI + Pydantic + SQLAlchemy + Alembic', () => {
      expect(content).toContain('fastapi');
      expect(content).toContain('pydantic');
      expect(content).toContain('sqlalchemy');
      expect(content).toContain('alembic');
    });

    it('declares JWT (python-jose) + passlib + slowapi', () => {
      expect(content).toContain('python-jose');
      expect(content).toContain('passlib');
      expect(content).toContain('slowapi');
    });

    it('declares dev deps: pytest + ruff + pip-audit', () => {
      expect(content).toContain('pytest');
      expect(content).toContain('ruff');
      expect(content).toContain('pip-audit');
    });

    it('Python target >= 3.11', () => {
      expect(content).toMatch(/requires-python\s*=\s*">=3\.11"/);
    });
  });

  describe('main.py wires invariants', () => {
    let main: string;
    beforeAll(async () => {
      main = await fs.readFile(path.join(appDir, 'app/main.py'), 'utf8');
    });

    it('mounts auth + users routers', () => {
      expect(main).toContain('app.include_router(auth.router');
      expect(main).toContain('app.include_router(users.router');
    });

    it('configures slowapi rate limit', () => {
      expect(main).toContain('Limiter');
      expect(main).toContain('RateLimitExceeded');
    });

    it('configures CORS middleware', () => {
      expect(main).toContain('CORSMiddleware');
    });
  });

  describe('Layered Design', () => {
    it('routers never import sqlalchemy directly', async () => {
      const auth = await fs.readFile(path.join(appDir, 'app/routers/auth.py'), 'utf8');
      const users = await fs.readFile(path.join(appDir, 'app/routers/users.py'), 'utf8');
      expect(auth).not.toContain('from sqlalchemy ');
      expect(users).not.toContain('from sqlalchemy ');
    });

    it('repositories are present and used by services', async () => {
      const svc = await fs.readFile(path.join(appDir, 'app/services/auth_service.py'), 'utf8');
      expect(svc).toContain('UserRepository');
    });
  });

  describe('Alembic migration', () => {
    it('0001 creates users table with email index', async () => {
      const mig = await fs.readFile(
        path.join(appDir, 'alembic/versions/0001_create_users.py'),
        'utf8',
      );
      expect(mig).toContain('create_table');
      expect(mig).toContain('users');
      expect(mig).toContain('ix_users_email');
    });
  });

  describe('DNA emission', () => {
    it('reports all 7 DNA artifacts', () => {
      expect([...result.dnaEmitted].sort()).toEqual([...DARE_DNA].sort());
    });

    it('llms.txt is substantive (≥ 400 chars)', async () => {
      const llms = await fs.readFile(path.join(appDir, 'llms.txt'), 'utf8');
      expect(llms.length).toBeGreaterThan(400);
      expect(llms).toMatch(/^#\s+my-api/m);
    });

    it('.env.example has no secret-like values', async () => {
      const env = await fs.readFile(path.join(appDir, '.env.example'), 'utf8');
      for (const line of env.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const v = t.split('=', 2)[1] ?? '';
        expect(v).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
        expect(v).not.toMatch(/[a-f0-9]{32,}/);
      }
    });

    it('dare-ci.yml has audit/lint/test with pip-audit + ruff + pytest', async () => {
      const ci = await fs.readFile(
        path.join(appDir, '.github/workflows/dare-ci.yml'),
        'utf8',
      );
      expect(ci).toMatch(/^\s*audit:/m);
      expect(ci).toMatch(/^\s*lint:/m);
      expect(ci).toMatch(/^\s*test:/m);
      expect(ci).toContain('pip-audit');
      expect(ci).toContain('ruff check');
      expect(ci).toContain('pytest');
    });
  });

  describe('postInstallSteps', () => {
    it('includes venv setup + alembic + uvicorn', () => {
      const joined = result.postInstallSteps.join('\n');
      expect(joined).toContain('cd my-api');
      expect(joined).toContain('python -m venv');
      expect(joined).toContain('alembic upgrade head');
      expect(joined).toContain('uvicorn app.main:app');
    });
  });
});
