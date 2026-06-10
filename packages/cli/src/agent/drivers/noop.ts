import type { AgentDriver } from '../driver.js';

export const noopDriver: AgentDriver = {
  id: 'noop',
  requiresNetwork: false,
  async run(input) {
    return {
      status: 'aborted',
      worktree: input.worktree,
      summary: 'noop',
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'noop' },
    };
  },
};
