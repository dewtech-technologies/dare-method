/**
 * dare-llm-integration — TokenBucket rate limiter
 * Implements a sliding token bucket for controlling request rate.
 * License: MIT
 */

export interface TokenBucketConfig {
  /** Requests per second */
  rps: number;
  /** Maximum burst capacity. Defaults to rps. */
  maxBurst?: number;
}

export class TokenBucket {
  private readonly rps: number;
  private readonly maxBurst: number;
  /** Interval in milliseconds between tokens refilling */
  private readonly refillIntervalMs: number;
  private tokens: number;
  private lastRefillTime: number;

  constructor(config: TokenBucketConfig) {
    if (config.rps <= 0) {
      throw new Error('TokenBucket: rps must be > 0');
    }
    this.rps = config.rps;
    this.maxBurst = config.maxBurst ?? config.rps;
    this.refillIntervalMs = 1000 / config.rps;
    this.tokens = this.maxBurst;
    this.lastRefillTime = Date.now();
  }

  /**
   * Blocking acquire: waits until a token is available, then consumes it.
   */
  async acquire(): Promise<void> {
    while (!this.tryAcquire()) {
      // Calculate wait time until next token
      const now = Date.now();
      const elapsed = now - this.lastRefillTime;
      const waitMs = Math.max(1, this.refillIntervalMs - elapsed);
      await delay(waitMs);
    }
  }

  /**
   * Non-blocking attempt: returns true if a token was consumed, false otherwise.
   */
  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Current available tokens (may be fractional after partial refill).
   */
  get availableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Configured requests per second.
   */
  get requestsPerSecond(): number {
    return this.rps;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    if (elapsed > 0) {
      const newTokens = (elapsed / 1000) * this.rps;
      this.tokens = Math.min(this.tokens + newTokens, this.maxBurst);
      this.lastRefillTime = now;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
