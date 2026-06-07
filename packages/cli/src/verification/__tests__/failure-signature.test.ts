import { describe, it, expect } from 'vitest';
import { failureSignature } from '../decay/signature.js';

describe('failureSignature', () => {
  it('should_be_stable_across_paths_and_lines', () => {
    const a = failureSignature({
      failedAspect: 'test',
      stderr: 'Error at /home/user/proj/src/foo.ts:42:10 TypeError',
    });
    const b = failureSignature({
      failedAspect: 'test',
      stderr: 'Error at C:\\Users\\proj\\src\\foo.ts:99:10 TypeError',
    });
    expect(a).toBe(b);
  });

  it('should_differ_for_different_errors', () => {
    const a = failureSignature({
      failedAspect: 'test',
      stderr: 'TypeError: boom',
    });
    const b = failureSignature({
      failedAspect: 'test',
      stderr: 'AssertionError: expected 1',
    });
    expect(a).not.toBe(b);
  });

  it('should_be_8_hex', () => {
    const sig = failureSignature({
      failedAspect: 'mutation',
      stderr: 'failed',
    });
    expect(sig).toMatch(/^[0-9a-f]{8}$/);
  });

  it('should_factor_in_aspect', () => {
    const stderr = 'same error message';
    const a = failureSignature({ failedAspect: 'test', stderr });
    const b = failureSignature({ failedAspect: 'lint', stderr });
    expect(a).not.toBe(b);
  });
});
