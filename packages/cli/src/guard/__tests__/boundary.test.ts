import { describe, expect, it } from 'vitest';
import type { GuardedArtifact } from '../types.js';
import { BoundaryViolationError, enforceBoundary } from '../boundary.js';

function makeArtifact(
  overrides: Partial<GuardedArtifact> = {},
): GuardedArtifact {
  return {
    path: 'artifact.md',
    origin: 'external',
    channel: 'data',
    trust: 'unsigned',
    digest: 'deadbeef',
    ...overrides,
  };
}

describe('guard/boundary', () => {
  it('data_channel_cannot_execute_hook', () => {
    const artifact = makeArtifact({ channel: 'data', trust: 'unsigned' });

    expect(() => enforceBoundary(artifact, 'execute-hook')).toThrow(
      BoundaryViolationError,
    );
    expect(() => enforceBoundary(artifact, 'execute-hook')).toThrow(
      'data-channel artifact cannot execute-hook',
    );
  });

  it('unsigned_control_cannot_execute_hook', () => {
    const artifact = makeArtifact({ channel: 'control', trust: 'unsigned' });

    expect(() => enforceBoundary(artifact, 'execute-hook')).toThrow(
      BoundaryViolationError,
    );
  });

  it('signed_control_executes', () => {
    const artifact = makeArtifact({ channel: 'control', trust: 'signed' });

    expect(() => enforceBoundary(artifact, 'execute-hook')).not.toThrow();
  });

  it('data_channel_read_allowed', () => {
    const artifact = makeArtifact({ channel: 'data', trust: 'unsigned' });

    expect(() => enforceBoundary(artifact, 'read')).not.toThrow();
  });

  it('data_cannot_reorder_gate', () => {
    const artifact = makeArtifact({ channel: 'data', trust: 'unsigned' });

    expect(() => enforceBoundary(artifact, 'reorder-gate')).toThrow(
      BoundaryViolationError,
    );
    expect(() => enforceBoundary(artifact, 'reorder-gate')).toThrow(
      'data-channel artifact cannot reorder-gate',
    );
  });
});
