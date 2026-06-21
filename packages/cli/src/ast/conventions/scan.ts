import fs from 'fs-extra';
import path from 'path';
import { grammarForExtension } from '../grammar-map.js';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.next',
  'coverage', '.turbo', 'out', '__pycache__', '.venv', 'venv', '.cache', 'tmp',
]);

export interface ScannedFile {
  readonly rel: string;
  readonly content: string;
  readonly wasm: NonNullable<ReturnType<typeof grammarForExtension>>['wasm'];
  readonly lang: NonNullable<ReturnType<typeof grammarForExtension>>['lang'];
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Scan rel paths under root that have AST grammar support. */
export async function scanConventionFiles(
  root: string,
  relFiles: readonly string[],
  maxFileBytes: number,
): Promise<ScannedFile[]> {
  const out: ScannedFile[] = [];
  for (const rel of relFiles) {
    const norm = toPosix(rel);
    const ext = path.extname(norm).toLowerCase();
    const spec = grammarForExtension(ext);
    if (!spec) continue;
    const abs = path.join(root, norm);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat || stat.size > maxFileBytes) continue;
    const content = await fs.readFile(abs, 'utf-8').catch(() => '');
    if (!content) continue;
    out.push({ rel: norm, content, wasm: spec.wasm, lang: spec.lang });
  }
  return out;
}

export { IGNORE_DIRS, toPosix };
