import type { GuardedArtifact } from './types.js';

export type BoundaryIntent = 'read' | 'execute-hook' | 'reorder-gate';

export class BoundaryViolationError extends Error {
  readonly code = 'BOUNDARY_VIOLATION' as const;

  constructor(message: string) {
    super(message);
    this.name = 'BoundaryViolationError';
  }
}

/** Dado nao-confiavel nao pode virar controle. */
export function enforceBoundary(
  artifact: GuardedArtifact,
  intent: BoundaryIntent,
): void {
  if (intent === 'read') return;

  const isControlSigned =
    artifact.channel === 'control' && artifact.trust === 'signed';

  if (isControlSigned) return;

  throw new BoundaryViolationError(`data-channel artifact cannot ${intent}`);
}
