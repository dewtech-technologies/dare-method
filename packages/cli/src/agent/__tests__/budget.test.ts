import { describe, it, expect } from 'vitest';
import { BudgetTracker } from '../budget.js';
import type { TokenUsage } from '../driver.js';

const usage = (input: number, output: number, cost = 0): TokenUsage => ({
  inputTokens: input,
  outputTokens: output,
  costUsd: cost,
  model: 'mock',
});

describe('BudgetTracker', () => {
  it('should_sum_all_best_of_n_candidates', () => {
    const budget = new BudgetTracker(1000);
    budget.add(usage(100, 50, 0.01));
    budget.add(usage(200, 100, 0.02));
    budget.add(usage(50, 25, 0.005));
    expect(budget.spent.tokens).toBe(525);
    expect(budget.spent.usd).toBeCloseTo(0.035);
  });

  it('should_be_unlimited_when_null', () => {
    const budget = new BudgetTracker(null);
    budget.add(usage(999_999, 999_999));
    expect(budget.remaining()).toBe(Number.POSITIVE_INFINITY);
    expect(budget.exhausted()).toBe(false);
  });

  it('should_exhaust_at_limit', () => {
    const budget = new BudgetTracker(100);
    budget.add(usage(60, 40));
    expect(budget.exhausted()).toBe(true);
    expect(budget.remaining()).toBe(0);
  });

  it('should_not_go_negative', () => {
    const budget = new BudgetTracker(50);
    budget.add(usage(100, 100));
    expect(budget.remaining()).toBe(0);
  });
});
