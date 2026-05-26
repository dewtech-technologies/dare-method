/**
 * Tests for lib/rate-limit.ts — sliding window rate limiter.
 *
 * @module tests/rate-limit.spec
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, resetRateLimit, getRequestCount } from '../lib/rate-limit.js';

describe('checkRateLimit — basic behaviour', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it('allows a single request under the limit', () => {
    expect(checkRateLimit('key1', 5, 60_000)).toBe(true);
  });

  it('allows exactly `limit` requests', () => {
    const key = 'key-exact';
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000)).toBe(true);
    }
  });

  it('blocks the request after limit is reached', () => {
    const key = 'key-block';
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, 3, 60_000);
    }
    expect(checkRateLimit(key, 3, 60_000)).toBe(false);
  });

  it('returns true for different keys independently', () => {
    const keyA = 'key-a';
    const keyB = 'key-b';

    for (let i = 0; i < 2; i++) {
      checkRateLimit(keyA, 2, 60_000);
    }
    // keyA is exhausted but keyB should still pass
    expect(checkRateLimit(keyA, 2, 60_000)).toBe(false);
    expect(checkRateLimit(keyB, 2, 60_000)).toBe(true);
  });

  it('respects the window — allows new requests after old ones expire', async () => {
    const key = 'key-expire';
    const windowMs = 5; // 5ms window — very short for testing

    for (let i = 0; i < 2; i++) {
      checkRateLimit(key, 2, windowMs);
    }
    // Should be blocked now
    expect(checkRateLimit(key, 2, windowMs)).toBe(false);

    // Wait for the window to expire
    await new Promise((r) => setTimeout(r, windowMs + 5));

    // Should be allowed again
    expect(checkRateLimit(key, 2, windowMs)).toBe(true);
  });

  it('uses a limit of 1 correctly', () => {
    const key = 'key-limit-1';
    expect(checkRateLimit(key, 1, 60_000)).toBe(true);
    expect(checkRateLimit(key, 1, 60_000)).toBe(false);
  });

  it('continues to block after limit exceeded (consecutive calls)', () => {
    const key = 'key-cont-block';
    for (let i = 0; i < 2; i++) {
      checkRateLimit(key, 2, 60_000);
    }
    expect(checkRateLimit(key, 2, 60_000)).toBe(false);
    expect(checkRateLimit(key, 2, 60_000)).toBe(false);
    expect(checkRateLimit(key, 2, 60_000)).toBe(false);
  });
});

describe('resetRateLimit', () => {
  it('resets a specific key', () => {
    const key = 'reset-key';
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, 3, 60_000);
    }
    expect(checkRateLimit(key, 3, 60_000)).toBe(false);

    resetRateLimit(key);
    expect(checkRateLimit(key, 3, 60_000)).toBe(true);
  });

  it('resets all keys when called without argument', () => {
    const keyA = 'clear-a';
    const keyB = 'clear-b';
    for (let i = 0; i < 2; i++) {
      checkRateLimit(keyA, 2, 60_000);
      checkRateLimit(keyB, 2, 60_000);
    }
    expect(checkRateLimit(keyA, 2, 60_000)).toBe(false);
    expect(checkRateLimit(keyB, 2, 60_000)).toBe(false);

    resetRateLimit();
    expect(checkRateLimit(keyA, 2, 60_000)).toBe(true);
    expect(checkRateLimit(keyB, 2, 60_000)).toBe(true);
  });

  it('resetting a non-existent key is a no-op', () => {
    expect(() => resetRateLimit('nonexistent-key')).not.toThrow();
  });
});

describe('getRequestCount', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it('returns 0 for unknown key', () => {
    expect(getRequestCount('unknown-key', 60_000)).toBe(0);
  });

  it('counts requests within the window', () => {
    const key = 'count-key';
    checkRateLimit(key, 10, 60_000);
    checkRateLimit(key, 10, 60_000);
    expect(getRequestCount(key, 60_000)).toBe(2);
  });

  it('does not count expired requests', async () => {
    const key = 'count-expire';
    const windowMs = 5;
    checkRateLimit(key, 10, windowMs);
    checkRateLimit(key, 10, windowMs);
    await new Promise((r) => setTimeout(r, windowMs + 5));
    expect(getRequestCount(key, windowMs)).toBe(0);
  });
});

describe('Rate limit — edge cases', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it('handles very large limits', () => {
    const key = 'large-limit';
    for (let i = 0; i < 50; i++) {
      expect(checkRateLimit(key, 1_000_000, 60_000)).toBe(true);
    }
  });

  it('handles zero-length window (all requests in the past)', async () => {
    const key = 'zero-window';
    checkRateLimit(key, 1, 0);
    await new Promise((r) => setTimeout(r, 5));
    // With a 0ms window, all previous requests have expired
    expect(checkRateLimit(key, 1, 0)).toBe(true);
  });

  it('handles many distinct keys without interference', () => {
    for (let i = 0; i < 20; i++) {
      const key = `distinct-key-${i}`;
      expect(checkRateLimit(key, 1, 60_000)).toBe(true);
      expect(checkRateLimit(key, 1, 60_000)).toBe(false);
    }
  });
});
