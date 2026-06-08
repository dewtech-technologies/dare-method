import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { loadSteeringFiles } from '../../steering/loader.js';
import {
  resolveSteeringForFile,
  sortSteeringByPrecedence,
} from '../../steering/resolver.js';
import { PathEscapeError } from '../../utils/path-safety.js';

describe('dare steering command logic', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'steering-cmd-'));
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    await fs.writeFile(
      path.join(projectRoot, 'DARE', 'PROJECT-DNA.md'),
      '# Base DNA\nAlways apply.',
    );
    const dir = path.join(projectRoot, '.dare', 'steering');
    await fs.ensureDir(dir);
    await fs.writeFile(
      path.join(dir, 'project.md'),
      `---
scope: project
priority: 0
---
# Project rules
`,
    );
    await fs.writeFile(
      path.join(dir, 'auth.md'),
      `---
scope: glob
glob: src/auth/**
priority: 10
---
# Auth rules
`,
    );
    await fs.writeFile(
      path.join(dir, 'src.md'),
      `---
scope: glob
glob: src/**
priority: 5
---
# Src rules
`,
    );
  });

  afterEach(async () => {
    await fs.remove(projectRoot).catch(() => undefined);
  });

  it('list orders files by precedence (base → project → glob by priority)', () => {
    const files = sortSteeringByPrecedence(loadSteeringFiles(projectRoot));
    expect(files.map((f) => f.path)).toEqual([
      'DARE/PROJECT-DNA.md',
      '.dare/steering/project.md',
      '.dare/steering/src.md',
      '.dare/steering/auth.md',
    ]);
  });

  it('show resolves applicable blocks for target file', () => {
    const all = loadSteeringFiles(projectRoot);
    const resolution = resolveSteeringForFile(all, 'src/auth/login.ts');
    expect(resolution.blocks[0]?.isBase).toBe(true);
    expect(resolution.blocks.map((b) => b.path)).toEqual([
      'DARE/PROJECT-DNA.md',
      '.dare/steering/project.md',
      '.dare/steering/src.md',
      '.dare/steering/auth.md',
    ]);
  });

  it('show rejects path escape with PathEscapeError', () => {
    expect(() => resolveSteeringForFile([], '../etc/passwd')).toThrow(
      PathEscapeError,
    );
  });

  it('show excludes non-matching globs', () => {
    const all = loadSteeringFiles(projectRoot);
    const resolution = resolveSteeringForFile(all, 'src/other.ts');
    expect(resolution.blocks.map((b) => b.path)).not.toContain(
      '.dare/steering/auth.md',
    );
  });
});
