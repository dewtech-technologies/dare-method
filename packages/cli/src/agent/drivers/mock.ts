import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { safeSpawn } from '../../exec/safe-spawn.js';
import type { AgentDriver } from '../driver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', '__fixtures__', 'patches');

const ZERO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  model: 'mock',
} as const;

async function applyFixturePatch(
  worktree: string,
  taskId: string,
): Promise<boolean> {
  const patchPath = path.join(FIXTURES_DIR, `${taskId}.diff`);
  if (!(await fs.pathExists(patchPath))) return false;

  await fs.ensureDir(worktree);
  const patch = await fs.readFile(patchPath, 'utf8');
  const tmpPatch = path.join(worktree, '.dare-mock.patch');
  await fs.writeFile(tmpPatch, patch);

  const apply = await safeSpawn('git', ['apply', '--whitespace=nowarn', tmpPatch], {
    cwd: worktree,
    timeoutSeconds: 30,
    maxChars: 8000,
  });
  await fs.remove(tmpPatch).catch(() => undefined);
  if (apply.code !== 0) {
    const err = apply.stderr.trim();
    if (err.includes('already exists in working directory')) return true;
    throw new Error(`mock patch apply failed: ${err}`);
  }
  return true;
}

export const mockDriver: AgentDriver = {
  id: 'mock',
  requiresNetwork: false,
  async run(input) {
    if (input.signal.aborted) {
      return {
        status: 'aborted',
        worktree: input.worktree,
        summary: 'mock aborted by signal',
        usage: { ...ZERO_USAGE },
      };
    }

    await applyFixturePatch(input.worktree, input.taskId);

    return {
      status: 'implemented',
      worktree: input.worktree,
      summary: `mock applied for ${input.taskId}`,
      usage: { ...ZERO_USAGE },
    };
  },
};
