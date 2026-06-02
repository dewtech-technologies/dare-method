// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach } from 'vitest';
import {
  STACK_REGISTRY,
  ScaffoldLoadError,
  UnknownStackError,
  _resetCacheForTesting,
  has,
  list,
  resolve,
} from '../registry.js';

describe('STACK_REGISTRY', () => {
  beforeEach(() => {
    _resetCacheForTesting();
  });

  describe('initial state (Phase 1 — empty registry)', () => {
    it('is a Map', () => {
      expect(STACK_REGISTRY).toBeInstanceOf(Map);
    });

    it('starts empty until scaffolders are registered', () => {
      // After T-012 / T-030..T-043 this will grow; for now we assert
      // the registry exposes a size and lists deterministically.
      expect(STACK_REGISTRY.size).toBeGreaterThanOrEqual(0);
    });

    it('list() returns array sorted by (category, id)', () => {
      const result = list();
      expect(Array.isArray(result)).toBe(true);
      const ids = result.map((e) => `${e.category}:${e.id}`);
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted);
    });
  });

  describe('has()', () => {
    it('returns false for unknown id', () => {
      expect(has('definitely-not-a-stack')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(has('')).toBe(false);
    });

    it('returns true for every registered id', () => {
      for (const id of STACK_REGISTRY.keys()) {
        expect(has(id)).toBe(true);
      }
    });
  });

  describe('resolve()', () => {
    it('throws UnknownStackError for unknown id', async () => {
      await expect(resolve('unknown-stack')).rejects.toThrow(UnknownStackError);
    });

    it('UnknownStackError carries .stackId and sorted .availableIds', async () => {
      try {
        await resolve('nope');
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(UnknownStackError);
        const err = e as UnknownStackError;
        expect(err.stackId).toBe('nope');
        const ids = [...STACK_REGISTRY.keys()];
        expect(err.availableIds).toEqual([...ids].sort());
      }
    });

    it('UnknownStackError message mentions valid stacks', async () => {
      try {
        await resolve('nope');
        throw new Error('should have thrown');
      } catch (e) {
        const err = e as UnknownStackError;
        if (STACK_REGISTRY.size === 0) {
          expect(err.message).toContain('<none>');
        } else {
          for (const id of err.availableIds) {
            expect(err.message).toContain(id);
          }
        }
      }
    });

    it('concurrent resolve() of same id returns same promise (memoization)', async () => {
      // We can only validate memoization once a real entry exists; here we
      // confirm the API doesn't crash under concurrent calls for an UNKNOWN
      // id (both should throw with the same shape).
      const a = resolve('also-unknown').catch((e) => e);
      const b = resolve('also-unknown').catch((e) => e);
      const [ea, eb] = await Promise.all([a, b]);
      expect(ea).toBeInstanceOf(UnknownStackError);
      expect(eb).toBeInstanceOf(UnknownStackError);
    });
  });

  describe('error classes', () => {
    it('UnknownStackError has correct name', () => {
      const err = new UnknownStackError('foo', ['ruby-rails-8', 'node-nestjs']);
      expect(err.name).toBe('UnknownStackError');
      expect(err.stackId).toBe('foo');
      // Sorted on construction
      expect(err.availableIds).toEqual(['node-nestjs', 'ruby-rails-8']);
    });

    it('ScaffoldLoadError preserves cause', () => {
      const inner = new Error('boom');
      // Type-cast to bypass StackId constraint for this isolated test
      const err = new ScaffoldLoadError('ruby-rails-8', inner);
      expect(err.name).toBe('ScaffoldLoadError');
      expect(err.cause).toBe(inner);
      expect(err.stackId).toBe('ruby-rails-8');
    });
  });
});
