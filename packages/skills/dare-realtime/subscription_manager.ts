/**
 * dare-realtime — SubscriptionManager
 * Manages subscriptions per channel with guaranteed cleanup (zero ghost listeners).
 * License: MIT
 */

type Handler<T = unknown> = (payload: T) => void;

interface Subscription<T = unknown> {
  handler: Handler<T>;
  id: string;
}

export class SubscriptionManager {
  private readonly channels: Map<string, Subscription[]> = new Map();
  private nextId = 0;

  /**
   * Subscribe to a channel.
   * @returns Unsubscribe function — call it to remove this specific handler.
   */
  subscribe<T = unknown>(channel: string, handler: Handler<T>): () => void {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, []);
    }

    const id = String(this.nextId++);
    const subscription: Subscription<T> = { handler: handler as Handler, id };
    this.channels.get(channel)!.push(subscription as Subscription);

    // Return unsubscribe function
    return () => {
      const subs = this.channels.get(channel);
      if (!subs) return;
      const idx = subs.findIndex((s) => s.id === id);
      if (idx >= 0) {
        subs.splice(idx, 1);
        // Clean up empty channel entry to prevent memory accumulation
        if (subs.length === 0) {
          this.channels.delete(channel);
        }
      }
    };
  }

  /**
   * Remove all handlers for a channel.
   * Guarantees zero ghost listeners after this call.
   */
  unsubscribeAll(channel: string): void {
    this.channels.delete(channel);
  }

  /**
   * Publish a payload to all handlers of a channel.
   */
  publish<T = unknown>(channel: string, payload: T): void {
    const subs = this.channels.get(channel);
    if (!subs || subs.length === 0) return;

    // Iterate over a snapshot to avoid issues if a handler removes itself
    const snapshot = [...subs];
    for (const sub of snapshot) {
      sub.handler(payload);
    }
  }

  /**
   * Get all channels that have at least one active subscription.
   */
  getActiveChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Count active subscriptions for a specific channel.
   */
  countSubscriptions(channel: string): number {
    return this.channels.get(channel)?.length ?? 0;
  }

  /**
   * Total subscriptions across all channels.
   */
  get totalSubscriptions(): number {
    let count = 0;
    for (const subs of this.channels.values()) {
      count += subs.length;
    }
    return count;
  }

  /**
   * True if no active subscriptions exist (no ghost listeners).
   */
  get isEmpty(): boolean {
    return this.channels.size === 0;
  }

  /**
   * Remove all subscriptions across all channels.
   */
  clear(): void {
    this.channels.clear();
  }
}
