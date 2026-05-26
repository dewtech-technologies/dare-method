/**
 * dare-layered-design — metrics tests (M-01 to M-04)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LayeredDesignMetrics } from '../metrics.js';

describe('LayeredDesignMetrics', () => {
  let tmpDir: string;
  let metrics: LayeredDesignMetrics;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-ld-metrics-test-'));
    metrics = new LayeredDesignMetrics();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── M-01 ──────────────────────────────────────────────────────────────

  describe('M-01: Services have unit tests', () => {
    it('passes when every service has a spec file', () => {
      const servicesDir = path.join(tmpDir, 'src', 'services');
      const testsDir = path.join(tmpDir, 'tests');
      fs.mkdirSync(servicesDir, { recursive: true });
      fs.mkdirSync(testsDir, { recursive: true });

      fs.writeFileSync(path.join(servicesDir, 'create_user_service.ts'), 'export class CreateUserService {}', 'utf-8');
      fs.writeFileSync(path.join(testsDir, 'create_user_service.spec.ts'), 'describe("CreateUserService", () => {});', 'utf-8');

      const result = metrics.collectM01(tmpDir);

      expect(result.id).toBe('M-01');
      expect(result.pass).toBe(true);
    });

    it('fails when a service has no test file', () => {
      const servicesDir = path.join(tmpDir, 'src', 'services');
      fs.mkdirSync(servicesDir, { recursive: true });
      fs.writeFileSync(
        path.join(servicesDir, 'create_order_service.ts'),
        'export class CreateOrderService {}',
        'utf-8'
      );

      const result = metrics.collectM01(tmpDir);

      expect(result.pass).toBe(false);
      expect(result.detail).toContain('create_order_service');
    });

    it('fails when no services directory exists', () => {
      const result = metrics.collectM01(tmpDir);

      expect(result.pass).toBe(false);
      expect(result.detail).toContain('No service files found');
    });

    it('passes with co-located test file', () => {
      const servicesDir = path.join(tmpDir, 'src', 'services');
      fs.mkdirSync(servicesDir, { recursive: true });

      fs.writeFileSync(
        path.join(servicesDir, 'send_email_service.ts'),
        'export class SendEmailService {}',
        'utf-8'
      );
      // Co-located spec
      fs.writeFileSync(
        path.join(servicesDir, 'send_email_service.spec.ts'),
        'describe("SendEmailService", () => {});',
        'utf-8'
      );

      const result = metrics.collectM01(tmpDir);
      expect(result.pass).toBe(true);
    });
  });

  // ── M-02 ──────────────────────────────────────────────────────────────

  describe('M-02: 0% Handler→Repository calls', () => {
    it('passes when no handler files exist', () => {
      const result = metrics.collectM02(tmpDir);

      expect(result.id).toBe('M-02');
      expect(result.pass).toBe(true);
    });

    it('passes when handlers only import services', () => {
      const handlersDir = path.join(tmpDir, 'src', 'handlers');
      fs.mkdirSync(handlersDir, { recursive: true });
      fs.writeFileSync(
        path.join(handlersDir, 'user_handler.ts'),
        `import { CreateUserService } from '../services/create_user_service';
export class UserHandler {
  constructor(private service: CreateUserService) {}
  async create(req: any, res: any) {
    const user = await this.service.execute(req.body);
    res.json(user);
  }
}
`,
        'utf-8'
      );
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}', 'utf-8');

      const result = metrics.collectM02(tmpDir);
      expect(result.pass).toBe(true);
    });

    it('fails when handler imports Repository', () => {
      const handlersDir = path.join(tmpDir, 'src', 'handlers');
      fs.mkdirSync(handlersDir, { recursive: true });
      fs.writeFileSync(
        path.join(handlersDir, 'user_handler.ts'),
        `import { UserRepository } from '../repositories/user_repository';
export class UserHandler {
  async get(req: any, res: any) {
    const repo = new UserRepository();
    res.json(await repo.findById(req.params.id));
  }
}
`,
        'utf-8'
      );
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}', 'utf-8');

      const result = metrics.collectM02(tmpDir);
      expect(result.pass).toBe(false);
      expect(result.detail).toContain('violation');
    });
  });

  // ── M-03 ──────────────────────────────────────────────────────────────

  describe('M-03: Handlers use dependency injection', () => {
    it('passes when no handlers exist', () => {
      const result = metrics.collectM03(tmpDir);

      expect(result.id).toBe('M-03');
      expect(result.pass).toBe(true);
    });

    it('passes when handler receives service via constructor', () => {
      const handlersDir = path.join(tmpDir, 'src', 'handlers');
      fs.mkdirSync(handlersDir, { recursive: true });
      fs.writeFileSync(
        path.join(handlersDir, 'order_handler.ts'),
        `export class OrderHandler {
  constructor(private readonly createOrderService: CreateOrderService) {}
  async create(req: any, res: any) {
    const order = await this.createOrderService.execute(req.body);
    res.json(order);
  }
}
`,
        'utf-8'
      );

      const result = metrics.collectM03(tmpDir);
      expect(result.pass).toBe(true);
    });

    it('fails when handler instantiates service with new', () => {
      const handlersDir = path.join(tmpDir, 'src', 'handlers');
      fs.mkdirSync(handlersDir, { recursive: true });
      fs.writeFileSync(
        path.join(handlersDir, 'product_handler.ts'),
        `export class ProductHandler {
  async create(req: any, res: any) {
    const service = new CreateProductService();  // VIOLATION
    const product = await service.execute(req.body);
    res.json(product);
  }
}
`,
        'utf-8'
      );

      const result = metrics.collectM03(tmpDir);
      expect(result.pass).toBe(false);
      expect(result.detail).toContain('new');
    });
  });

  // ── M-04 ──────────────────────────────────────────────────────────────

  describe('M-04: Repositories agnostic to upper layers', () => {
    it('passes when no repository directories exist', () => {
      const result = metrics.collectM04(tmpDir);

      expect(result.id).toBe('M-04');
      expect(result.pass).toBe(true);
    });

    it('passes when repository has no HTTP concerns', () => {
      const reposDir = path.join(tmpDir, 'src', 'repositories');
      fs.mkdirSync(reposDir, { recursive: true });
      fs.writeFileSync(
        path.join(reposDir, 'user_repository.ts'),
        `export class UserRepository {
  async findById(id: string) {
    return this.db.query('SELECT * FROM users WHERE id = $1', [id]);
  }
  async save(user: any) {
    return this.db.query('INSERT INTO users ...', [user.id, user.email]);
  }
}
`,
        'utf-8'
      );

      const result = metrics.collectM04(tmpDir);
      expect(result.pass).toBe(true);
    });

    it('fails when repository returns HTTP status code', () => {
      const reposDir = path.join(tmpDir, 'src', 'repositories');
      fs.mkdirSync(reposDir, { recursive: true });
      fs.writeFileSync(
        path.join(reposDir, 'order_repository.ts'),
        `export class OrderRepository {
  async findById(id: string) {
    const order = await this.db.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (!order) {
      return { status: 404, error: 'Not found' };  // VIOLATION — repo should not know about HTTP
    }
    return order;
  }
}
`,
        'utf-8'
      );

      const result = metrics.collectM04(tmpDir);
      expect(result.pass).toBe(false);
      expect(result.detail).toContain('HTTP');
    });

    it('fails when repository throws NestJS HttpException', () => {
      const reposDir = path.join(tmpDir, 'src', 'repositories');
      fs.mkdirSync(reposDir, { recursive: true });
      fs.writeFileSync(
        path.join(reposDir, 'user_repository.ts'),
        `import { HttpException } from '@nestjs/common';
export class UserRepository {
  async findById(id: string) {
    const user = await this.db.find(id);
    if (!user) throw new HttpException('Not found', 404);  // VIOLATION
    return user;
  }
}
`,
        'utf-8'
      );

      const result = metrics.collectM04(tmpDir);
      expect(result.pass).toBe(false);
    });
  });

  // ── collect() ─────────────────────────────────────────────────────────

  describe('collect()', () => {
    it('returns 4 metric results', () => {
      const results = metrics.collect(tmpDir);
      expect(results).toHaveLength(4);
      expect(results.map((r) => r.id)).toEqual(['M-01', 'M-02', 'M-03', 'M-04']);
    });

    it('M-02, M-03, M-04 pass for empty project (no files to scan)', () => {
      const results = metrics.collect(tmpDir);

      // M-01 fails (no services), M-02/M-03/M-04 pass (nothing to scan)
      expect(results.find((r) => r.id === 'M-02')!.pass).toBe(true);
      expect(results.find((r) => r.id === 'M-03')!.pass).toBe(true);
      expect(results.find((r) => r.id === 'M-04')!.pass).toBe(true);
    });
  });
});
