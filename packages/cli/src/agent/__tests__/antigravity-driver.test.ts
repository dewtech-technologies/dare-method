import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunInput } from '../driver.js';
import { createAntigravityCliDriver } from '../drivers/antigravity.js';
import * as safeSpawnMod from '../../exec/safe-spawn.js';

function makeInput(signal: AbortSignal): AgentRunInput {
  return {
    taskId: 'task-123',
    spec: '# spec',
    steering: [],
    worktree: '/tmp/antigravity-worktree',
    budgetRemaining: 1000,
    signal,
  };
}

describe('antigravity cli driver', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs_antigravity_with_noninteractive_defaults', async () => {
    const spawnSpy = vi.spyOn(safeSpawnMod, 'safeSpawn').mockResolvedValue({
      code: 0,
      stdout: 'task done',
      stderr: '',
      timedOut: false,
    });

    const driver = createAntigravityCliDriver();
    const result = await driver.run(makeInput(new AbortController().signal));

    expect(spawnSpy).toHaveBeenCalledWith(
      'antigravity',
      expect.arrayContaining(['-p', expect.any(String), '--output-format', 'text']),
      expect.objectContaining({ cwd: '/tmp/antigravity-worktree' }),
    );
    expect(result.status).toBe('implemented');
    expect(result.summary).toBe('task done');
  });

  it('aborts_on_signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const driver = createAntigravityCliDriver();
    const result = await driver.run(makeInput(controller.signal));
    expect(result.status).toBe('aborted');
  });

  it('nonzero_exit_marks_failed', async () => {
    vi.spyOn(safeSpawnMod, 'safeSpawn').mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'antigravity unavailable',
      timedOut: false,
    });

    const driver = createAntigravityCliDriver();
    const result = await driver.run(makeInput(new AbortController().signal));

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('antigravity unavailable');
    expect(result.failureSignature).toBe('AntigravityExit1');
  });
});
