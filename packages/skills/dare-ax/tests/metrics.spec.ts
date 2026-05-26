/**
 * dare-ax — metrics tests (M-01 to M-04)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DareAxMetrics } from '../metrics.js';

/** A valid llms.txt for M-01 tests */
const VALID_LLMS_TXT = `# llms.txt — Project Context for AI Agents

## Project Overview
A test project demonstrating DARE Method layered architecture.

## Tech Stack
- Language: TypeScript
- Framework: NestJS
- Database: Postgres

## Architecture
4-layer architecture: Handlers, Services, Repositories, Models.
Dependency flows downward only: Handler → Service → Repository → Model.

## Directory Structure
\`\`\`
src/
├── handlers/
├── services/
├── repositories/
└── models/
\`\`\`

## Key Endpoints
- GET /health — Health check
- GET /api/v1/users — List users

## Important Files
- config.json — Configuration

## Getting Started
\`\`\`bash
make dev
\`\`\`

## Rate Limits
- Public endpoints: 100 req/min per IP

## Security Notes
- Input validated in handlers

## For AI Agents
- OpenAPI: GET /openapi.json
- CLI: ./app --json
- No secrets here
`;

describe('DareAxMetrics', () => {
  let tmpDir: string;
  let metrics: DareAxMetrics;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-ax-metrics-test-'));
    metrics = new DareAxMetrics();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── M-01 ──────────────────────────────────────────────────────────────

  describe('M-01: llms.txt valid', () => {
    it('passes when llms.txt exists and is valid', () => {
      fs.writeFileSync(path.join(tmpDir, 'llms.txt'), VALID_LLMS_TXT, 'utf-8');

      const result = metrics.collectM01(tmpDir);

      expect(result.id).toBe('M-01');
      expect(result.pass).toBe(true);
    });

    it('fails when llms.txt does not exist', () => {
      const result = metrics.collectM01(tmpDir);

      expect(result.id).toBe('M-01');
      expect(result.pass).toBe(false);
      expect(result.detail).toContain('not found');
    });

    it('fails when llms.txt is missing required sections', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'llms.txt'),
        '# llms.txt\n\nJust a comment, no sections.\n',
        'utf-8'
      );

      const result = metrics.collectM01(tmpDir);

      expect(result.pass).toBe(false);
      expect(result.detail).toContain('Validation failed');
    });

    it('fails when llms.txt contains a secret', () => {
      const content = VALID_LLMS_TXT + '\naws_key=' + 'AKIA' + 'IOSFODNN7EXAMPLE\n';
      fs.writeFileSync(path.join(tmpDir, 'llms.txt'), content, 'utf-8');

      const result = metrics.collectM01(tmpDir);

      expect(result.pass).toBe(false);
      expect(result.detail!.toLowerCase()).toContain('secret');
    });
  });

  // ── M-02 ──────────────────────────────────────────────────────────────

  describe('M-02: openapi.json exists', () => {
    it('passes when openapi.json is at project root', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'openapi.json'),
        '{"openapi":"3.1.0"}',
        'utf-8'
      );

      const result = metrics.collectM02(tmpDir);

      expect(result.id).toBe('M-02');
      expect(result.pass).toBe(true);
      expect(result.detail).toContain('openapi.json');
    });

    it('passes when openapi.json is in public/', () => {
      const publicDir = path.join(tmpDir, 'public');
      fs.mkdirSync(publicDir);
      fs.writeFileSync(
        path.join(publicDir, 'openapi.json'),
        '{"openapi":"3.1.0"}',
        'utf-8'
      );

      const result = metrics.collectM02(tmpDir);

      expect(result.pass).toBe(true);
      // Normalize path separators for Windows/Unix compatibility
      expect(result.detail?.replace(/\\/g, '/')).toContain('public/openapi.json');
    });

    it('passes when openapi.yaml is at project root', () => {
      fs.writeFileSync(path.join(tmpDir, 'openapi.yaml'), 'openapi: "3.1.0"', 'utf-8');

      const result = metrics.collectM02(tmpDir);

      expect(result.pass).toBe(true);
    });

    it('fails when no openapi file found', () => {
      const result = metrics.collectM02(tmpDir);

      expect(result.id).toBe('M-02');
      expect(result.pass).toBe(false);
      expect(result.detail).toContain('No openapi');
    });
  });

  // ── M-03 ──────────────────────────────────────────────────────────────

  describe('M-03: CLI supports --json', () => {
    it('passes when --json flag found in src/', () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(
        path.join(srcDir, 'cli.ts'),
        `
import { Command } from 'commander';
const cmd = new Command();
cmd.option('--json', 'Output as JSON');
cmd.parse(process.argv);
`,
        'utf-8'
      );

      const result = metrics.collectM03(tmpDir);

      expect(result.id).toBe('M-03');
      expect(result.pass).toBe(true);
      expect(result.detail).toContain('--json');
    });

    it('passes when --json found in bin/', () => {
      const binDir = path.join(tmpDir, 'bin');
      fs.mkdirSync(binDir);
      fs.writeFileSync(
        path.join(binDir, 'dare.ts'),
        'program.option("--json", "JSON output");\n',
        'utf-8'
      );

      const result = metrics.collectM03(tmpDir);

      expect(result.pass).toBe(true);
    });

    it('passes when --json found nested in src/commands/', () => {
      const dir = path.join(tmpDir, 'src', 'commands');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'init.ts'),
        '.option("--json", "Output results as JSON")\n',
        'utf-8'
      );

      const result = metrics.collectM03(tmpDir);

      expect(result.pass).toBe(true);
    });

    it('fails when no --json flag in any source file', () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(
        path.join(srcDir, 'cli.ts'),
        'program.option("--verbose", "Verbose output");\n',
        'utf-8'
      );

      const result = metrics.collectM03(tmpDir);

      expect(result.id).toBe('M-03');
      expect(result.pass).toBe(false);
      expect(result.detail).toContain('--json');
    });

    it('fails when project has no src/ or bin/ directories', () => {
      const result = metrics.collectM03(tmpDir);

      expect(result.pass).toBe(false);
    });
  });

  // ── M-04 ──────────────────────────────────────────────────────────────

  describe('M-04: Rate limit configuration detected', () => {
    it('passes when express-rate-limit in package.json dependencies', () => {
      const pkg = {
        name: 'test',
        dependencies: { 'express-rate-limit': '^7.0.0' },
      };
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify(pkg),
        'utf-8'
      );

      const result = metrics.collectM04(tmpDir);

      expect(result.id).toBe('M-04');
      expect(result.pass).toBe(true);
      expect(result.detail).toContain('express-rate-limit');
    });

    it('passes when @nestjs/throttler in package.json', () => {
      const pkg = {
        name: 'test',
        dependencies: { '@nestjs/throttler': '^5.0.0' },
      };
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify(pkg),
        'utf-8'
      );

      const result = metrics.collectM04(tmpDir);

      expect(result.pass).toBe(true);
      expect(result.detail).toContain('nestjs/throttler');
    });

    it('passes when rack-attack in Gemfile', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'Gemfile'),
        'gem "rack-attack"\n',
        'utf-8'
      );

      const result = metrics.collectM04(tmpDir);

      expect(result.pass).toBe(true);
      expect(result.detail).toContain('rack-attack');
    });

    it('passes when tower-governor in Cargo.toml', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'Cargo.toml'),
        '[dependencies]\ntower-governor = "0.2"\n',
        'utf-8'
      );

      const result = metrics.collectM04(tmpDir);

      expect(result.pass).toBe(true);
      expect(result.detail).toContain('tower-governor');
    });

    it('passes when rate_limit pattern found in source', () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(
        path.join(srcDir, 'middleware.ts'),
        'app.use(rateLimitMiddleware({ windowMs: 60000, max: 100 }));\n',
        'utf-8'
      );

      const result = metrics.collectM04(tmpDir);

      expect(result.pass).toBe(true);
    });

    it('fails when no rate limit library or pattern found', () => {
      const pkg = {
        name: 'test',
        dependencies: { express: '^4.0.0', nestjs: '^10.0.0' },
      };
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify(pkg),
        'utf-8'
      );

      const result = metrics.collectM04(tmpDir);

      expect(result.id).toBe('M-04');
      expect(result.pass).toBe(false);
      expect(result.detail).toContain('No rate limit');
    });

    it('fails when no manifests exist at all', () => {
      const result = metrics.collectM04(tmpDir);

      expect(result.pass).toBe(false);
    });
  });

  // ── collect() (all metrics) ────────────────────────────────────────────

  describe('collect()', () => {
    it('returns array of 4 MetricResults', () => {
      const results = metrics.collect(tmpDir);

      expect(results).toHaveLength(4);
      expect(results.map((r) => r.id)).toEqual(['M-01', 'M-02', 'M-03', 'M-04']);
    });

    it('all pass when project has all required assets', () => {
      // Setup a project that satisfies all metrics
      fs.writeFileSync(path.join(tmpDir, 'llms.txt'), VALID_LLMS_TXT, 'utf-8');
      fs.writeFileSync(
        path.join(tmpDir, 'openapi.json'),
        '{"openapi":"3.1.0"}',
        'utf-8'
      );
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(
        path.join(srcDir, 'cli.ts'),
        'cmd.option("--json", "JSON output");\n',
        'utf-8'
      );
      const pkg = {
        name: 'test',
        dependencies: { 'express-rate-limit': '^7.0.0' },
      };
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify(pkg),
        'utf-8'
      );

      const results = metrics.collect(tmpDir);

      for (const r of results) {
        expect(r.pass, `Expected ${r.id} to pass, got: ${r.detail}`).toBe(true);
      }
    });

    it('all fail when project directory is empty', () => {
      const results = metrics.collect(tmpDir);

      for (const r of results) {
        expect(r.pass, `Expected ${r.id} to fail`).toBe(false);
      }
    });
  });
});
