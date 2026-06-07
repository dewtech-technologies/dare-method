#!/usr/bin/env node
/**
 * Fails if any workflow uses a GitHub Action tag (@vN) instead of a commit SHA.
 * Allowed: uses: actions/checkout@11bd71901bbe5... # v4.2.2
 * Blocked: uses: actions/checkout@v4
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDir = path.join(root, '.github', 'workflows');

const TAG_USE_RE = /^\s*uses:\s*[\w.-]+\/[\w.-]+@v\d/i;
const SHA_USE_RE = /^\s*uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40}\b/i;

let failed = false;

for (const file of fs.readdirSync(workflowsDir)) {
  if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
  const full = path.join(workflowsDir, file);
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('uses:')) continue;
    if (SHA_USE_RE.test(line)) continue;
    if (TAG_USE_RE.test(line)) {
      console.error(`${file}:${i + 1}: unpinned action — pin by SHA: ${line.trim()}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('All GitHub Actions in .github/workflows are pinned by SHA.');
