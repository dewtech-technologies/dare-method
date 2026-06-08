import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORMAL_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const SHELL_TRUE = /shell\s*:\s*true/;

async function collectProductionTs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== '__tests__') {
      out.push(...(await collectProductionTs(full)));
    } else if (
      ent.name.endsWith('.ts') &&
      !ent.name.endsWith('.test.ts') &&
      !ent.name.endsWith('.spec.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('no shell:true in gates/formal', () => {
  it('should_find_no_shell_true_in_formal_production', async () => {
    const files = await collectProductionTs(FORMAL_ROOT);
    const violations: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      if (SHELL_TRUE.test(content)) violations.push(path.relative(FORMAL_ROOT, file));
    }
    expect(violations).toEqual([]);
  });
});
