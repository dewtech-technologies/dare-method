import type { GuardedArtifact } from '../guard/types.js';

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** estimado a partir do modelo */
  readonly costUsd: number;
  readonly model: string;
}

/**
 * Entrada para {@link AgentDriver.run}.
 *
 * Pré-condição: `spec` e cada item de `steering` já passaram pelo guard (verdict ≠ FAIL).
 */
export interface AgentRunInput {
  readonly taskId: string;
  /** EXECUTION/task-*.md já validado pelo guard */
  readonly spec: string;
  /** só artefatos PASS/WARN */
  readonly steering: ReadonlyArray<GuardedArtifact>;
  readonly worktree: string;
  readonly budgetRemaining: number;
  /** cancelamento por budget/aprovação */
  readonly signal: AbortSignal;
}

/**
 * Resultado de uma execução de agente.
 *
 * Pós-condição: em `status: 'implemented'` há patch aplicável no `worktree`;
 * `usage` sempre preenchido.
 */
export interface AgentRunResult {
  readonly status: 'implemented' | 'failed' | 'aborted';
  readonly worktree: string;
  /** não-autoritativo */
  readonly summary: string;
  readonly usage: TokenUsage;
  /** alimenta decideNextAction */
  readonly failureSignature?: string;
}

export interface AgentDriver {
  /** 'mock' | 'noop' | 'claude' */
  readonly id: string;
  readonly requiresNetwork: boolean;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
