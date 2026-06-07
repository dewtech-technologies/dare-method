import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const SHELL_TRUE = /shell\s*:\s*true/;

/** No production allowlist after task-010 (RS-06). */
const ALLOWLIST = new Set<string>();

function isTestFile(rel: string): boolean {
  return (
    rel.includes('__tests__') ||
    rel.endsWith('.spec.ts') ||
    rel.endsWith('.test.ts')
  );
}

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

describe('no shell:true in production src', () => {
  it('should_find_no_shell_true_in_production', async () => {
    const files = await collectTsFiles(SRC_ROOT, SRC_ROOT);
    const violations: string[] = [];

    for (const rel of files) {
      if (isTestFile(rel) || ALLOWLIST.has(path.normalize(rel))) continue;
      const content = await fs.readFile(path.join(SRC_ROOT, rel), 'utf8');
      if (SHELL_TRUE.test(content)) violations.push(rel);
    }

    expect(violations).toEqual([]);
  });
});
