import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { loadSteeringFiles, SteeringFrontMatterError } from '../loader.js';

describe('steering loader', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'steering-loader-'));
  });

  afterEach(async () => {
    await fs.remove(projectRoot).catch(() => undefined);
  });

  it('returns empty when no steering sources exist', () => {
    expect(loadSteeringFiles(projectRoot)).toEqual([]);
  });

  it('loads PROJECT-DNA as base block', async () => {
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    await fs.writeFile(path.join(projectRoot, 'DARE', 'PROJECT-DNA.md'), '# DNA\nrules');
    const files = loadSteeringFiles(projectRoot);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      path: 'DARE/PROJECT-DNA.md',
      isBase: true,
      frontMatter: { scope: 'project', priority: 0 },
    });
  });

  it('loads PATTERNS.md as second base block when present', async () => {
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    await fs.writeFile(path.join(projectRoot, 'DARE', 'PROJECT-DNA.md'), '# DNA');
    await fs.writeFile(path.join(projectRoot, 'DARE', 'PATTERNS.md'), '# Patterns');
    const files = loadSteeringFiles(projectRoot);
    expect(files.map((f) => f.path)).toEqual(['DARE/PROJECT-DNA.md', 'DARE/PATTERNS.md']);
    expect(files.every((f) => f.isBase)).toBe(true);
  });

  it('without PATTERNS.md matches DNA-only baseline', async () => {
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    await fs.writeFile(path.join(projectRoot, 'DARE', 'PROJECT-DNA.md'), '# DNA only');
    const files = loadSteeringFiles(projectRoot);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('DARE/PROJECT-DNA.md');
  });

  it('discovers .dare/steering/*.md with front-matter', async () => {
    const dir = path.join(projectRoot, '.dare', 'steering');
    await fs.ensureDir(dir);
    await fs.writeFile(
      path.join(dir, 'auth.md'),
      `---
scope: glob
glob: src/auth/**
priority: 10
title: Auth rules
---
# Auth
`,
    );
    const files = loadSteeringFiles(projectRoot).filter((f) => !f.isBase);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('.dare/steering/auth.md');
    expect(files[0]?.frontMatter.glob).toBe('src/auth/**');
  });

  it('ignores .env* steering sources (RS-04)', async () => {
    const dir = path.join(projectRoot, '.dare', 'steering');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, '.env'), 'SECRET=x');
    await fs.writeFile(path.join(dir, '.env.production'), 'SECRET=y');
    await fs.writeFile(
      path.join(dir, 'ok.md'),
      `---
scope: project
---
# ok
`,
    );
    const relPaths = loadSteeringFiles(projectRoot).map((f) => f.path);
    expect(relPaths).not.toContain('.dare/steering/.env');
    expect(relPaths).not.toContain('.dare/steering/.env.production');
    expect(relPaths).toContain('.dare/steering/ok.md');
  });

  it('rejects glob scope without glob field', async () => {
    const dir = path.join(projectRoot, '.dare', 'steering');
    await fs.ensureDir(dir);
    await fs.writeFile(
      path.join(dir, 'bad.md'),
      `---
scope: glob
---
# bad
`,
    );
    expect(() => loadSteeringFiles(projectRoot)).toThrow(SteeringFrontMatterError);
  });

  it('rejects unsafe glob patterns (RS-03)', async () => {
    const dir = path.join(projectRoot, '.dare', 'steering');
    await fs.ensureDir(dir);
    await fs.writeFile(
      path.join(dir, 'escape.md'),
      `---
scope: glob
glob: ../../../etc
---
`,
    );
    expect(() => loadSteeringFiles(projectRoot)).toThrow(SteeringFrontMatterError);
  });
});
