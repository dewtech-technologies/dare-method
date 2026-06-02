// SPDX-License-Identifier: MIT
//
// Parity gate — internalized Rails 8 scaffolder (T-011) MUST produce a tree
// byte-identical (modulo timestamps/UUIDs/secrets) to the v3.0.0 baseline.
//
// Baseline fixture captured by `scripts/capture-rails-baseline.mjs` (T-010).
//
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'fs-extra';
import { resolve } from '../registry.js';
import { DARE_DNA } from '../types.js';
// JSON import — Vitest handles it via tsconfig.resolveJsonModule.
import fixture from './parity-rails.fixture.json';

interface FixtureFile {
  path: string;
  hash: string;
  bytes: number;
}

interface Fixture {
  capturedAt: string;
  source: string;
  scaffolder: string;
  fileCount: number;
  files: FixtureFile[];
}

const FIXTURE = fixture as Fixture;

let tmpRoot: string;
let appDir: string;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'parity-rails-'));
  appDir = path.join(tmpRoot, 'test-app');
  await fs.ensureDir(appDir);

  const scaffold = await resolve('ruby-rails-8');
  await scaffold.generate({
    dir: appDir,
    projectName: 'test-app',
    toolchain: 'auto',
    features: new Set(DARE_DNA),
    isMonorepo: false,
  });
});

afterAll(async () => {
  if (tmpRoot) await fs.remove(tmpRoot);
});

describe('Parity — ruby-rails-8 internalized vs v3.0.0 baseline', () => {
  it('fixture is loaded and non-empty', () => {
    expect(FIXTURE.fileCount).toBeGreaterThan(0);
    expect(FIXTURE.files.length).toBe(FIXTURE.fileCount);
  });

  it('produces same set of files (after normalization)', async () => {
    const current = await collectFiles(appDir);
    const currentSet = new Set(current.map((f) => f.path));
    const baselineSet = new Set(FIXTURE.files.map((f) => f.path));

    const missing = [...baselineSet].filter((p) => !currentSet.has(p)).sort();
    const extra = [...currentSet].filter((p) => !baselineSet.has(p)).sort();

    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('every baseline file matches by normalized hash', async () => {
    const current = await collectFiles(appDir);
    const currentMap = new Map(current.map((f) => [f.path, f] as const));

    const mismatches: string[] = [];
    for (const baseline of FIXTURE.files) {
      const got = currentMap.get(baseline.path);
      if (!got) continue; // covered by the "missing" check above
      if (got.hash !== baseline.hash) mismatches.push(baseline.path);
    }
    expect(mismatches).toEqual([]);
  });
});

// ─── Helpers (same normalization as scripts/capture-rails-baseline.mjs) ────

async function collectFiles(root: string): Promise<FixtureFile[]> {
  const out: FixtureFile[] = [];
  async function walk(rel: string): Promise<void> {
    const abs = path.join(root, rel);
    const stat = await fs.lstat(abs);
    if (stat.isDirectory()) {
      const names = (await fs.readdir(abs)).sort();
      for (const n of names) await walk(path.join(rel, n));
      return;
    }
    const buf = await fs.readFile(abs);
    const norm = normalize(buf);
    const hash = crypto.createHash('sha256').update(norm).digest('hex');
    out.push({
      path: rel.split(path.sep).join('/'),
      hash,
      bytes: buf.length,
    });
  }
  await walk('');
  return out;
}

function normalize(buf: Buffer): Buffer {
  let s = buf.toString('utf8');
  s = s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<TIMESTAMP>');
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<UUID>');
  s = s.replace(/[a-f0-9]{128}/g, '<RAILS_SECRET>');
  s = s.replace(/[a-f0-9]{64}/g, '<RAILS_HEX64>');
  return Buffer.from(s, 'utf8');
}
