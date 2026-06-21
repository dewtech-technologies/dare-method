import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunInput } from '../driver.js';
import { createCursorCliDriver } from '../drivers/cursor.js';
import * as safeSpawnMod from '../../exec/safe-spawn.js';

function makeInput(signal: AbortSignal): AgentRunInput {
  return {
    taskId: 'task-123',
    spec: '# spec',
    steering: [],
    worktree: '/tmp/cursor-worktree',
    budgetRemaining: 1000,
    signal,
  };
}

describe('cursor cli driver', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs_cursor_with_noninteractive_defaults', async () => {
    const spawnSpy = vi.spyOn(safeSpawnMod, 'safeSpawn').mockResolvedValue({
      code: 0,
      stdout: 'implemented in worktree',
      stderr: '',
      timedOut: false,
    });

    const driver = createCursorCliDriver({ model: 'gpt-4.1' });
    const result = await driver.run(makeInput(new AbortController().signal));

    expect(spawnSpy).toHaveBeenCalledWith(
      'cursor-agent',
      expect.arrayContaining(['-p', expect.any(String), '--output-format', 'text', '--model', 'gpt-4.1']),
      expect.objectContaining({ cwd: '/tmp/cursor-worktree' }),
    );
    expect(result.status).toBe('implemented');
    expect(result.summary).toBe('implemented in worktree');
  });

  it('aborts_on_signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const driver = createCursorCliDriver();
    const result = await driver.run(makeInput(controller.signal));
    expect(result.status).toBe('aborted');
  });

  it('nonzero_exit_marks_failed', async () => {
    vi.spyOn(safeSpawnMod, 'safeSpawn').mockResolvedValue({
      code: 2,
      stdout: '',
      stderr: 'cursor not logged in',
      timedOut: false,
    });

    const driver = createCursorCliDriver();
    const result = await driver.run(makeInput(new AbortController().signal));

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('cursor not logged in');
    expect(result.failureSignature).toBe('CursorExit2');
  });
});
