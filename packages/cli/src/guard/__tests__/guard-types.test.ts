import { describe, it, expect } from 'vitest';
import type {
  GuardVerdict,
  ArtifactOrigin,
  TrustChannel,
  GuardedArtifact,
  GuardFinding,
  GuardResult,
} from '../types.js';

describe('guard/types', () => {
  it('exports_all_symbols', () => {
    const verdict: GuardVerdict = 'PASS';
    const origin: ArtifactOrigin = 'human';
    const channel: TrustChannel = 'control';
    const artifact: GuardedArtifact = {
      path: 'spec.md',
      origin,
      channel,
      trust: 'unsigned',
      digest: 'abc123',
    };
    const finding: GuardFinding = {
      layer: 'scan',
      severity: 'WARN',
      rule: 'test-rule',
      evidence: 'sanitized',
    };
    const result: GuardResult = {
      artifact: artifact.path,
      verdict,
      findings: [finding],
    };
    expect(result.verdict).toBe('PASS');
  });
});
