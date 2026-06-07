import path from 'node:path';
import fs from 'fs-extra';
import type { Candidate, VerificationConfig } from '../types.js';
import {
  createRunVerification,
  runVerification as defaultRunVerification,
} from '../runner.js';
import { gitChangedFiles } from '../../commands/execute-verification.js';
import { safeSpawn } from '../../exec/safe-spawn.js';
import { createLogger } from '../../utils/logger.js';
import {
  createWorktree as defaultCreateWorktree,
  removeWorktree as defaultRemoveWorktree,
  type Worktree,
} from './worktree.js';
import { selectByPareto } from './selector/pareto.js';

const log = createLogger('best-of-n');

export interface RunBestOfNArgs {
  readonly taskId: string;
  readonly repoRoot: string;
  readonly n: number;
  readonly stack: string;
  readonly config: VerificationConfig;
  readonly fillCandidate: (wt: Worktree) => Promise<void>;
}

export interface RunBestOfNDeps {
  readonly runVerification: typeof defaultRunVerification;
  readonly createWorktree: typeof defaultCreateWorktree;
  readonly removeWorktree: typeof defaultRemoveWorktree;
  readonly gitChangedFiles: typeof gitChangedFiles;
  readonly promoteWinner: (repoRoot: string, winner: Worktree) => Promise<void>;
}

export async function promoteWinnerPatch(
  repoRoot: string,
  winner: Worktree,
): Promise<void> {
  const diff = await safeSpawn('git', ['diff', 'HEAD', winner.branch], {
    cwd: repoRoot,
    timeoutSeconds: 120,
    maxChars: 500_000,
  });
  if (!diff.stdout.trim()) return;

  const patchPath = path.join(repoRoot, '.dare', 'winner.patch');
  await fs.ensureDir(path.dirname(patchPath));
  await fs.writeFile(patchPath, diff.stdout);

  const apply = await safeSpawn('git', ['apply', patchPath], {
    cwd: repoRoot,
    timeoutSeconds: 120,
    maxChars: 8000,
  });
  if (apply.code !== 0) {
    throw new Error(`git apply failed: ${apply.stderr.trim()}`);
  }
}

const defaultDeps: RunBestOfNDeps = {
  runVerification: defaultRunVerification,
  createWorktree: defaultCreateWorktree,
  removeWorktree: defaultRemoveWorktree,
  gitChangedFiles,
  promoteWinner: promoteWinnerPatch,
};

export function createRunBestOfN(
  deps: Partial<RunBestOfNDeps> = {},
): (args: RunBestOfNArgs) => Promise<{
  winner: Candidate;
  discarded: ReadonlyArray<Candidate>;
}> {
  const d = { ...defaultDeps, ...deps };

  return async function runBestOfN(args: RunBestOfNArgs) {
    const worktrees: Worktree[] = [];
    const candidates: Candidate[] = [];
    const verifyConfig: VerificationConfig = { ...args.config, enabled: true };

    try {
      for (let i = 1; i <= args.n; i++) {
        const id = `cand-${i}`;
        const wt = await d.createWorktree(args.repoRoot, id);
        worktrees.push(wt);
        log.info({ id, path: wt.path }, 'worktree created');

        await args.fillCandidate(wt);

        const wtCwd = path.resolve(args.repoRoot, wt.path);
        const changedFiles = await d.gitChangedFiles(wtCwd);
        const verification = await d.runVerification({
          taskId: args.taskId,
          stack: args.stack,
          cwd: wtCwd,
          config: verifyConfig,
          changedFiles,
        });

        candidates.push({ id, worktree: wt, verification });
      }

      const winner = selectByPareto(candidates);
      await d.promoteWinner(args.repoRoot, winner.worktree);

      const discarded = candidates.filter((c) => c.id !== winner.id);
      return { winner, discarded };
    } finally {
      for (const wt of worktrees) {
        await d.removeWorktree(args.repoRoot, wt).catch((err) => {
          log.warn(
            { id: wt.id, err: err instanceof Error ? err.message : String(err) },
            'worktree cleanup failed',
          );
        });
      }
    }
  };
}

export const runBestOfN = createRunBestOfN();
