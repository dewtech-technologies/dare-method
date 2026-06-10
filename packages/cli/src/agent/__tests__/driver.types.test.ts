import { describe, it, expect } from 'vitest';
import type {
  TokenUsage,
  AgentRunInput,
  AgentRunResult,
  AgentDriver,
} from '../driver.js';
import type { GuardedArtifact } from '../../guard/types.js';

describe('agent/driver types', () => {
  it('exports_all_symbols', () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      model: 'mock',
    };
    const steering: ReadonlyArray<GuardedArtifact> = [];
    const input: AgentRunInput = {
      taskId: 'task-601',
      spec: '# spec',
      steering,
      worktree: '/tmp/wt',
      budgetRemaining: 1000,
      signal: new AbortController().signal,
    };
    const result: AgentRunResult = {
      status: 'implemented',
      worktree: input.worktree,
      summary: 'done',
      usage,
    };
    const driver: AgentDriver = {
      id: 'mock',
      requiresNetwork: false,
      run: async () => result,
    };
    expect(driver.id).toBe('mock');
  });
});
