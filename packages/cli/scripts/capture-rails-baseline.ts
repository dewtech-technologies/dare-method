// SPDX-License-Identifier: MIT
//
// Regenerates packages/cli/src/stacks/__tests__/parity-rails.fixture.json from
// the current ruby-rails-8 scaffolder output (API-only path — same call the
// parity spec makes). Run after intentionally changing the Rails scaffold:
//
//   npx tsx scripts/capture-rails-baseline.ts
//
// The normalization MUST stay in sync with parity-rails.spec.ts.
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'fs-extra';
import { resolve } from '../src/stacks/registry.js';
import { DARE_DNA } from '../src/stacks/types.js';

interface FixtureFile {
  path: string;
  hash: string;
  bytes: number;
}

function normalize(buf: Buffer): Buffer {
  let s = buf.toString('utf8');
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<TIMESTAMP>');
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<UUID>');
  s = s.replace(/[a-f0-9]{128}/g, '<RAILS_SECRET>');
  s = s.replace(/[a-f0-9]{64}/g, '<RAILS_HEX64>');
  return Buffer.from(s, 'utf8');
}

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
    const hash = crypto.createHash('sha256').update(normalize(buf)).digest('hex');
    out.push({ path: rel.split(path.sep).join('/'), hash, bytes: buf.length });
  }
  await walk('');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

async function main(): Promise<void> {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-rails-'));
  const appDir = path.join(tmpRoot, 'test-app');
  await fs.ensureDir(appDir);

  const scaffold = await resolve('ruby-rails-8');
  await scaffold.generate({
    dir: appDir,
    projectName: 'test-app',
    toolchain: 'auto',
    features: new Set(DARE_DNA),
    isMonorepo: false,
  });

  const files = await collectFiles(appDir);
  const fixture = {
    capturedAt: '2026-06-27',
    source: 'ruby_rails_8.generate (v3.17 — runtime skeleton, API-only path)',
    scaffolder: 'packages/cli/src/stacks/ruby-rails-8',
    fileCount: files.length,
    files,
  };

  const dest = path.resolve(
    new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
    '..',
    '..',
    'src',
    'stacks',
    '__tests__',
    'parity-rails.fixture.json',
  );
  await fs.writeJSON(dest, fixture, { spaces: 2 });
  await fs.remove(tmpRoot);
  console.log(`Captured ${files.length} files → ${dest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
