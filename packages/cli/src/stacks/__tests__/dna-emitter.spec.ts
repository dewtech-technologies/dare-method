// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import {
  EnvSecretError,
  IOError,
  SECRET_PATTERNS,
  emit,
  emitDefaults,
  validateEnvExample,
} from '../dna-emitter.js';
import { DARE_DNA } from '../types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dna-emitter-'));
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

describe('validateEnvExample', () => {
  it('accepts comments and empty lines', () => {
    expect(() =>
      validateEnvExample(`# comment\n\n# another\n`),
    ).not.toThrow();
  });

  it('accepts safe placeholder values', () => {
    const content = `
APP_PORT=3000
JWT_SECRET=replace-me-in-prod
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
LOG_LEVEL=info
EMPTY_VAR=
`;
    expect(() => validateEnvExample(content)).not.toThrow();
  });

  it('rejects base64-looking value', () => {
    const content = `SECRET=aGVsbG8gdGhpcyBpcyBhIHZlcnkgbG9uZyBiYXNlNjQgc3RyaW5n\n`;
    expect(() => validateEnvExample(content)).toThrow(EnvSecretError);
  });

  it('rejects hex-looking key', () => {
    const content = `KEY=abcdef0123456789abcdef0123456789abcdef\n`;
    expect(() => validateEnvExample(content)).toThrow(EnvSecretError);
  });

  it('rejects PEM block', () => {
    const content = `KEY=-----BEGIN RSA PRIVATE KEY-----\n`;
    expect(() => validateEnvExample(content)).toThrow(EnvSecretError);
  });

  it('rejects OpenAI key pattern', () => {
    const content = `OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEF\n`;
    expect(() => validateEnvExample(content)).toThrow(EnvSecretError);
  });

  it('rejects AWS access key pattern', () => {
    const content = `AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n`;
    expect(() => validateEnvExample(content)).toThrow(EnvSecretError);
  });

  it('EnvSecretError carries line, value, pattern', () => {
    const content = `OK=ok\nBAD=AKIAIOSFODNN7EXAMPLE\n`;
    try {
      validateEnvExample(content);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(EnvSecretError);
      const err = e as EnvSecretError;
      expect(err.line).toBe(2);
      expect(err.value).toContain('AKIA');
      expect(SECRET_PATTERNS).toContain(err.pattern);
    }
  });
});

describe('emit()', () => {
  it('writes content under tmpDir', async () => {
    const rel = await emit({
      dir: tmpDir,
      projectName: 'x',
      stackId: 'ruby-rails-8',
      artifact: 'llms-txt',
      targetPath: 'llms.txt',
      content: '# x\n',
    });
    expect(rel).toBe('llms.txt');
    const written = await fs.readFile(path.join(tmpDir, 'llms.txt'), 'utf8');
    expect(written).toBe('# x\n');
  });

  it('creates parent directories', async () => {
    await emit({
      dir: tmpDir,
      projectName: 'x',
      stackId: 'ruby-rails-8',
      artifact: 'github-ci',
      targetPath: '.github/workflows/dare-ci.yml',
      content: 'name: CI\n',
    });
    expect(await fs.pathExists(path.join(tmpDir, '.github/workflows/dare-ci.yml'))).toBe(true);
  });

  it('rejects absolute targetPath', async () => {
    await expect(
      emit({
        dir: tmpDir,
        projectName: 'x',
        stackId: 'ruby-rails-8',
        artifact: 'llms-txt',
        targetPath: '/etc/passwd',
        content: 'x',
      }),
    ).rejects.toThrow(/relative/);
  });

  it("rejects targetPath containing '..'", async () => {
    await expect(
      emit({
        dir: tmpDir,
        projectName: 'x',
        stackId: 'ruby-rails-8',
        artifact: 'llms-txt',
        targetPath: '../outside.txt',
        content: 'x',
      }),
    ).rejects.toThrow(/\.\./);
  });

  it('validates env-example before writing', async () => {
    await expect(
      emit({
        dir: tmpDir,
        projectName: 'x',
        stackId: 'ruby-rails-8',
        artifact: 'env-example',
        targetPath: '.env.example',
        content: 'BAD=AKIAIOSFODNN7EXAMPLE\n',
      }),
    ).rejects.toThrow(EnvSecretError);
    expect(await fs.pathExists(path.join(tmpDir, '.env.example'))).toBe(false);
  });

  it('IOError carries targetPath and cause', async () => {
    // Force fs error by passing a directory as targetPath after creating it.
    await fs.ensureDir(path.join(tmpDir, 'collide'));
    try {
      await emit({
        dir: tmpDir,
        projectName: 'x',
        stackId: 'ruby-rails-8',
        artifact: 'llms-txt',
        targetPath: 'collide',
        content: 'x',
      });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(IOError);
      const err = e as IOError;
      expect(err.targetPath).toContain('collide');
    }
  });
});

describe('emitDefaults()', () => {
  it('writes the 5 file-backed DNA artifacts', async () => {
    const dnaEmitted = await emitDefaults({
      dir: tmpDir,
      projectName: 'sample-app',
      stackId: 'ruby-rails-8',
    });

    expect(await fs.pathExists(path.join(tmpDir, 'llms.txt'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, 'openapi.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.env.example'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.dare/skills.yml'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.github/workflows/dare-ci.yml'))).toBe(true);

    // dnaEmitted reports all 7 (check-only ones included)
    expect([...dnaEmitted].sort()).toEqual([...DARE_DNA].sort());
  });

  it('llms.txt has required sections', async () => {
    await emitDefaults({
      dir: tmpDir,
      projectName: 'x',
      stackId: 'node-nestjs',
    });
    const content = await fs.readFile(path.join(tmpDir, 'llms.txt'), 'utf8');
    expect(content).toMatch(/^# x$/m);
    expect(content).toMatch(/## Setup/);
    expect(content).toMatch(/## Commands/);
  });

  it('openapi.json is valid JSON 3.1.0', async () => {
    await emitDefaults({
      dir: tmpDir,
      projectName: 'x',
      stackId: 'node-nestjs',
    });
    const content = JSON.parse(await fs.readFile(path.join(tmpDir, 'openapi.json'), 'utf8'));
    expect(content.openapi).toBe('3.1.0');
    expect(content.info?.title).toBe('x');
  });

  it('.env.example passes its own secret scan', async () => {
    await emitDefaults({
      dir: tmpDir,
      projectName: 'x',
      stackId: 'node-nestjs',
    });
    const content = await fs.readFile(path.join(tmpDir, '.env.example'), 'utf8');
    expect(() => validateEnvExample(content)).not.toThrow();
  });

  it('dare-ci.yml has audit, lint, test jobs', async () => {
    await emitDefaults({
      dir: tmpDir,
      projectName: 'x',
      stackId: 'node-nestjs',
    });
    const ci = await fs.readFile(path.join(tmpDir, '.github/workflows/dare-ci.yml'), 'utf8');
    expect(ci).toMatch(/^\s*audit:/m);
    expect(ci).toMatch(/^\s*lint:/m);
    expect(ci).toMatch(/^\s*test:/m);
  });

  it('skills.yml references the right skill for the stack', async () => {
    await emitDefaults({
      dir: tmpDir,
      projectName: 'x',
      stackId: 'mcp-rust',
    });
    const content = await fs.readFile(path.join(tmpDir, '.dare/skills.yml'), 'utf8');
    expect(content).toContain('skill-mcp-server');
  });
});
