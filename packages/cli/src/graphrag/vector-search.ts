export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} !== ${b.length}`);
  }

  let dot = 0;
  let normASquared = 0;
  let normBSquared = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normASquared += ai * ai;
    normBSquared += bi * bi;
  }

  if (normASquared === 0 || normBSquared === 0) {
    return 0;
  }

  return dot / Math.sqrt(normASquared * normBSquared);
}

export interface ScoredId {
  readonly id: string;
  readonly score: number;
}

export function cosineTopK(
  query: Float32Array,
  vectors: ReadonlyArray<{ id: string; v: Float32Array }>,
  k: number,
): ScoredId[] {
  const limit = Math.max(0, Math.min(vectors.length, Math.trunc(k)));
  if (limit === 0 || vectors.length === 0) {
    return [];
  }

  return vectors
    .map((entry, index) => ({
      id: entry.id,
      score: cosine(query, entry.v),
      index,
    }))
    .sort((left, right) => {
      const byScore = right.score - left.score;
      return byScore !== 0 ? byScore : left.index - right.index;
    })
    .slice(0, limit)
    .map(({ id, score }) => ({ id, score }));
}
