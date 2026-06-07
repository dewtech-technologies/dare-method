import { describe, it, expect } from 'vitest';
import {
  buildReport,
  computeFixtureResult,
  type BenchReport,
  type FixtureResult,
} from '../bench/report.js';

function fixture(
  id: string,
  failToPass: { passed: number; total: number },
  passToPass: { passed: number; total: number },
): FixtureResult {
  return computeFixtureResult({
    id,
    stack: 'node-nestjs',
    failToPass,
    passToPass,
    durationMs: 100,
  });
}

describe('computeFixtureResult', () => {
  it('should_zero_fixrate_on_p2p_regression', () => {
    const result = fixture('fix-reg', { passed: 3, total: 3 }, { passed: 2, total: 3 });
    expect(result.passToPassRegressed).toBe(true);
    expect(result.fixRate).toBe(0);
    expect(result.solved).toBe(false);
  });
});

describe('buildReport', () => {
  it('should_compute_solve_rate', () => {
    const results = [
      fixture('a', { passed: 2, total: 2 }, { passed: 1, total: 1 }),
      fixture('b', { passed: 1, total: 2 }, { passed: 1, total: 1 }),
    ];
    const report = buildReport(results, { suite: 'fixtures/bench', ranAt: '2026-06-04T20:00:00Z' });
    expect(report.totals.fixtures).toBe(2);
    expect(report.totals.solved).toBe(1);
    expect(report.totals.solveRate).toBe(0.5);
    expect(report.schemaVersion).toBe(1);
  });

  it('should_flag_regression_beyond_threshold', () => {
    const baseline: BenchReport = {
      schemaVersion: 1,
      ranAt: '2026-06-01T00:00:00Z',
      suite: 'fixtures/bench',
      totals: { fixtures: 2, solved: 2, solveRate: 1 },
      results: [],
    };
    const results = [
      fixture('a', { passed: 2, total: 2 }, { passed: 1, total: 1 }),
      fixture('b', { passed: 0, total: 2 }, { passed: 1, total: 1 }),
    ];
    const report = buildReport(results, {
      suite: 'fixtures/bench',
      baseline,
      failOnRegressionPp: 3,
      ranAt: '2026-06-04T20:00:00Z',
    });
    expect(report.regression?.deltaPp).toBe(-50);
    expect(report.regression?.failed).toBe(true);
  });

  it('should_not_flag_within_threshold', () => {
    const baseline: BenchReport = {
      schemaVersion: 1,
      ranAt: '2026-06-01T00:00:00Z',
      suite: 'fixtures/bench',
      totals: { fixtures: 10, solved: 9, solveRate: 0.9 },
      results: [],
    };
    const results = Array.from({ length: 10 }, (_, i) =>
      fixture(
        `f-${i}`,
        { passed: i === 0 ? 1 : 2, total: 2 },
        { passed: 1, total: 1 },
      ),
    );
    const report = buildReport(results, {
      suite: 'fixtures/bench',
      baseline,
      failOnRegressionPp: 3,
      ranAt: '2026-06-04T20:00:00Z',
    });
    expect(report.totals.solveRate).toBe(0.9);
    expect(report.regression?.deltaPp).toBe(0);
    expect(report.regression?.failed).toBe(false);
  });
});
