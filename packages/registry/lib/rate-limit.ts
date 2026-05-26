/**
 * Simple in-memory rate limiter using a sliding window approach.
 *
 * Each call to `checkRateLimit` records the current timestamp for a given key.
 * Requests within the window are counted and compared against the limit.
 *
 * NOTE: In-memory only — state is reset on cold starts. Suitable for
 * Vercel Serverless Functions with relatively low traffic.
 *
 * @module lib/rate-limit
 */

// Map from key → array of timestamps (epoch ms) for recent requests.
const store = new Map<string, number[]>();

/**
 * Checks whether a request for `key` is within the allowed rate limit.
 *
 * @param key      - Identifies the caller (e.g. IP address or token hash).
 * @param limit    - Maximum number of requests allowed in `windowMs`.
 * @param windowMs - Sliding window size in milliseconds.
 * @returns `true` if the request is allowed; `false` if rate-limited.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Retrieve existing timestamps, prune those outside the window.
  const timestamps = (store.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    // Store back (pruned) without adding new timestamp.
    store.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return true;
}

/**
 * Resets the rate limit state for a given key.
 * Useful for testing.
 */
export function resetRateLimit(key?: string): void {
  if (key === undefined) {
    store.clear();
  } else {
    store.delete(key);
  }
}

/**
 * Returns the number of requests recorded for `key` within `windowMs`.
 */
export function getRequestCount(key: string, windowMs: number): number {
  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (store.get(key) ?? []).filter((t) => t > cutoff);
  return timestamps.length;
}
