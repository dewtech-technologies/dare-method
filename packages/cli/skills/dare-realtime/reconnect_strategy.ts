/**
 * dare-realtime — ReconnectStrategy
 * Exponential backoff for WebSocket / SSE reconnection.
 *
 * Delays: attempt 0=1s, 1=2s, 2=4s, 3=8s, … capped at maxDelay (30s).
 * License: MIT
 */

export interface ReconnectStrategyConfig {
  /** Initial delay in milliseconds. Default: 1000 (1s). */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds. Default: 30000 (30s). */
  maxDelayMs?: number;
  /** Jitter factor (0–1) to randomize delay and avoid thundering herd. Default: 0 (no jitter). */
  jitter?: number;
}

export class ReconnectStrategy {
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitter: number;
  private _attempt: number = 0;

  constructor(config: ReconnectStrategyConfig = {}) {
    this.initialDelayMs = config.initialDelayMs ?? 1_000;
    this.maxDelayMs = config.maxDelayMs ?? 30_000;
    this.jitter = Math.min(1, Math.max(0, config.jitter ?? 0));
  }

  /**
   * Get the delay in milliseconds for a given attempt number.
   * Follows exponential backoff: initialDelay * 2^attempt, capped at maxDelay.
   *
   * @param attempt - Zero-based attempt count (0 = first reconnect)
   */
  getDelay(attempt: number): number {
    if (attempt < 0) attempt = 0;
    const base = this.initialDelayMs * Math.pow(2, attempt);
    const capped = Math.min(base, this.maxDelayMs);

    if (this.jitter > 0) {
      const jitterAmount = capped * this.jitter * Math.random();
      return Math.round(capped + jitterAmount);
    }

    return capped;
  }

  /**
   * Get the delay for the next attempt (auto-incrementing internal counter).
   */
  nextDelay(): number {
    const delay = this.getDelay(this._attempt);
    this._attempt++;
    return delay;
  }

  /**
   * Reset the attempt counter back to 0 (call after a successful connection).
   */
  reset(): void {
    this._attempt = 0;
  }

  /**
   * Current attempt count.
   */
  get attempt(): number {
    return this._attempt;
  }

  /**
   * Configured initial delay in milliseconds.
   */
  get initialDelay(): number {
    return this.initialDelayMs;
  }

  /**
   * Configured maximum delay in milliseconds.
   */
  get maxDelay(): number {
    return this.maxDelayMs;
  }
}
