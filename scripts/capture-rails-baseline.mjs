#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * T-010 — Captures the parity baseline for ruby-rails-8.
 *
 * Runs RailsScaffold.generate() in a tmp dir (in-process, not via subprocess —
 * deterministic, no banner/spinner output to filter), then hashes every file
 * with timestamps + UUIDs + secret_key_base normalized.
 *
 * Output: packages/cli/src/stacks/__tests__/parity-rails.fixture.json
 *
 * Must be run AGAINST THE COMMIT IMMEDIATELY BEFORE T-011 (before the move).
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

console.log(`[capture] tmpRoot = ${tmpRoot}`);
console.log(`[capture] outDir  = ${outDir}`);

// Import the still-existing workspace package directly.
const railsModuleUrl = new URL(
  '../packages/stacks/ruby-rails-8/dist/index.js',
  import.meta.url,
);
console.log(`[capture] importing ${fileURLToPath(railsModuleUrl)}`);
const { RailsScaffold } = await import(railsModuleUrl);

const scaffold = new RailsScaffold();
await scaffold.generate('test-app', {
  outputDir: outDir,
  llmProvider: 'dummy',
  skipExamples: false,
  skipLlm: false,
  skipChannels: false,
  verbose: false,
});

// Walk and hash with normalization.
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
  const normalized = normalize(buf);
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  files.push({
    path: rel.split(path.sep).join('/'),
    hash,
    bytes: buf.length,
  });
}
await walk('');

function normalize(buf) {
  let s = buf.toString('utf8');
  // ISO-8601 timestamps
  s = s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<TIMESTAMP>');
  // UUIDs
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<UUID>');
  // Rails secret_key_base (hex 128 chars)
  s = s.replace(/[a-f0-9]{128}/g, '<RAILS_SECRET>');
  // Master.key / credentials random bytes
  s = s.replace(/[a-f0-9]{64}/g, '<RAILS_HEX64>');
  return Buffer.from(s, 'utf8');
}

const fixture = {
  capturedAt: process.env.DARE_FIXTURE_DATE ?? new Date().toISOString().slice(0, 10),
  source: 'RailsScaffold.generate (v3.0.0 baseline, pre-T-011)',
  scaffolder: '@dewtech/dare-stack-ruby-rails-8',
  fileCount: files.length,
  files,
};

const outPath = path.join(
  repoRoot,
  'packages/cli/src/stacks/__tests__/parity-rails.fixture.json',
);
await fsp.mkdir(path.dirname(outPath), { recursive: true });
await fsp.writeFile(outPath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
console.log(`[capture] wrote ${outPath}`);
console.log(`[capture] ${files.length} files captured`);

// Cleanup tmp.
await fsp.rm(tmpRoot, { recursive: true, force: true });
console.log('[capture] tmp cleaned. done.');
