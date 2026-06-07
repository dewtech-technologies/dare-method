/**
 * Exec-free candidate ordering (RF-09). RS-07: prerank NEVER authorizes DONE/PASS —
 * it only produces scores in [0, 1] for reordering before verification.
 */

export interface PrerankInput {
  readonly id: string;
  readonly diff: string;
}

export interface PrerankScore {
  readonly id: string;
  readonly score: number;
}

/** Documented invariant for security tests (RS-07). */
export const PRERANK_NEVER_AUTHORIZES_DONE = true as const;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Deterministic heuristic: prefer smaller diffs, fewer hunks, and test-file touches.
 */
export function prerank(inputs: ReadonlyArray<PrerankInput>): PrerankScore[] {
  return inputs.map(({ id, diff }) => {
    const changedLines = diff
      .split('\n')
      .filter((l) => l.startsWith('+') || l.startsWith('-')).length;
    const hunks = (diff.match(/^@@/gm) ?? []).length;
    const testTouches = (diff.match(/\.(spec|test)\./gi) ?? []).length;

    const sizePenalty = Math.min(1, changedLines / 200);
    const hunkPenalty = Math.min(1, hunks / 20);
    const testBonus = Math.min(0.3, testTouches * 0.1);
    const score = clamp01(1 - sizePenalty * 0.5 - hunkPenalty * 0.2 + testBonus);

    return { id, score };
  });
}

/** Reorder items by prerank scores (descending). Does not mutate verification verdicts. */
export function reorderByPrerank<T extends { id: string }>(
  items: ReadonlyArray<T>,
  scores: ReadonlyArray<PrerankScore>,
): T[] {
  const scoreMap = new Map(scores.map((s) => [s.id, s.score]));
  return [...items].sort(
    (a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0),
  );
}
