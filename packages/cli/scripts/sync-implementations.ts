/**
 * sync-implementations.ts
 *
 * Copia o conteúdo de implementations/ (fonte da verdade) para
 * packages/cli/templates/ide/ (incluído no pacote npm).
 *
 * Rodado automaticamente como parte de `pnpm build`.
 * Pode também ser executado manualmente: `pnpm sync`
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const IMPL_DIR = path.join(REPO_ROOT, 'implementations');
const IDE_TEMPLATES = path.join(__dirname, '..', 'templates', 'ide');

type SyncEntry = {
  src: string;
  dest: string;
};

const entries: SyncEntry[] = [
  // ── Cursor ────────────────────────────────────────────────────────────────
  {
    src: path.join(IMPL_DIR, 'cursor', '.cursor', 'commands'),
    dest: path.join(IDE_TEMPLATES, 'cursor', '.cursor', 'commands'),
  },
  {
    src: path.join(IMPL_DIR, 'cursor', '.cursor', 'rules'),
    dest: path.join(IDE_TEMPLATES, 'cursor', '.cursor', 'rules'),
  },
  {
    src: path.join(IMPL_DIR, 'cursor', 'templates'),
    dest: path.join(IDE_TEMPLATES, 'cursor', 'templates'),
  },

  // ── Antigravity ───────────────────────────────────────────────────────────
  {
    src: path.join(IMPL_DIR, 'antigravity', '.agents', 'skills'),
    dest: path.join(IDE_TEMPLATES, 'antigravity', '.agents', 'skills'),
  },
  {
    src: path.join(IMPL_DIR, 'antigravity', 'templates'),
    dest: path.join(IDE_TEMPLATES, 'antigravity', 'templates'),
  },

  // ── Claude Code ───────────────────────────────────────────────────────────
  {
    src: path.join(IMPL_DIR, 'claude', 'CLAUDE.md'),
    dest: path.join(IDE_TEMPLATES, 'claude', 'CLAUDE.md'),
  },
  {
    src: path.join(IMPL_DIR, 'claude', '.claude', 'commands'),
    dest: path.join(IDE_TEMPLATES, 'claude', '.claude', 'commands'),
  },
  {
    src: path.join(IMPL_DIR, 'claude', '.claude', 'settings.example.json'),
    dest: path.join(IDE_TEMPLATES, 'claude', '.claude', 'settings.example.json'),
  },
  {
    src: path.join(IMPL_DIR, 'claude', 'templates'),
    dest: path.join(IDE_TEMPLATES, 'claude', 'templates'),
  },
];

async function sync(): Promise<void> {
  let synced = 0;
  let skipped = 0;

  for (const { src, dest } of entries) {
    if (!(await fs.pathExists(src))) {
      console.warn(`  ⚠  Fonte não encontrada: ${src}`);
      skipped++;
      continue;
    }

    const stat = await fs.stat(src);
    if (stat.isDirectory()) {
      await fs.ensureDir(dest);
    } else {
      await fs.ensureDir(path.dirname(dest));
    }
    await fs.copy(src, dest, { overwrite: true });

    const rel = path.relative(REPO_ROOT, src);
    const relDest = path.relative(REPO_ROOT, dest);
    console.log(`  ✓  ${rel}  →  ${relDest}`);
    synced++;
  }

  console.log(`\n  Sync concluído: ${synced} copiados, ${skipped} ignorados.\n`);
}

console.log('\n[sync-implementations] Sincronizando implementations/ → templates/ide/\n');
sync().catch((err) => {
  console.error('[sync-implementations] Erro:', err);
  process.exit(1);
});
