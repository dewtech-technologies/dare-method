import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunInput } from '../driver.js';
import {
  AgentSdkMissingError,
  createClaudeDriver,
  setClaudeSdkImporterForTests,
} from '../drivers/claude.js';

function makeInput(signal: AbortSignal): AgentRunInput {
  return {
    taskId: 'task-605',
    spec: '# spec',
    steering: [],
    worktree: '/tmp/worktree',
    budgetRemaining: 1000,
    signal,
  };
}

describe('claude driver', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    setClaudeSdkImporterForTests(null);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });

  afterEach(() => {
    setClaudeSdkImporterForTests(null);
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it('throws_AgentSdkMissingError_when_absent', async () => {
    setClaudeSdkImporterForTests(async () => {
      throw new Error('module missing');
    });

    await expect(createClaudeDriver({ model: 'claude-sonnet-4-5' })).rejects.toBeInstanceOf(
      AgentSdkMissingError,
    );
  });

  it('does_not_log_api_key', async () => {
    const key = 'sk-ant-secret-should-not-leak';
    process.env.ANTHROPIC_API_KEY = key;

    const createSpy = vi.fn(async () => ({
      usage: { input_tokens: 5, output_tokens: 3 },
      content: [{ type: 'text', text: 'ok' }],
    }));

    class MockAnthropic {
      readonly messages = { create: createSpy };
    }

    setClaudeSdkImporterForTests(async () => ({ default: MockAnthropic }));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const driver = await createClaudeDriver({ model: 'claude-sonnet-4-5' });
    await driver.run(makeInput(new AbortController().signal));

    const output = [...logSpy.mock.calls, ...infoSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((value) => String(value))
      .join('\n');

    expect(output).not.toContain(key);
  });

  it('run_returns_usage', async () => {
    const createSpy = vi.fn(async () => ({
      usage: { input_tokens: 120, output_tokens: 60 },
      content: [{ type: 'text', text: 'implemented patch' }],
    }));
    let receivedKey = '';

    class MockAnthropic {
      readonly messages = { create: createSpy };

      constructor(options: { readonly apiKey: string }) {
        receivedKey = options.apiKey;
      }
    }

    setClaudeSdkImporterForTests(async () => ({ default: MockAnthropic }));

    const driver = await createClaudeDriver({ model: 'claude-sonnet-4-5', maxTokens: 512 });
    const signal = new AbortController().signal;
    const result = await driver.run(makeInput(signal));

    expect(receivedKey).toBe('sk-ant-test-key');
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-5',
        max_tokens: 512,
      }),
      expect.objectContaining({ signal }),
    );
    expect(result.status).toBe('implemented');
    expect(result.usage.inputTokens).toBe(120);
    expect(result.usage.outputTokens).toBe(60);
    expect(result.usage.costUsd).toBeCloseTo(0.00126, 6);
    expect(result.usage.model).toBe('claude-sonnet-4-5');
  });
});
