import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockDriver } from '../drivers/mock.js';
import { noopDriver } from '../drivers/noop.js';
import { safeSpawn } from '../../exec/safe-spawn.js';

async function initGitRepo(dir: string): Promise<void> {
  await safeSpawn('git', ['init'], { cwd: dir, timeoutSeconds: 30 });
  await safeSpawn('git', ['add', '.'], { cwd: dir, timeoutSeconds: 30 });
  await safeSpawn('git', ['commit', '-m', 'baseline', '--allow-empty'], {
    cwd: dir,
    timeoutSeconds: 30,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'dare-test',
      GIT_AUTHOR_EMAIL: 'test@dare.local',
      GIT_COMMITTER_NAME: 'dare-test',
      GIT_COMMITTER_EMAIL: 'test@dare.local',
    },
  });
}

describe('mockDriver', () => {
  let worktree: string;

  beforeEach(async () => {
    worktree = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-mock-wt-'));
    await initGitRepo(worktree);
  });

  afterEach(async () => {
    await fs.remove(worktree).catch(() => undefined);
  });

  it('should_apply_fixture_patch', async () => {
    const result = await mockDriver.run({
      taskId: 'mock-fixture-task',
      spec: '# spec',
      steering: [],
      worktree,
      budgetRemaining: 1000,
      signal: new AbortController().signal,
    });
    expect(result.status).toBe('implemented');
    expect((await fs.readFile(path.join(worktree, 'applied.txt'), 'utf8')).trim()).toBe(
      'mock-fixture-applied',
    );
  });

  it('should_be_deterministic', async () => {
    const input = {
      taskId: 'mock-fixture-task',
      spec: '# spec',
      steering: [] as const,
      worktree,
      budgetRemaining: 1000,
      signal: new AbortController().signal,
    };
    const a = await mockDriver.run(input);
    const b = await mockDriver.run(input);
    expect(a.summary).toBe(b.summary);
    expect(a.usage).toEqual(b.usage);
  });

  it('should_report_zero_usage', async () => {
    const result = await mockDriver.run({
      taskId: 'mock-fixture-task',
      spec: '# spec',
      steering: [],
      worktree,
      budgetRemaining: 1000,
      signal: new AbortController().signal,
    });
    expect(result.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      model: 'mock',
    });
  });

  it('should_abort_on_signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await mockDriver.run({
      taskId: 'mock-fixture-task',
      spec: '# spec',
      steering: [],
      worktree,
      budgetRemaining: 1000,
      signal: controller.signal,
    });
    expect(result.status).toBe('aborted');
  });

  it('noop_returns_aborted', async () => {
    const result = await noopDriver.run({
      taskId: 'any',
      spec: '# spec',
      steering: [],
      worktree,
      budgetRemaining: 1000,
      signal: new AbortController().signal,
    });
    expect(result.status).toBe('aborted');
    expect(noopDriver.requiresNetwork).toBe(false);
  });
});
