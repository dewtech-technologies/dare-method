// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { node_nestjs } from '../scaffold.js';
import { DARE_DNA } from '../../types.js';

let tmpRoot: string;
let appDir: string;
let result: Awaited<ReturnType<typeof node_nestjs.generate>>;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nestjs-scaffold-'));
  appDir = path.join(tmpRoot, 'my-api');
  await fs.ensureDir(appDir);
  result = await node_nestjs.generate({
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

describe('node-nestjs scaffold', () => {
  describe('metadata', () => {
    it('id is node-nestjs', () => {
      expect(node_nestjs.id).toBe('node-nestjs');
    });
    it('category is backend, status stable', () => {
      expect(node_nestjs.category).toBe('backend');
      expect(node_nestjs.status).toBe('stable');
    });
  });

  describe('filesWritten', () => {
    it('emits ≥ 25 files', () => {
      expect(result.filesWritten.length).toBeGreaterThanOrEqual(25);
    });

    it('list is sorted', () => {
      const sorted = [...result.filesWritten].sort();
      expect(result.filesWritten).toEqual(sorted);
    });

    it.each([
      'package.json',
      'tsconfig.json',
      'nest-cli.json',
      '.env.example',
      'llms.txt',
      'openapi.json',
      'README.md',
      'src/main.ts',
      'src/app.module.ts',
      'src/auth/auth.controller.ts',
      'src/auth/auth.service.ts',
      'src/auth/jwt.strategy.ts',
      'src/auth/dto/login.dto.ts',
      'src/users/users.controller.ts',
      'src/users/users.service.ts',
      'src/users/users.repository.ts',
      'src/prisma/prisma.service.ts',
      'prisma/schema.prisma',
      'prisma/seed.ts',
      '.dare/skills.yml',
      '.github/workflows/dare-ci.yml',
    ])('writes anchor file %s', (anchor) => {
      expect(result.filesWritten).toContain(anchor);
    });
  });

  describe('package.json', () => {
    let pkg: Record<string, unknown>;
    beforeAll(async () => {
      pkg = await fs.readJSON(path.join(appDir, 'package.json'));
    });

    it('has projectName as name', () => {
      expect(pkg.name).toBe('my-api');
    });

    it('declares NestJS core deps', () => {
      const deps = pkg.dependencies as Record<string, string>;
      expect(deps['@nestjs/core']).toBeDefined();
      expect(deps['@nestjs/common']).toBeDefined();
      expect(deps['@nestjs/jwt']).toBeDefined();
      expect(deps['@nestjs/swagger']).toBeDefined();
      expect(deps['@nestjs/throttler']).toBeDefined();
      expect(deps['@prisma/client']).toBeDefined();
      expect(deps['class-validator']).toBeDefined();
      expect(deps.bcrypt).toBeDefined();
    });

    it('declares prisma seed entry', () => {
      const prisma = pkg.prisma as { seed: string };
      expect(prisma.seed).toContain('seed.ts');
    });

    it('has DARE-shaped scripts', () => {
      const scripts = pkg.scripts as Record<string, string>;
      expect(scripts['start:dev']).toBeDefined();
      expect(scripts.test).toBeDefined();
      expect(scripts.lint).toBeDefined();
      expect(scripts.audit).toContain('--audit-level=high');
    });
  });

  describe('main.ts wires the DARE invariants', () => {
    let main: string;
    beforeAll(async () => {
      main = await fs.readFile(path.join(appDir, 'src/main.ts'), 'utf8');
    });

    it('configures Swagger', () => {
      expect(main).toContain('SwaggerModule.setup');
    });

    it('writes openapi.json on bootstrap', () => {
      expect(main).toContain("'openapi.json'");
    });

    it('uses ValidationPipe globally', () => {
      expect(main).toContain('ValidationPipe');
    });
  });

  describe('rate limit (DNA artifact 5)', () => {
    it('app.module.ts configures ThrottlerModule.forRoot with env knobs', async () => {
      const app = await fs.readFile(path.join(appDir, 'src/app.module.ts'), 'utf8');
      expect(app).toContain('ThrottlerModule.forRoot');
      expect(app).toContain('RATE_LIMIT_RPM');
    });
  });

  describe('Layered Design (handlers/services/repositories/models)', () => {
    it.each(['auth', 'users'])('module %s has controller + service', async (mod) => {
      expect(
        await fs.pathExists(path.join(appDir, `src/${mod}/${mod}.controller.ts`)),
      ).toBe(true);
      expect(
        await fs.pathExists(path.join(appDir, `src/${mod}/${mod}.service.ts`)),
      ).toBe(true);
    });

    it('users has a repository (not Prisma in controller)', async () => {
      expect(
        await fs.pathExists(path.join(appDir, 'src/users/users.repository.ts')),
      ).toBe(true);
      const ctrl = await fs.readFile(
        path.join(appDir, 'src/users/users.controller.ts'),
        'utf8',
      );
      expect(ctrl).not.toContain('PrismaService');
    });
  });

  describe('DNA emission', () => {
    it('reports all 7 DNA artifacts emitted', () => {
      expect([...result.dnaEmitted].sort()).toEqual([...DARE_DNA].sort());
    });

    it('llms.txt is substantive', async () => {
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

    it('dare-ci.yml has audit, lint, test jobs', async () => {
      const ci = await fs.readFile(
        path.join(appDir, '.github/workflows/dare-ci.yml'),
        'utf8',
      );
      expect(ci).toMatch(/^\s*audit:/m);
      expect(ci).toMatch(/^\s*lint:/m);
      expect(ci).toMatch(/^\s*test:/m);
      expect(ci).toContain('--audit-level=high');
    });
  });

  describe('postInstallSteps', () => {
    it('includes cd, prisma migrate, start:dev', () => {
      const joined = result.postInstallSteps.join('\n');
      expect(joined).toContain('cd my-api');
      expect(joined).toContain('prisma migrate');
      expect(joined).toContain('start:dev');
    });
  });
});
