#!/usr/bin/env node
/**
 * extract-release-notes.mjs
 *
 * Reads CHANGELOG.md and prints the entry for a given version. Used by the
 * GitHub Actions release workflow so the release body matches what we wrote
 * by hand instead of the auto-generated commit list.
 *
 * Usage:
 *   node scripts/extract-release-notes.mjs 2.4.0
 *
 * Format expected (Keep a Changelog):
 *
 *   ## [2.4.0] — 2026-05
 *
 *   ### Adicionado
 *   - …
 *
 *   ## [2.3.1] — …
 *
 * If the version section is missing, exits 1 and prints to stderr — keeps
 * the pipeline honest (we always update CHANGELOG before tagging).
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const version = process.argv[2];
if (!version) {
  console.error('Usage: extract-release-notes.mjs <version>');
  process.exit(2);
}

const changelogPath = path.resolve(process.cwd(), 'CHANGELOG.md');
if (!fs.existsSync(changelogPath)) {
  console.error(`CHANGELOG.md not found at ${changelogPath}`);
  process.exit(1);
}

const text = fs.readFileSync(changelogPath, 'utf8');

// Match `## [<version>] …\n` up to the next `## [` (or end of file).
const escaped = version.replace(/\./g, '\\.');
const re = new RegExp(
  `^## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|^\\[\\S+\\]:\\s|\\Z)`,
  'm',
);
const match = text.match(re);

if (!match) {
  console.error(`No CHANGELOG entry found for version ${version}.`);
  console.error('Add a "## [<version>] — <date>" section before tagging.');
  process.exit(1);
}

const body = match[1].trim();
if (body.length === 0) {
  console.error(`CHANGELOG entry for ${version} is empty.`);
  process.exit(1);
}

// Prepend a brief header so the GitHub release reads naturally.
const header = `## v${version}\n`;
process.stdout.write(`${header}\n${body}\n`);
