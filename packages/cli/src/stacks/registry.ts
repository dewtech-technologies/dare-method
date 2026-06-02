// SPDX-License-Identifier: MIT
/**
 * Stack registry. Singleton in this module.
 *
 * Each entry uses lazy import — the scaffolder module is only loaded when
 * the user actually picks that stack. Keeps `dare --help` cold start fast
 * regardless of how many stacks exist.
 */
import type {
  StackId,
  StackRegistryEntry,
  StackScaffold,
} from './types.js';

// Entries are populated as scaffolders land:
//   T-012 → ruby-rails-8 ✓
//   T-030..T-035 → backend stacks
//   T-040..T-043 → mcp stacks
const ENTRIES: ReadonlyArray<StackRegistryEntry> = [
  {
    id: 'ruby-rails-8',
    label: '💎 Ruby / Rails 8',
    category: 'backend',
    status: 'stable',
    load: async () =>
      (await import('./ruby-rails-8/scaffold.js')).ruby_rails_8,
  },
];

export const STACK_REGISTRY: ReadonlyMap<StackId, StackRegistryEntry> = new Map(
  ENTRIES.map((e) => [e.id, e] as const),
);

// In-flight / resolved scaffolder promises. Memoized so concurrent `resolve()`
// for the same id returns the same instance.
const cache = new Map<StackId, Promise<StackScaffold>>();

export class UnknownStackError extends Error {
  public readonly stackId: string;
  public readonly availableIds: ReadonlyArray<StackId>;

  constructor(stackId: string, availableIds: ReadonlyArray<StackId>) {
    const sorted = [...availableIds].sort();
    super(
      `Unknown stack '${stackId}'. Available: ${sorted.join(', ') || '<none>'}`,
    );
    this.name = 'UnknownStackError';
    this.stackId = stackId;
    this.availableIds = sorted;
  }
}

export class ScaffoldLoadError extends Error {
  public readonly stackId: StackId;
  public readonly cause: unknown;

  constructor(stackId: StackId, cause: unknown) {
    super(`Failed to load scaffolder for '${stackId}'`);
    this.name = 'ScaffoldLoadError';
    this.stackId = stackId;
    this.cause = cause;
  }
}

/**
 * Resolves a stack by id with lazy import.
 * Throws `UnknownStackError` on invalid id, `ScaffoldLoadError` on load failure.
 * Idempotent under concurrency — same id returns the same Promise.
 */
export async function resolve(id: string): Promise<StackScaffold> {
  if (!has(id)) {
    throw new UnknownStackError(id, [...STACK_REGISTRY.keys()]);
  }
  let promise = cache.get(id);
  if (!promise) {
    const entry = STACK_REGISTRY.get(id);
    if (!entry) {
      // Defensive: `has()` returned true so this can only happen if STACK_REGISTRY
      // mutated mid-call (it shouldn't — ReadonlyMap).
      throw new UnknownStackError(id, [...STACK_REGISTRY.keys()]);
    }
    promise = entry.load().catch((cause) => {
      // Invalidate so a retry can pick up a fix in dev mode.
      cache.delete(id);
      throw new ScaffoldLoadError(id, cause);
    });
    cache.set(id, promise);
  }
  return promise;
}

/**
 * All registered stacks. Order: category asc, then id asc. Deterministic.
 */
export function list(): ReadonlyArray<StackRegistryEntry> {
  return [...STACK_REGISTRY.values()].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.id.localeCompare(b.id);
  });
}

/**
 * Sync check — does NOT trigger lazy import. Used by flag validators.
 */
export function has(id: string): id is StackId {
  return STACK_REGISTRY.has(id as StackId);
}

/**
 * Internal helper for tests. Resets the lazy-import cache.
 */
export function _resetCacheForTesting(): void {
  cache.clear();
}
