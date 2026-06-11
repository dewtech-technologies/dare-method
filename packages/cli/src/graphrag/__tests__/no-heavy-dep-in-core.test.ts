import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ALLOWED_REL = path.join('src', 'graphrag', 'embeddings.ts');
const FORBIDDEN =
  /(?:import|require)\s*\(?['"](?:onnxruntime|@xenova\/transformers)|from\s+['"](?:onnxruntime|@xenova\/transformers)/;

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

function findHeavyDependencyImports(): string[] {
  return listSourceFiles().filter((rel) => {
    const content = readFileSync(path.join(pkgRoot, rel), 'utf8');
    return FORBIDDEN.test(content);
  });
}

describe('no-heavy-dep-in-core', () => {
  it('passes_on_clean_tree', () => {
    const offenders = findHeavyDependencyImports();
    expect(offenders, `embedding runtime imported outside ${ALLOWED_REL}`).toEqual([]);
  });

  it('detects_planted_import', () => {
    const transformersImport = "import { pipeline } from '@xenova/transformers';";
    const onnxRequire = "const ort = require('onnxruntime');";
    expect(FORBIDDEN.test(transformersImport)).toBe(true);
    expect(FORBIDDEN.test(onnxRequire)).toBe(true);
  });
});
