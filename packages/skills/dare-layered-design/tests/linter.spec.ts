/**
 * dare-layered-design — linter tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LayeredDesignLinter } from '../linter.js';

describe('LayeredDesignLinter', () => {
  let tmpDir: string;
  let linter: LayeredDesignLinter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-linter-test-'));
    linter = new LayeredDesignLinter();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── TypeScript / JavaScript ──────────────────────────────────────────────

  describe('TypeScript handler violations', () => {
    function createHandlerFile(name: string, content: string): string {
      const handlersDir = path.join(tmpDir, 'src', 'handlers');
      fs.mkdirSync(handlersDir, { recursive: true });
      const file = path.join(handlersDir, name);
      fs.writeFileSync(file, content, 'utf-8');
      // Create tsconfig.json so language is detected
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}', 'utf-8');
      return file;
    }

    it('detects import of Repository in handler (TS)', () => {
      createHandlerFile(
        'user_handler.ts',
        `import { UserRepository } from '../repositories/user_repository';
export class UserHandler {
  async create(req: Request, res: Response) {
    const repo = new UserRepository();
    res.json(await repo.save(req.body));
  }
}
`
      );

      const result = linter.lint(tmpDir, 'typescript');
      expect(result.pass).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].message).toContain('Repository');
    });

    it('detects direct instantiation of Repository in handler (TS)', () => {
      createHandlerFile(
        'order_handler.ts',
        `export class OrderHandler {
  async create(req: Request, res: Response) {
    const repo = new OrderRepository();  // VIOLATION
    const order = await repo.save(req.body);
    res.json(order);
  }
}
`
      );

      const result = linter.lint(tmpDir, 'typescript');
      expect(result.pass).toBe(false);
      expect(result.violations.some((v) => v.message.includes('instantiates'))).toBe(true);
    });

    it('detects direct repository method call in handler (TS)', () => {
      createHandlerFile(
        'product_handler.ts',
        `const userRepository = new UserRepository();

export async function getUser(req: Request, res: Response) {
  const user = await userRepository.findById(req.params.id);  // VIOLATION
  res.json(user);
}
`
      );

      const result = linter.lint(tmpDir, 'typescript');
      expect(result.pass).toBe(false);
    });

    it('does not flag a handler that only uses services (no violation)', () => {
      createHandlerFile(
        'user_handler.ts',
        `export class UserHandler {
  constructor(private readonly createUserService: CreateUserService) {}

  async create(req: Request, res: Response) {
    const user = await this.createUserService.execute(req.body);
    res.status(201).json(user);
  }
}
`
      );

      const result = linter.lint(tmpDir, 'typescript');
      expect(result.pass).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('does not flag import of Service in handler', () => {
      createHandlerFile(
        'user_handler.ts',
        `import { CreateUserService } from '../services/create_user_service';

export class UserHandler {
  constructor(private readonly service: CreateUserService) {}

  async create(req: Request, res: Response) {
    const user = await this.service.execute(req.body);
    res.json(user);
  }
}
`
      );

      const result = linter.lint(tmpDir, 'typescript');
      expect(result.pass).toBe(true);
    });

    it('skips commented-out violations', () => {
      createHandlerFile(
        'user_handler.ts',
        `export class UserHandler {
  async create(req: Request, res: Response) {
    // const repo = new UserRepository(); // This would be a violation if uncommented
    const user = await this.service.execute(req.body);
    res.json(user);
  }
}
`
      );

      const result = linter.lint(tmpDir, 'typescript');
      expect(result.pass).toBe(true);
    });
  });

  // ── Ruby ──────────────────────────────────────────────────────────────────

  describe('Ruby handler violations', () => {
    function createRubyHandlerFile(name: string, content: string): string {
      const controllersDir = path.join(tmpDir, 'app', 'controllers');
      fs.mkdirSync(controllersDir, { recursive: true });
      const file = path.join(controllersDir, name);
      fs.writeFileSync(file, content, 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'Gemfile'), 'source "https://rubygems.org"', 'utf-8');
      return file;
    }

    it('detects Repository call in Rails controller', () => {
      createRubyHandlerFile(
        'users_controller.rb',
        `class UsersController < ApplicationController
  def create
    user = UserRepository.save(user_params)  # VIOLATION
    render json: user
  end
end
`
      );

      const result = linter.lint(tmpDir, 'ruby');
      expect(result.pass).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('passes when controller only calls service', () => {
      createRubyHandlerFile(
        'users_controller.rb',
        `class UsersController < ApplicationController
  def initialize(create_user_service:)
    @create_user_service = create_user_service
  end

  def create
    user = @create_user_service.call(user_params)
    render json: user, status: :created
  end
end
`
      );

      const result = linter.lint(tmpDir, 'ruby');
      expect(result.pass).toBe(true);
    });
  });

  // ── lintFile() ────────────────────────────────────────────────────────────

  describe('lintFile()', () => {
    it('lints a single TypeScript handler file', () => {
      const file = path.join(tmpDir, 'user_handler.ts');
      fs.writeFileSync(
        file,
        `import { UserRepository } from '../repositories/user_repository';\n`,
        'utf-8'
      );

      const result = linter.lintFile(file, 'typescript');
      expect(result.pass).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('returns pass=true for clean handler file', () => {
      const file = path.join(tmpDir, 'user_handler.ts');
      fs.writeFileSync(
        file,
        `import { CreateUserService } from '../services/create_user_service';\n`,
        'utf-8'
      );

      const result = linter.lintFile(file, 'typescript');
      expect(result.pass).toBe(true);
    });

    it('returns filesScanned=1 for single file lint', () => {
      const file = path.join(tmpDir, 'user_handler.ts');
      fs.writeFileSync(file, 'export const x = 1;\n', 'utf-8');

      const result = linter.lintFile(file, 'typescript');
      expect(result.filesScanned).toBe(1);
    });
  });

  // ── Empty project ─────────────────────────────────────────────────────────

  it('returns pass=true with 0 violations for empty project', () => {
    const result = linter.lint(tmpDir);
    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('reports filesScanned > 0 when handler files exist', () => {
    const handlersDir = path.join(tmpDir, 'src', 'handlers');
    fs.mkdirSync(handlersDir, { recursive: true });
    fs.writeFileSync(
      path.join(handlersDir, 'clean_handler.ts'),
      'export const handler = () => {};\n',
      'utf-8'
    );
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}', 'utf-8');

    const result = linter.lint(tmpDir, 'typescript');
    expect(result.filesScanned).toBeGreaterThan(0);
  });
});
