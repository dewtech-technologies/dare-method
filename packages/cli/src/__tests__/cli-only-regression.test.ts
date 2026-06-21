/**
 * Regression gates for CLI-only cleanup release (v3.13+).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('cli-only regression gates', () => {
  it('verify-docs-coverage.mjs exits 0', () => {
    const script = path.join(repoRoot, 'scripts/verify-docs-coverage.mjs');
    expect(fs.existsSync(script)).toBe(true);
    const out = execFileSync(process.execPath, [script], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(out).toMatch(/Docs cobrem|cover/i);
  });

  it('only packages/cli has a publishable package.json under packages/', () => {
    const packagesDir = path.join(repoRoot, 'packages');
    const children = fs.readdirSync(packagesDir).filter((name) => {
      const pkg = path.join(packagesDir, name, 'package.json');
      return fs.existsSync(pkg);
    });
    expect(children.sort()).toEqual(['cli']);
  });
});
