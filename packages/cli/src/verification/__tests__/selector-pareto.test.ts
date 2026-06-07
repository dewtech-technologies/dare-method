import { describe, it, expect } from 'vitest';
import {
  selectByPareto,
  NoViableCandidateError,
} from '../best-of-n/selector/pareto.js';
import type { AspectResult, Candidate } from '../types.js';

function worktree(id: string) {
  return { id, path: `.dare/worktrees/${id}`, branch: `dare/cand-${id}` };
}

function aspect(
  name: AspectResult['aspect'],
  verdict: AspectResult['verdict'],
  score?: number,
): AspectResult {
  return { aspect: name, verdict, score, reason: verdict, durationMs: 1 };
}

function candidate(
  id: string,
  aspects: ReadonlyArray<AspectResult>,
  mutationScore?: number,
): Candidate {
  const passed = !aspects.some((a) => a.verdict === 'FAIL');
  return {
    id,
    worktree: worktree(id),
    verification: {
      taskId: 'task-bench',
      passed,
      aspects,
      mutationScore,
      durationMs: 5,
    },
  };
}

const allPass = (id: string, mutationScore: number) =>
  candidate(
    id,
    [
      aspect('test', 'PASS'),
      aspect('lint', 'PASS'),
      aspect('type', 'PASS'),
      aspect('mutation', 'PASS', mutationScore),
    ],
    mutationScore,
  );

describe('selectByPareto', () => {
  it('should_pick_dominant', () => {
    const winner = selectByPareto([
      allPass('cand-2', 0.6),
      allPass('cand-1', 0.9),
    ]);
    expect(winner.id).toBe('cand-1');
  });

  it('should_break_tie_by_mutation_score', () => {
    const a = candidate(
      'cand-a',
      [
        aspect('test', 'PASS'),
        aspect('lint', 'PASS'),
        aspect('type', 'SKIP'),
        aspect('mutation', 'PASS', 0.8),
      ],
      0.8,
    );
    const b = candidate(
      'cand-b',
      [
        aspect('test', 'PASS'),
        aspect('lint', 'SKIP'),
        aspect('type', 'PASS'),
        aspect('mutation', 'PASS', 0.75),
      ],
      0.75,
    );
    expect(selectByPareto([a, b]).id).toBe('cand-a');
  });

  it('should_break_remaining_tie_by_id', () => {
    const winner = selectByPareto([
      allPass('cand-z', 0.85),
      allPass('cand-a', 0.85),
      allPass('cand-m', 0.85),
    ]);
    expect(winner.id).toBe('cand-a');
  });

  it('should_discard_failing_candidates', () => {
    const failing = candidate('cand-fail', [
      aspect('test', 'FAIL'),
      aspect('lint', 'PASS'),
      aspect('type', 'PASS'),
      aspect('mutation', 'PASS', 0.99),
    ]);
    const winner = selectByPareto([failing, allPass('cand-ok', 0.5)]);
    expect(winner.id).toBe('cand-ok');
  });

  it('should_throw_when_all_fail', () => {
    expect(() =>
      selectByPareto([
        candidate('cand-1', [aspect('test', 'FAIL')]),
        candidate('cand-2', [aspect('mutation', 'FAIL')]),
      ]),
    ).toThrow(NoViableCandidateError);
  });
});
