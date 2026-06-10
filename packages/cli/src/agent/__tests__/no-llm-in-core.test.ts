import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ALLOWED_REL = path.join('src', 'agent', 'drivers', 'claude.ts');
const FORBIDDEN =
  /(?:import|require)\s*\(?['"]@anthropic-ai|from\s+['"]@anthropic-ai/;

function walkTsFiles(dir: string, base = pkgRoot): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      files.push(...walkTsFiles(full, base));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) continue;
    files.push(path.relative(base, full));
  }
  return files;
}

function listSourceFiles(): string[] {
  return walkTsFiles(path.join(pkgRoot, 'src')).filter(
    (f) => path.normalize(f) !== path.normalize(ALLOWED_REL),
  );
}

function findLlmSdkImports(): string[] {
  return listSourceFiles().filter((rel) => {
    const content = readFileSync(path.join(pkgRoot, rel), 'utf8');
    return FORBIDDEN.test(content);
  });
}

describe('no-llm-in-core', () => {
  it('passes_on_clean_tree', () => {
    const offenders = findLlmSdkImports();
    expect(offenders, `LLM SDK imported outside ${ALLOWED_REL}`).toEqual([]);
  });

  it('detects_planted_import', () => {
    const sample = "import Anthropic from '@anthropic-ai/sdk';";
    expect(FORBIDDEN.test(sample)).toBe(true);
  });
});
