import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  createRunBestOfN,
  promoteWinnerPatch,
} from '../best-of-n/runner.js';
import { createWorktree, type Worktree } from '../best-of-n/worktree.js';
import type { VerificationResult } from '../types.js';
import { DEFAULTS } from '../config.js';

function runGit(cwd: string, args: string): void {
  execSync(`git ${args}`, { cwd, stdio: 'pipe' });
}

function passResult(taskId: string, score: number): VerificationResult {
  return {
    taskId,
    passed: true,
    aspects: [
      { aspect: 'test', verdict: 'PASS', reason: 'ok', durationMs: 1 },
      { aspect: 'mutation', verdict: 'PASS', score, reason: 'ok', durationMs: 1 },
    ],
    mutationScore: score,
    durationMs: 5,
  };
}

describe('runBestOfN', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-bon-'));
    runGit(repoRoot, 'init');
    runGit(repoRoot, 'config user.email "test@dare.local"');
    runGit(repoRoot, 'config user.name "DARE Test"');
    await fs.writeFile(path.join(repoRoot, 'README.md'), '# base\n');
    runGit(repoRoot, 'add README.md');
    runGit(repoRoot, 'commit -m "init"');
  });

  afterEach(async () => {
    await fs.remove(repoRoot).catch(() => undefined);
  });

  it('should_select_winner_and_cleanup_worktrees', async () => {
    const removed: string[] = [];
    const runBestOfN = createRunBestOfN({
      runVerification: vi.fn(async () => passResult('task-bon', 0.5)),
      promoteWinner: vi.fn(async () => undefined),
      removeWorktree: vi.fn(async (_root, wt) => {
        removed.push(wt.id);
      }),
    });

    const fillCandidate = vi.fn(async (wt: Worktree) => {
      const file = path.join(repoRoot, wt.path, 'cand.txt');
      await fs.ensureDir(path.dirname(file));
      await fs.writeFile(file, wt.id);
    });

    const { winner, discarded } = await runBestOfN({
      taskId: 'task-bon',
      repoRoot,
      n: 2,
      stack: 'node-nestjs',
      config: {
        ...DEFAULTS,
        enabled: false,
        failToPass: { required: false },
        antiTamper: { enabled: false },
        typeCheck: { enabled: false },
      },
      fillCandidate,
    });

    expect(winner.id).toBeDefined();
    expect(discarded.length).toBe(1);
    expect(fillCandidate).toHaveBeenCalledTimes(2);
    expect(removed.length).toBe(2);
  });

  it('should_promote_winner_patch_to_main', async () => {
    const wt = await createWorktree(repoRoot, 'cand-1');
    const wtCwd = path.join(repoRoot, wt.path);
    await fs.writeFile(path.join(wtCwd, 'winner.txt'), 'picked\n');
    runGit(wtCwd, 'add winner.txt');
    runGit(wtCwd, 'commit -m "candidate change"');

    await promoteWinnerPatch(repoRoot, wt);

    expect(await fs.pathExists(path.join(repoRoot, 'winner.txt'))).toBe(true);
  });
});
