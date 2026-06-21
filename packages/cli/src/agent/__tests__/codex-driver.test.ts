import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunInput } from '../driver.js';
import { createCodexCliDriver } from '../drivers/codex.js';
import * as safeSpawnMod from '../../exec/safe-spawn.js';

function makeInput(signal: AbortSignal): AgentRunInput {
  return {
    taskId: 'task-123',
    spec: '# spec',
    steering: [],
    worktree: '/tmp/codex-worktree',
    budgetRemaining: 1000,
    signal,
  };
}

describe('codex cli driver', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs_codex_exec_with_safe_noninteractive_defaults', async () => {
    const spawnSpy = vi.spyOn(safeSpawnMod, 'safeSpawn').mockResolvedValue({
      code: 0,
      stdout: [
        JSON.stringify({
          type: 'item.completed',
          item: { type: 'agent_message', text: 'implemented' },
        }),
        JSON.stringify({
          type: 'turn.completed',
          usage: { input_tokens: 42, output_tokens: 8 },
        }),
      ].join('\n'),
      stderr: '',
      timedOut: false,
    });

    const driver = createCodexCliDriver({ model: 'gpt-5.4' });
    const result = await driver.run(makeInput(new AbortController().signal));

    expect(spawnSpy).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining([
        'exec',
        '--json',
        '--sandbox',
        'workspace-write',
        '--ask-for-approval',
        'never',
        '--model',
        'gpt-5.4',
      ]),
      expect.objectContaining({ cwd: '/tmp/codex-worktree' }),
    );
    expect(result.status).toBe('implemented');
    expect(result.summary).toBe('implemented');
    expect(result.usage).toMatchObject({
      inputTokens: 42,
      outputTokens: 8,
      model: 'gpt-5.4',
    });
  });

  it('returns_failed_on_nonzero_exit', async () => {
    vi.spyOn(safeSpawnMod, 'safeSpawn').mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'not authenticated',
      timedOut: false,
    });

    const driver = createCodexCliDriver();
    const result = await driver.run(makeInput(new AbortController().signal));

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('not authenticated');
    expect(result.failureSignature).toBe('CodexExit1');
  });
});
