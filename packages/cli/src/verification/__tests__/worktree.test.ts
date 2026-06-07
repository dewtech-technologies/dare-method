import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  createWorktree,
  listWorktrees,
  removeWorktree,
} from '../best-of-n/worktree.js';

function runGit(cwd: string, args: string): void {
  execSync(`git ${args}`, { cwd, stdio: 'pipe' });
}

describe('worktree', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-wt-'));
    runGit(repoRoot, 'init');
    runGit(repoRoot, 'config user.email "test@dare.local"');
    runGit(repoRoot, 'config user.name "DARE Test"');
    await fs.writeFile(path.join(repoRoot, 'README.md'), '# tmp\n');
    runGit(repoRoot, 'add README.md');
    runGit(repoRoot, 'commit -m "init"');
  });

  afterEach(async () => {
    await fs.remove(repoRoot).catch(() => undefined);
  });

  it('should_create_and_list_worktree', async () => {
    const wt = await createWorktree(repoRoot, 'cand-a');
    expect(wt.path).toBe('.dare/worktrees/cand-a');
    expect(wt.branch).toBe('dare/cand-cand-a');

    const listed = await listWorktrees(repoRoot);
    expect(listed.some((w) => w.id === 'cand-a')).toBe(true);
  });

  it('should_remove_worktree', async () => {
    const wt = await createWorktree(repoRoot, 'cand-b');
    await removeWorktree(repoRoot, wt);
    const listed = await listWorktrees(repoRoot);
    expect(listed.some((w) => w.id === 'cand-b')).toBe(false);
  });

  it('should_reject_unsafe_id', async () => {
    await expect(createWorktree(repoRoot, '../evil')).rejects.toThrow(
      /must not contain|unsafe/i,
    );
  });
});
