import { describe, it, expect } from 'vitest';
import {
  prerank,
  reorderByPrerank,
  PRERANK_NEVER_AUTHORIZES_DONE,
} from '../best-of-n/selector/prerank.js';

describe('prerank', () => {
  it('should_score_in_zero_one_range', () => {
    const scores = prerank([
      { id: 'a', diff: '--- a/x\n+++ b/x\n@@\n-old\n+new\n' },
      { id: 'b', diff: '+'.repeat(500) },
    ]);
    for (const s of scores) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it('should_be_deterministic', () => {
    const input = [{ id: 'x', diff: '--- a/f.ts\n+++ b/f.ts\n@@\n+test\n' }];
    expect(prerank(input)).toEqual(prerank(input));
  });

  it('should_prefer_smaller_diff', () => {
    const scores = prerank([
      { id: 'small', diff: '--- a/x\n+++ b/x\n@@\n+1\n' },
      { id: 'large', diff: '--- a/x\n+++ b/x\n' + '+line\n'.repeat(100) },
    ]);
    const small = scores.find((s) => s.id === 'small')!.score;
    const large = scores.find((s) => s.id === 'large')!.score;
    expect(small).toBeGreaterThan(large);
  });

  it('should_reorder_by_score', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const scores = prerank([
      { id: 'a', diff: '--- a/x\n+++ b/x\n' + '+line\n'.repeat(80) },
      { id: 'b', diff: '--- a/x\n+++ b/x\n@@\n+1\n' },
    ]);
    const ordered = reorderByPrerank(items, scores);
    expect(ordered[0].id).toBe('b');
  });

  it('should_never_authorize_done_rs07', () => {
    expect(PRERANK_NEVER_AUTHORIZES_DONE).toBe(true);
    const scores = prerank([{ id: 'fail', diff: '' }]);
    expect(scores[0].score).toBeLessThanOrEqual(1);
    expect(scores[0]).not.toHaveProperty('verdict');
    expect(scores[0]).not.toHaveProperty('passed');
  });
});
