/** Copy guard static assets into dist/ for runtime (npm pack + CI dogfood). */
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src', 'guard', 'rules', 'scan-rules.json');
const outDir = path.join(root, 'dist', 'guard', 'rules');
const dst = path.join(outDir, 'scan-rules.json');

await fs.ensureDir(outDir);
await fs.copy(src, dst);
console.log(`[copy-guard-rules] copied scan-rules.json → ${outDir}`);
