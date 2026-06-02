// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { rust_axum } from '../scaffold.js';
import { DARE_DNA } from '../../types.js';

let tmpRoot: string;
let appDir: string;
let result: Awaited<ReturnType<typeof rust_axum.generate>>;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'axum-scaffold-'));
  appDir = path.join(tmpRoot, 'my-api');
  await fs.ensureDir(appDir);
  result = await rust_axum.generate({
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

describe('rust-axum scaffold', () => {
  describe('metadata', () => {
    it('id is rust-axum, backend, stable', () => {
      expect(rust_axum.id).toBe('rust-axum');
      expect(rust_axum.category).toBe('backend');
      expect(rust_axum.status).toBe('stable');
    });
  });

  describe('filesWritten', () => {
    it('emits ≥ 25 files', () => {
      expect(result.filesWritten.length).toBeGreaterThanOrEqual(25);
    });

    it.each([
      'Cargo.toml',
      '.env.example',
      'llms.txt',
      'openapi.json',
      'README.md',
      'src/main.rs',
      'src/lib.rs',
      'src/config.rs',
      'src/errors.rs',
      'src/handlers/auth.rs',
      'src/handlers/users.rs',
      'src/handlers/ws.rs',
      'src/services/auth_service.rs',
      'src/services/user_service.rs',
      'src/repositories/user_repository.rs',
      'src/models/user.rs',
      'src/middleware/auth.rs',
      'src/middleware/rate_limit.rs',
      'src/llm/provider.rs',
      'migrations/0001_create_users.sql',
      'tests/integration_test.rs',
      '.dare/skills.yml',
      '.github/workflows/dare-ci.yml',
    ])('writes anchor %s', (anchor) => {
      expect(result.filesWritten).toContain(anchor);
    });
  });

  describe('Cargo.toml', () => {
    let toml: string;
    beforeAll(async () => {
      toml = await fs.readFile(path.join(appDir, 'Cargo.toml'), 'utf8');
    });

    it('uses crateName (underscore form of projectName)', () => {
      expect(toml).toContain('name = "my_api"');
    });

    it('declares axum + tokio + tower-http + tower_governor', () => {
      expect(toml).toContain('axum = ');
      expect(toml).toContain('tokio = ');
      expect(toml).toContain('tower-http');
      expect(toml).toContain('tower_governor');
    });

    it('declares utoipa for OpenAPI', () => {
      expect(toml).toContain('utoipa');
    });

    it('declares jsonwebtoken + argon2', () => {
      expect(toml).toContain('jsonwebtoken');
      expect(toml).toContain('argon2');
    });

    it('declares sqlx with postgres + migrate features', () => {
      expect(toml).toContain('sqlx');
      expect(toml).toContain('postgres');
      expect(toml).toContain('migrate');
    });

    it('declares async-trait for LLM trait dyn-compat', () => {
      expect(toml).toContain('async-trait');
    });
  });

  describe('main.rs wires invariants', () => {
    let main: string;
    beforeAll(async () => {
      main = await fs.readFile(path.join(appDir, 'src/main.rs'), 'utf8');
    });

    it('mounts auth + users + ws routes', () => {
      expect(main).toContain('"/auth/login"');
      expect(main).toContain('"/auth/me"');
      expect(main).toContain('"/users"');
      expect(main).toContain('"/ws"');
      expect(main).toContain('"/openapi.json"');
    });

    it('applies governor (rate limit) + CORS layers', () => {
      expect(main).toContain('governor_layer');
      expect(main).toContain('cors');
    });

    it('runs sqlx migrate on boot', () => {
      expect(main).toContain('sqlx::migrate!');
    });

    it('uses tracing_subscriber for structured logs', () => {
      expect(main).toContain('tracing_subscriber');
    });
  });

  describe('Layered Design', () => {
    it('handlers never call sqlx directly', async () => {
      const auth = await fs.readFile(path.join(appDir, 'src/handlers/auth.rs'), 'utf8');
      const users = await fs.readFile(path.join(appDir, 'src/handlers/users.rs'), 'utf8');
      expect(auth).not.toContain('sqlx::');
      expect(users).not.toContain('sqlx::');
    });

    it('repository owns all sqlx queries', async () => {
      const repo = await fs.readFile(
        path.join(appDir, 'src/repositories/user_repository.rs'),
        'utf8',
      );
      expect(repo).toContain('sqlx::query_as');
      expect(repo).toContain('SELECT');
    });

    it('services orchestrate (no SQL strings)', async () => {
      const svc = await fs.readFile(path.join(appDir, 'src/services/user_service.rs'), 'utf8');
      expect(svc).not.toMatch(/\bSELECT\b/);
      expect(svc).not.toMatch(/\bINSERT\b/);
    });
  });

  describe('Migration', () => {
    it('creates users table with UNIQUE email + index', async () => {
      const sql = await fs.readFile(
        path.join(appDir, 'migrations/0001_create_users.sql'),
        'utf8',
      );
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('users');
      expect(sql).toContain('UNIQUE');
      expect(sql).toContain('ix_users_email');
    });
  });

  describe('Rate limit middleware', () => {
    it('uses tower_governor with env knobs', async () => {
      const rl = await fs.readFile(
        path.join(appDir, 'src/middleware/rate_limit.rs'),
        'utf8',
      );
      expect(rl).toContain('GovernorConfigBuilder');
      expect(rl).toContain('per_second');
      expect(rl).toContain('burst_size');
    });
  });

  describe('LLM abstraction', () => {
    it('LlmProvider trait + Dummy + OpenAi impls', async () => {
      const p = await fs.readFile(path.join(appDir, 'src/llm/provider.rs'), 'utf8');
      expect(p).toContain('trait LlmProvider');
      expect(p).toContain('struct DummyProvider');
      expect(p).toContain('struct OpenAiProvider');
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

    it('.env.example placeholders pass secret scan', async () => {
      const env = await fs.readFile(path.join(appDir, '.env.example'), 'utf8');
      for (const line of env.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const v = t.split('=', 2)[1] ?? '';
        expect(v).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
        expect(v).not.toMatch(/[a-f0-9]{32,}/);
      }
    });

    it('dare-ci.yml has audit/lint/test with cargo audit + clippy + cargo test', async () => {
      const ci = await fs.readFile(
        path.join(appDir, '.github/workflows/dare-ci.yml'),
        'utf8',
      );
      expect(ci).toMatch(/^\s*audit:/m);
      expect(ci).toMatch(/^\s*lint:/m);
      expect(ci).toMatch(/^\s*test:/m);
      expect(ci).toContain('cargo audit');
      expect(ci).toContain('clippy');
      expect(ci).toContain('cargo test');
      expect(ci).toContain('-D warnings');
    });
  });

  describe('postInstallSteps', () => {
    it('includes sqlx migrate + cargo run', () => {
      const j = result.postInstallSteps.join('\n');
      expect(j).toContain('cd my-api');
      expect(j).toContain('sqlx');
      expect(j).toContain('cargo run');
    });
  });
});
