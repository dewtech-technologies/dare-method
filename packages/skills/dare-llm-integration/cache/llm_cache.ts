/**
 * dare-llm-integration — LLMCache
 * In-memory cache with TTL per key.
 * Key: hash(model + prompt)
 * License: MIT
 */

import type { CacheEntry, CompletionResponse, EmbeddingResponse } from '../types.js';

export class LLMCache {
  private readonly store: Map<string, CacheEntry> = new Map();
  private _hits = 0;
  private _misses = 0;

  /**
   * Retrieve a cache entry. Returns null if missing or expired.
   */
  get(key: string): CacheEntry | null {
    const entry = this.store.get(key);
    if (!entry) {
      this._misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this._misses++;
      return null;
    }

    // Increment hit counter on the entry
    entry.hits++;
    this._hits++;
    return entry;
  }

  /**
   * Store a value with TTL in milliseconds.
   */
  set(key: string, value: CompletionResponse | EmbeddingResponse, ttlMs: number): void {
    const now = Date.now();
    this.store.set(key, {
      value,
      expiresAt: now + ttlMs,
      createdAt: now,
      hits: 0,
    });
  }

  /**
   * Remove a specific key.
   */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Remove all entries.
   */
  clear(): void {
    this.store.clear();
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Number of entries currently stored (including potentially stale).
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Cache hit count since last clear().
   */
  get hits(): number {
    return this._hits;
  }

  /**
   * Cache miss count since last clear().
   */
  get misses(): number {
    return this._misses;
  }

  /**
   * Hit rate as a fraction (0–1). Returns 0 if no requests yet.
   */
  get hitRate(): number {
    const total = this._hits + this._misses;
    return total === 0 ? 0 : this._hits / total;
  }

  /**
   * Remove all expired entries.
   */
  purgeExpired(): number {
    const now = Date.now();
    let purged = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Check if key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }
}
