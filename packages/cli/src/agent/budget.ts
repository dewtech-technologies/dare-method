import type { TokenUsage } from './driver.js';

export class BudgetTracker {
  private spentTokens = 0;
  private spentUsd = 0;

  constructor(private readonly totalTokens: number | null) {}

  add(usage: TokenUsage): void {
    this.spentTokens += usage.inputTokens + usage.outputTokens;
    this.spentUsd += usage.costUsd;
  }

  remaining(): number {
    return this.totalTokens === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, this.totalTokens - this.spentTokens);
  }

  exhausted(): boolean {
    return this.remaining() <= 0;
  }

  get spent(): { tokens: number; usd: number } {
    return { tokens: this.spentTokens, usd: this.spentUsd };
  }
}
