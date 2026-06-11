import { describe, expect, it } from 'vitest';
import { cosine, cosineTopK } from '../vector-search.js';

describe('vector-search', () => {
  it('cosine_known_values', () => {
    const orthogonal = cosine(new Float32Array([1, 0]), new Float32Array([0, 1]));
    const identical = cosine(new Float32Array([1, 2, 3]), new Float32Array([1, 2, 3]));

    expect(orthogonal).toBe(0);
    expect(identical).toBeCloseTo(1, 10);
  });

  it('topK_orders_desc', () => {
    const query = new Float32Array([1, 0]);
    const ranked = cosineTopK(
      query,
      [
        { id: 'c', v: new Float32Array([0, 1]) },
        { id: 'a', v: new Float32Array([1, 0]) },
        { id: 'b', v: new Float32Array([0.8, 0.2]) },
        { id: 'd', v: new Float32Array([-1, 0]) },
      ],
      3,
    );

    expect(ranked.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(ranked[1]?.score ?? -Infinity);
    expect(ranked[1]?.score).toBeGreaterThanOrEqual(ranked[2]?.score ?? -Infinity);
  });

  it('topK_stable_on_ties', () => {
    const query = new Float32Array([1, 0]);
    const ranked = cosineTopK(
      query,
      [
        { id: 'first', v: new Float32Array([2, 0]) },
        { id: 'second', v: new Float32Array([3, 0]) },
        { id: 'third', v: new Float32Array([0, 1]) },
      ],
      2,
    );

    expect(ranked.map((item) => item.id)).toEqual(['first', 'second']);
  });

  it('mismatched_dim_throws', () => {
    expect(() =>
      cosine(new Float32Array([1, 2]), new Float32Array([1, 2, 3])),
    ).toThrow(/dimensions must match/i);

    expect(() =>
      cosineTopK(
        new Float32Array([1, 2]),
        [{ id: 'bad', v: new Float32Array([1, 2, 3]) }],
        1,
      ),
    ).toThrow(/dimensions must match/i);
  });
});
