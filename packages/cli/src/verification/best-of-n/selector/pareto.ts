import type { Aspect, Candidate, VerificationResult } from '../../types.js';

const PARETO_ASPECTS = ['test', 'lint', 'type', 'mutation'] as const;
type ParetoAspect = (typeof PARETO_ASPECTS)[number];

export class NoViableCandidateError extends Error {
  constructor(message = 'no viable candidate: all candidates have a failing aspect') {
    super(message);
    this.name = 'NoViableCandidateError';
  }
}

function hasFailingAspect(result: VerificationResult): boolean {
  return result.aspects.some((a) => a.verdict === 'FAIL');
}

function aspectValue(result: VerificationResult, aspect: ParetoAspect): number {
  if (aspect === 'mutation') {
    const mut = result.aspects.find((a) => a.aspect === 'mutation');
    return result.mutationScore ?? mut?.score ?? 0;
  }
  const row = result.aspects.find((a) => a.aspect === aspect);
  if (!row || row.verdict === 'SKIP') return 0.5;
  if (row.verdict === 'PASS') return 1;
  return 0;
}

function aspectVector(result: VerificationResult): Record<ParetoAspect, number> {
  return {
    test: aspectValue(result, 'test'),
    lint: aspectValue(result, 'lint'),
    type: aspectValue(result, 'type'),
    mutation: aspectValue(result, 'mutation'),
  };
}

function dominates(
  a: Record<ParetoAspect, number>,
  b: Record<ParetoAspect, number>,
): boolean {
  let strictlyBetter = false;
  for (const key of PARETO_ASPECTS) {
    if (a[key] < b[key]) return false;
    if (a[key] > b[key]) strictlyBetter = true;
  }
  return strictlyBetter;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const scoreA = a.verification.mutationScore ?? 0;
  const scoreB = b.verification.mutationScore ?? 0;
  if (scoreB !== scoreA) return scoreB - scoreA;
  return a.id.localeCompare(b.id);
}

/**
 * Pareto-dominant candidate over test/lint/type/mutation aspects.
 * Candidates with any FAIL aspect are discarded first.
 */
export function selectByPareto(candidates: ReadonlyArray<Candidate>): Candidate {
  const viable = candidates.filter((c) => !hasFailingAspect(c.verification));
  if (viable.length === 0) {
    throw new NoViableCandidateError();
  }

  const scored = viable.map((candidate) => ({
    candidate,
    vector: aspectVector(candidate.verification),
  }));

  const nonDominated = scored.filter(
    ({ vector }, index) =>
      !scored.some(
        (other, otherIndex) =>
          index !== otherIndex && dominates(other.vector, vector),
      ),
  );

  const pool =
    nonDominated.length > 0 ? nonDominated.map((s) => s.candidate) : viable;

  return [...pool].sort(compareCandidates)[0];
}
