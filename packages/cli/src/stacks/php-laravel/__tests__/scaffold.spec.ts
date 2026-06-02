// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { php_laravel } from '../scaffold.js';
import { DARE_DNA } from '../../types.js';

let tmpRoot: string;
let appDir: string;
let result: Awaited<ReturnType<typeof php_laravel.generate>>;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'laravel-scaffold-'));
  appDir = path.join(tmpRoot, 'my-api');
  await fs.ensureDir(appDir);
  result = await php_laravel.generate({
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

describe('php-laravel scaffold', () => {
  describe('metadata', () => {
    it('id is php-laravel, backend, stable', () => {
      expect(php_laravel.id).toBe('php-laravel');
      expect(php_laravel.category).toBe('backend');
      expect(php_laravel.status).toBe('stable');
    });
  });

  describe('filesWritten', () => {
    it('emits ≥ 25 files', () => {
      expect(result.filesWritten.length).toBeGreaterThanOrEqual(25);
    });

    it.each([
      'composer.json',
      'artisan',
      'bootstrap/app.php',
      'bootstrap/providers.php',
      'config/sanctum.php',
      'config/reverb.php',
      'config/l5-swagger.php',
      'app/Http/Controllers/Api/AuthController.php',
      'app/Http/Controllers/Api/UsersController.php',
      'app/Http/Requests/LoginRequest.php',
      'app/Http/Requests/CreateUserRequest.php',
      'app/Services/AuthService.php',
      'app/Services/UsersService.php',
      'app/Repositories/UsersRepository.php',
      'app/Models/User.php',
      'app/Llm/Contracts/LlmProvider.php',
      'app/Llm/Providers/DummyProvider.php',
      'app/Llm/Providers/OpenAiProvider.php',
      'database/migrations/2026_06_01_000001_create_users_table.php',
      'database/seeders/DatabaseSeeder.php',
      'routes/api.php',
      'routes/channels.php',
      'tests/Feature/AuthTest.php',
      'tests/Feature/UsersTest.php',
      'tests/Pest.php',
      'phpstan.neon',
      '.env.example',
      'llms.txt',
      'openapi.json',
      '.dare/skills.yml',
      '.github/workflows/dare-ci.yml',
    ])('writes anchor %s', (anchor) => {
      expect(result.filesWritten).toContain(anchor);
    });
  });

  describe('composer.json', () => {
    let pkg: Record<string, unknown>;
    beforeAll(async () => {
      pkg = await fs.readJSON(path.join(appDir, 'composer.json'));
    });

    it('uses projectName slug', () => {
      expect(pkg.name).toContain('my-api');
    });

    it('declares Laravel + Sanctum + Reverb + Pail + l5-swagger', () => {
      const req = pkg.require as Record<string, string>;
      expect(req['laravel/framework']).toBeDefined();
      expect(req['laravel/sanctum']).toBeDefined();
      expect(req['laravel/reverb']).toBeDefined();
      expect(req['laravel/pail']).toBeDefined();
      expect(req['darkaonline/l5-swagger']).toBeDefined();
    });

    it('declares dev deps: pest + larastan + pint', () => {
      const dev = pkg['require-dev'] as Record<string, string>;
      expect(dev['pestphp/pest']).toBeDefined();
      expect(dev['larastan/larastan']).toBeDefined();
      expect(dev['laravel/pint']).toBeDefined();
    });

    it('has audit script', () => {
      const scripts = pkg.scripts as Record<string, string>;
      expect(scripts.audit).toBe('composer audit');
    });
  });

  describe('bootstrap/app.php', () => {
    let bootstrap: string;
    beforeAll(async () => {
      bootstrap = await fs.readFile(path.join(appDir, 'bootstrap/app.php'), 'utf8');
    });

    it('configures rate limit via RateLimiter::for("api")', () => {
      expect(bootstrap).toContain("RateLimiter::for('api'");
      expect(bootstrap).toContain('RATE_LIMIT_PER_MIN');
    });

    it('mounts api + channels routes', () => {
      expect(bootstrap).toContain("api: __DIR__.'/../routes/api.php'");
      expect(bootstrap).toContain("channels: __DIR__.'/../routes/channels.php'");
    });

    it('applies throttleApi middleware', () => {
      expect(bootstrap).toContain('throttleApi');
    });
  });

  describe('Layered Design', () => {
    it('controller delegates to service (no Eloquent queries)', async () => {
      const auth = await fs.readFile(
        path.join(appDir, 'app/Http/Controllers/Api/AuthController.php'),
        'utf8',
      );
      const users = await fs.readFile(
        path.join(appDir, 'app/Http/Controllers/Api/UsersController.php'),
        'utf8',
      );
      // Controllers should not import User model directly (repos do)
      expect(auth).not.toContain('App\\Models\\User');
      expect(users).not.toContain('App\\Models\\User;');
      expect(auth).toContain('AuthService');
      expect(users).toContain('UsersService');
    });

    it('repository is the only layer that touches User::query()', async () => {
      const repo = await fs.readFile(
        path.join(appDir, 'app/Repositories/UsersRepository.php'),
        'utf8',
      );
      expect(repo).toContain('User::query()');
    });
  });

  describe('Sanctum auth wiring', () => {
    it('routes/api.php uses auth:sanctum middleware', async () => {
      const routes = await fs.readFile(path.join(appDir, 'routes/api.php'), 'utf8');
      expect(routes).toContain("middleware('auth:sanctum')");
    });

    it('User model uses HasApiTokens', async () => {
      const user = await fs.readFile(path.join(appDir, 'app/Models/User.php'), 'utf8');
      expect(user).toContain('HasApiTokens');
    });
  });

  describe('LLM abstraction', () => {
    it('LlmProvider contract is defined', async () => {
      const contract = await fs.readFile(
        path.join(appDir, 'app/Llm/Contracts/LlmProvider.php'),
        'utf8',
      );
      expect(contract).toContain('interface LlmProvider');
    });

    it('Dummy and OpenAi providers implement the contract', async () => {
      const dummy = await fs.readFile(
        path.join(appDir, 'app/Llm/Providers/DummyProvider.php'),
        'utf8',
      );
      const openai = await fs.readFile(
        path.join(appDir, 'app/Llm/Providers/OpenAiProvider.php'),
        'utf8',
      );
      expect(dummy).toContain('implements LlmProvider');
      expect(openai).toContain('implements LlmProvider');
    });
  });

  describe('Migration', () => {
    it('creates users table with email index', async () => {
      const m = await fs.readFile(
        path.join(appDir, 'database/migrations/2026_06_01_000001_create_users_table.php'),
        'utf8',
      );
      expect(m).toContain("Schema::create('users'");
      expect(m).toContain("\$table->index('email')");
      expect(m).toContain('uuid');
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

    it('dare-ci.yml has audit/lint/test with composer audit + phpstan + pest', async () => {
      const ci = await fs.readFile(
        path.join(appDir, '.github/workflows/dare-ci.yml'),
        'utf8',
      );
      expect(ci).toMatch(/^\s*audit:/m);
      expect(ci).toMatch(/^\s*lint:/m);
      expect(ci).toMatch(/^\s*test:/m);
      expect(ci).toContain('composer audit');
      expect(ci).toContain('phpstan');
      expect(ci).toContain('pest');
    });
  });

  describe('postInstallSteps', () => {
    it('includes composer install + key:generate + migrate + serve', () => {
      const j = result.postInstallSteps.join('\n');
      expect(j).toContain('cd my-api');
      expect(j).toContain('composer install');
      expect(j).toContain('php artisan key:generate');
      expect(j).toContain('php artisan migrate');
      expect(j).toContain('php artisan serve');
    });
  });
});
