import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeEnv } from '../../exec/safe-spawn.js';
import { assertRelativeSafe } from '../../utils/path-safety.js';
import {
  prerank,
  PRERANK_NEVER_AUTHORIZES_DONE,
} from '../best-of-n/selector/prerank.js';
import { createWorktree } from '../best-of-n/worktree.js';

const SRC_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const SHELL_TRUE = /shell\s*:\s*true/;

async function collectTsFiles(dir: string, base: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (ent.isDirectory()) {
      out.push(...(await collectTsFiles(full, base)));
    } else if (ent.name.endsWith('.ts')) {
      out.push(rel);
    }
  }
  return out;
}

function isTestFile(rel: string): boolean {
  return rel.includes('__tests__') || rel.endsWith('.spec.ts') || rel.endsWith('.test.ts');
}

describe('verification security audit', () => {
  it('RS-06: no shell:true in production verification src', async () => {
    const verificationDir = path.join(SRC_ROOT, 'verification');
    const execDir = path.join(SRC_ROOT, 'exec');
    const violations: string[] = [];

    for (const dir of [verificationDir, execDir]) {
      const files = await collectTsFiles(dir, SRC_ROOT);
      for (const rel of files) {
        if (isTestFile(rel)) continue;
        const content = await fs.readFile(path.join(SRC_ROOT, rel), 'utf8');
        if (SHELL_TRUE.test(content)) violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });

  it('RS-02: sanitizeEnv strips secret-like keys', () => {
    const env = sanitizeEnv({ PATH: '/bin', API_KEY: 'secret', HOME: '/u' });
    expect(env.API_KEY).toBeUndefined();
    expect(env.PATH).toBe('/bin');
  });

  it('RS-07: prerank never authorizes DONE', () => {
    expect(PRERANK_NEVER_AUTHORIZES_DONE).toBe(true);
    const scores = prerank([{ id: 'c1', diff: '--- a\n+++ b\n@@\n+fail\n' }]);
    for (const s of scores) {
      expect(s).not.toHaveProperty('verdict');
      expect(s).not.toHaveProperty('passed');
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it('RS-01: worktree rejects path traversal', async () => {
    await expect(createWorktree(process.cwd(), '../evil')).rejects.toThrow();
    expect(() => assertRelativeSafe('../evil')).toThrow();
  });

  it('RS-03: mutation adapters use safeSpawn not network fetch', async () => {
    const mutationDir = path.join(SRC_ROOT, 'verification/gates/mutation');
    const files = await collectTsFiles(mutationDir, SRC_ROOT);
    const violations: string[] = [];
    for (const rel of files) {
      if (isTestFile(rel)) continue;
      const content = await fs.readFile(path.join(SRC_ROOT, rel), 'utf8');
      if (/\bfetch\s*\(/.test(content) || /\bhttp\.request\s*\(/.test(content)) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });
});
