import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { BundledGrammarFile } from './grammar-map.js';

const RUNTIME_WASM = 'tree-sitter.wasm' as const;

/** Resolve WASM path: dist bundle first, then optional npm deps. */
export async function resolveWasmPath(filename: BundledGrammarFile | typeof RUNTIME_WASM): Promise<string | null> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const bundled = path.join(here, 'grammars', filename);
  if (await fs.pathExists(bundled)) return bundled;

  try {
    const req = createRequire(import.meta.url);
    if (filename === RUNTIME_WASM) {
      return req.resolve('web-tree-sitter/tree-sitter.wasm');
    }
    const pkgRoot = path.dirname(req.resolve('tree-sitter-wasms/package.json'));
    const candidate = path.join(pkgRoot, 'out', filename);
    if (await fs.pathExists(candidate)) return candidate;
  } catch {
    // optional deps missing
  }
  return null;
}
