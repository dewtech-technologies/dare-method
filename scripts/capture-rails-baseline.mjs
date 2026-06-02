#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Captures / re-baselines the parity fixture for ruby-rails-8.
 *
 * v3.1: imports the INTERNALIZED scaffold (packages/cli/dist/stacks/...),
 * since packages/stacks/ was removed. The fixture now reflects the v3.1
 * Rails output (which includes the DNA-invariant .env.example and the
 * enriched dare-ci.yml with audit/lint jobs). The parity test guards against
 * accidental future drift, baselined at v3.1.
 *
 * Re-run after any INTENTIONAL change to the Rails scaffold/templates.
 *
 * Output: packages/cli/src/stacks/__tests__/parity-rails.fixture.json
 */
import path from 'node:path';
import fsp from 'node:fs/promises';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'rails-baseline-'));
const outDir = path.join(tmpRoot, 'test-app');
await fsp.mkdir(outDir, { recursive: true });

console.log(`[capture] outDir = ${outDir}`);

const scaffoldUrl = new URL(
  '../packages/cli/dist/stacks/ruby-rails-8/scaffold.js',
  import.meta.url,
);
const typesUrl = new URL('../packages/cli/dist/stacks/types.js', import.meta.url);
console.log(`[capture] importing ${fileURLToPath(scaffoldUrl)}`);
const { ruby_rails_8 } = await import(scaffoldUrl);
const { DARE_DNA } = await import(typesUrl);

await ruby_rails_8.generate({
  dir: outDir,
  projectName: 'test-app',
  toolchain: 'auto',
  features: new Set(DARE_DNA),
  isMonorepo: false,
});

const files = [];
async function walk(rel) {
  const abs = path.join(outDir, rel);
  const stat = await fsp.lstat(abs);
  if (stat.isDirectory()) {
    const names = (await fsp.readdir(abs)).sort();
    for (const n of names) await walk(path.join(rel, n));
    return;
  }
  const buf = await fsp.readFile(abs);
  const hash = crypto.createHash('sha256').update(normalize(buf)).digest('hex');
  files.push({ path: rel.split(path.sep).join('/'), hash, bytes: buf.length });
}
await walk('');

function normalize(buf) {
  let s = buf.toString('utf8');
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<TIMESTAMP>');
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<UUID>');
  s = s.replace(/[a-f0-9]{128}/g, '<RAILS_SECRET>');
  s = s.replace(/[a-f0-9]{64}/g, '<RAILS_HEX64>');
  return Buffer.from(s, 'utf8');
}

const fixture = {
  capturedAt: process.env.DARE_FIXTURE_DATE ?? '2026-06-02',
  source: 'ruby_rails_8.generate (v3.1 internalized, DNA-enriched)',
  scaffolder: 'packages/cli/src/stacks/ruby-rails-8',
  fileCount: files.length,
  files,
};

const outPath = path.join(
  repoRoot,
  'packages/cli/src/stacks/__tests__/parity-rails.fixture.json',
);
await fsp.writeFile(outPath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
console.log(`[capture] wrote ${outPath} (${files.length} files)`);

await fsp.rm(tmpRoot, { recursive: true, force: true });
console.log('[capture] done.');
