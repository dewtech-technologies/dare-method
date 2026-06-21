/**
 * Structural invariants for CLI-only monorepo (v3.13+).
 * Prevents reintroduction of legacy packages/docs and packages/website.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const LEGACY_DIRS = ['packages/docs', 'packages/website'];

const REF_PATTERN = /packages\/(?:docs|website)/;

/** Paths where legacy refs are allowed (planning/history artifacts). */
const REF_ALLOWLIST = [
  /^DARE\/DESIGN-/,
  /^DARE\/BLUEPRINT-/,
  /^DARE\/TASKS-/,
  /^DARE\/dare-dag-/,
  /^DARE\/EXECUTION\//,
  /^CHANGELOG\.md$/,
  /^\.dare\//,
  /^DARE\/\.canvas\.md$/,
];

const REF_SCAN_ROOTS = [
  'README.md',
  'ROADMAP.md',
  'packages/cli/README.md',
  'packages/cli/src',
  'implementations',
  'docs-site',
  'docs',
];

function relPosix(abs: string): string {
  return path.relative(repoRoot, abs).replace(/\\/g, '/');
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '.git' || name === 'coverage') {
        continue;
      }
      walkFiles(full, acc);
    } else if (/\.(md|ts|tsx|js|mjs|json|yml|yaml|html)$/i.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

function collectScanFiles(): string[] {
  const files: string[] = [];
  for (const root of REF_SCAN_ROOTS) {
    const abs = path.join(repoRoot, root);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isFile()) {
      files.push(abs);
    } else {
      walkFiles(abs, files);
    }
  }
  return files;
}

describe('cli-only structural invariants (v3.13+)', () => {
  it('legacy packages/docs and packages/website directories are absent', () => {
    for (const dir of LEGACY_DIRS) {
      expect(fs.existsSync(path.join(repoRoot, dir)), dir).toBe(false);
    }
  });

  it('required CLI-only paths exist', () => {
    expect(fs.existsSync(path.join(repoRoot, 'packages/cli/package.json'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'docs-site'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'mkdocs.yml'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, '.github/workflows/docs.yml'))).toBe(true);
  });

  it('root workspaces do not reference packages/stacks/*', () => {
    const rootPkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
    ) as { workspaces?: string[] };
    expect(rootPkg.workspaces ?? []).not.toContain('packages/stacks/*');
  });

  it('no legacy path references in tracked doc/source trees (outside allowlist)', () => {
    const violations: string[] = [];
    for (const file of collectScanFiles()) {
      const rel = relPosix(file);
      if (REF_ALLOWLIST.some((re) => re.test(rel))) continue;
      if (rel.endsWith('cli-only-invariants.test.ts')) continue;
      const content = fs.readFileSync(file, 'utf8');
      if (REF_PATTERN.test(content)) {
        violations.push(rel);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
