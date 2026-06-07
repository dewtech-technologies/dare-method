import path from 'node:path';
import fs from 'fs-extra';
import { safeSpawn } from '../../exec/safe-spawn.js';
import { assertRelativeSafe } from '../../utils/path-safety.js';

export interface Worktree {
  readonly id: string;
  readonly path: string;
  readonly branch: string;
}

const WORKTREE_ROOT = '.dare/worktrees';

function worktreeRelPath(id: string): string {
  const rel = path.posix.join(WORKTREE_ROOT, id);
  assertRelativeSafe(rel);
  return rel;
}

function branchName(id: string): string {
  assertRelativeSafe(id);
  if (id.includes('/') || id.includes('\\')) {
    throw new Error(`unsafe worktree id: ${id}`);
  }
  return `dare/cand-${id}`;
}

async function git(
  repoRoot: string,
  args: ReadonlyArray<string>,
  timeoutSeconds = 120,
): Promise<{ code: number; stderr: string }> {
  const result = await safeSpawn('git', args, {
    cwd: repoRoot,
    timeoutSeconds,
    maxChars: 8000,
  });
  return { code: result.code, stderr: result.stderr };
}

export async function createWorktree(
  repoRoot: string,
  id: string,
): Promise<Worktree> {
  const rel = worktreeRelPath(id);
  const absPath = path.resolve(repoRoot, rel);
  const branch = branchName(id);

  await fs.ensureDir(path.dirname(absPath));

  const add = await git(repoRoot, [
    'worktree',
    'add',
    '-b',
    branch,
    absPath,
    'HEAD',
  ]);
  if (add.code !== 0) {
    throw new Error(
      `git worktree add failed for ${id}: ${add.stderr.trim()}`,
    );
  }

  return { id, path: rel, branch };
}

export async function removeWorktree(
  repoRoot: string,
  wt: Worktree,
): Promise<void> {
  assertRelativeSafe(wt.path);
  const absPath = path.resolve(repoRoot, wt.path);

  const remove = await git(repoRoot, ['worktree', 'remove', '--force', absPath]);
  if (remove.code !== 0) {
    throw new Error(
      `git worktree remove failed for ${wt.id}: ${remove.stderr.trim()}`,
    );
  }

  await git(repoRoot, ['branch', '-D', wt.branch]).catch(() => undefined);
  await fs.remove(absPath).catch(() => undefined);
}

export async function listWorktrees(
  repoRoot: string,
): Promise<ReadonlyArray<Worktree>> {
  const result = await safeSpawn(
    'git',
    ['worktree', 'list', '--porcelain'],
    { cwd: repoRoot, timeoutSeconds: 60, maxChars: 16000 },
  );
  if (result.code !== 0) {
    throw new Error(`git worktree list failed: ${result.stderr.trim()}`);
  }

  const out: Worktree[] = [];
  const prefix = path.resolve(repoRoot, WORKTREE_ROOT) + path.sep;
  let absPath = '';
  let branch = '';

  const flush = (): void => {
    if (!absPath) return;
    const normalized = path.resolve(absPath);
    if (!normalized.startsWith(prefix)) {
      absPath = '';
      branch = '';
      return;
    }
    const rel = path.relative(repoRoot, normalized).replace(/\\/g, '/');
    const id = path.basename(rel);
    out.push({
      id,
      path: rel,
      branch: branch || branchName(id),
    });
    absPath = '';
    branch = '';
  };

  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      flush();
      absPath = line.slice('worktree '.length).trim();
    } else if (line.startsWith('branch ')) {
      branch = line
        .slice('branch '.length)
        .trim()
        .replace(/^refs\/heads\//, '');
    } else if (line === '') {
      flush();
    }
  }
  flush();

  return out;
}
