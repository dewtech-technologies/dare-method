/**
 * Copy tree-sitter runtime + grammar WASM files into dist/ast/grammars for npm pack.
 */
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { BUNDLED_GRAMMARS } from '../src/ast/grammar-map.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'dist', 'ast', 'grammars');
const req = createRequire(import.meta.url);

async function resolveSource(filename: string): Promise<string | null> {
  try {
    if (filename === 'tree-sitter.wasm') {
      return req.resolve('web-tree-sitter/tree-sitter.wasm');
    }
    const root = path.dirname(req.resolve('tree-sitter-wasms/package.json'));
    const candidate = path.join(root, 'out', filename);
    if (await fs.pathExists(candidate)) return candidate;
  } catch {
    return null;
  }
  return null;
}

async function main(): Promise<void> {
  await fs.ensureDir(outDir);
  let copied = 0;
  for (const file of BUNDLED_GRAMMARS) {
    const src = await resolveSource(file);
    if (!src) {
      console.warn(`[copy-ast-grammars] skip ${file} (optional dep missing)`);
      continue;
    }
    await fs.copy(src, path.join(outDir, file));
    copied++;
  }
  console.log(`[copy-ast-grammars] copied ${copied}/${BUNDLED_GRAMMARS.length} files → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
