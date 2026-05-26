/**
 * dare-ax — generator tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DareAxGenerator } from '../generator.js';
import { ProjectConfig } from '../types.js';

const MINIMAL_CONFIG: ProjectConfig = {
  name: 'test-project',
  projectOverview: 'A test project for dare-ax generator tests.',
  language: 'TypeScript',
  framework: 'NestJS',
  database: 'Postgres',
  keyDependencies: ['nestjs', 'typeorm', 'pg', 'class-validator', 'rxjs'],
  architectureDescription:
    'Layered architecture: Handlers → Services → Repositories → Models. ' +
    'HTTP handlers in controllers, business logic in services, DB access in repositories.',
};

describe('DareAxGenerator', () => {
  let tmpDir: string;
  let generator: DareAxGenerator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-ax-test-'));
    generator = new DareAxGenerator();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('generateLlmsTxt', () => {
    it('creates llms.txt at project root', () => {
      const outputPath = generator.generateLlmsTxt(tmpDir, MINIMAL_CONFIG);

      expect(fs.existsSync(outputPath)).toBe(true);
      expect(outputPath).toBe(path.join(tmpDir, 'llms.txt'));
    });

    it('generated file contains required sections', () => {
      generator.generateLlmsTxt(tmpDir, MINIMAL_CONFIG);

      const content = fs.readFileSync(path.join(tmpDir, 'llms.txt'), 'utf-8');

      expect(content).toContain('## Project Overview');
      expect(content).toContain('## Tech Stack');
      expect(content).toContain('## Architecture');
      expect(content).toContain('## Key Endpoints');
      expect(content).toContain('## For AI Agents');
    });

    it('inserts project overview text', () => {
      generator.generateLlmsTxt(tmpDir, MINIMAL_CONFIG);

      const content = fs.readFileSync(path.join(tmpDir, 'llms.txt'), 'utf-8');
      expect(content).toContain('A test project for dare-ax generator tests.');
    });

    it('inserts tech stack fields', () => {
      generator.generateLlmsTxt(tmpDir, MINIMAL_CONFIG);

      const content = fs.readFileSync(path.join(tmpDir, 'llms.txt'), 'utf-8');
      expect(content).toContain('Language: TypeScript');
      expect(content).toContain('Framework: NestJS');
      expect(content).toContain('Database: Postgres');
    });

    it('lists key dependencies', () => {
      generator.generateLlmsTxt(tmpDir, MINIMAL_CONFIG);

      const content = fs.readFileSync(path.join(tmpDir, 'llms.txt'), 'utf-8');
      expect(content).toContain('nestjs');
      expect(content).toContain('typeorm');
      expect(content).toContain('pg');
    });

    it('uses custom cli binary name', () => {
      const config: ProjectConfig = { ...MINIMAL_CONFIG, cliBinary: 'my-cli' };
      generator.generateLlmsTxt(tmpDir, config);

      const content = fs.readFileSync(path.join(tmpDir, 'llms.txt'), 'utf-8');
      expect(content).toContain('my-cli --help');
      expect(content).toContain('my-cli --json');
    });

    it('uses project name as cli binary by default', () => {
      generator.generateLlmsTxt(tmpDir, MINIMAL_CONFIG);

      const content = fs.readFileSync(path.join(tmpDir, 'llms.txt'), 'utf-8');
      expect(content).toContain('test-project --help');
    });

    it('includes custom rate limits when specified', () => {
      const config: ProjectConfig = {
        ...MINIMAL_CONFIG,
        rateLimits: [
          { scope: 'Public API', limit: 60 },
          { scope: 'Admin API', limit: 20 },
        ],
      };
      generator.generateLlmsTxt(tmpDir, config);

      const content = fs.readFileSync(path.join(tmpDir, 'llms.txt'), 'utf-8');
      expect(content).toContain('Public API');
      expect(content).toContain('60 req/min');
      expect(content).toContain('Admin API');
      expect(content).toContain('20 req/min');
    });

    it('includes default rate limits when none specified', () => {
      generator.generateLlmsTxt(tmpDir, MINIMAL_CONFIG);

      const content = fs.readFileSync(path.join(tmpDir, 'llms.txt'), 'utf-8');
      expect(content).toContain('100 req/min');
      expect(content).toContain('10 req/min');
    });

    it('renders endpoints section when endpoints provided', () => {
      const config: ProjectConfig = {
        ...MINIMAL_CONFIG,
        endpoints: [
          { method: 'GET', path: '/api/v1/users', description: 'List users' },
          { method: 'POST', path: '/api/v1/users', description: 'Create user' },
        ],
      };
      generator.generateLlmsTxt(tmpDir, config);

      const content = fs.readFileSync(path.join(tmpDir, 'llms.txt'), 'utf-8');
      expect(content).toContain('GET /api/v1/users');
      expect(content).toContain('POST /api/v1/users');
      expect(content).toContain('List users');
    });

    it('throws when secret detected in generated content', () => {
      // Inject a fake AWS key into the project overview
      const evilConfig: ProjectConfig = {
        ...MINIMAL_CONFIG,
        projectOverview: 'Project with key ' + 'AKIA' + 'IOSFODNN7EXAMPLE embedded.',
      };

      expect(() => generator.generateLlmsTxt(tmpDir, evilConfig)).toThrow(
        /Secret detected/
      );

      // File should NOT have been written
      expect(fs.existsSync(path.join(tmpDir, 'llms.txt'))).toBe(false);
    });

    it('throws when axNotApplicable is true', () => {
      const config: ProjectConfig = { ...MINIMAL_CONFIG, axNotApplicable: true };

      expect(() => generator.generateLlmsTxt(tmpDir, config)).toThrow(
        /ax: not-applicable/
      );
    });

    it('overwrites existing llms.txt on re-run', () => {
      generator.generateLlmsTxt(tmpDir, MINIMAL_CONFIG);

      const updated: ProjectConfig = {
        ...MINIMAL_CONFIG,
        projectOverview: 'Updated description after second run.',
      };
      generator.generateLlmsTxt(tmpDir, updated);

      const content = fs.readFileSync(path.join(tmpDir, 'llms.txt'), 'utf-8');
      expect(content).toContain('Updated description after second run.');
      expect(content).not.toContain('A test project for dare-ax generator tests.');
    });
  });

  describe('renderLlmsTxt', () => {
    it('returns rendered content without writing to disk', () => {
      const content = generator.renderLlmsTxt(MINIMAL_CONFIG);

      expect(typeof content).toBe('string');
      expect(content).toContain('## Project Overview');
      expect(content).toContain('## For AI Agents');
      expect(fs.readdirSync(tmpDir)).toHaveLength(0);
    });

    it('throws when axNotApplicable is true', () => {
      const config: ProjectConfig = { ...MINIMAL_CONFIG, axNotApplicable: true };

      expect(() => generator.renderLlmsTxt(config)).toThrow(/ax: not-applicable/);
    });
  });
});
