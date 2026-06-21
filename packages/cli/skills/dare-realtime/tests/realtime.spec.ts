/**
 * dare-realtime — test suite
 * 35+ tests covering schema validator, event registry, reconnect strategy,
 * subscription manager, and metrics.
 * License: MIT
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SchemaValidator } from '../schema_validator.js';
import { EventRegistry } from '../event_registry.js';
import { ReconnectStrategy } from '../reconnect_strategy.js';
import { SubscriptionManager } from '../subscription_manager.js';
import { collectRealtimeMetrics } from '../metrics.js';
import type { EventSchema } from '../types.js';

// ---------------------------------------------------------------------------
// SchemaValidator
// ---------------------------------------------------------------------------

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  it('validates a valid payload', () => {
    const schema: EventSchema = {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['userId', 'email'],
    };
    const result = validator.validate({ userId: '123', email: 'a@b.com' }, schema);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when required field is missing', () => {
    const schema: EventSchema = {
      type: 'object',
      required: ['userId', 'createdAt'],
    };
    const result = validator.validate({ userId: '1' }, schema);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes('createdAt'))).toBe(true);
  });

  it('fails when type is wrong', () => {
    const schema: EventSchema = { type: 'string' };
    const result = validator.validate(42, schema);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('Expected type "string"');
  });

  it('validates nested object', () => {
    const schema: EventSchema = {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          required: ['id'],
        },
      },
      required: ['data'],
    };
    const result = validator.validate({ data: { id: '1' } }, schema);
    expect(result.ok).toBe(true);
  });

  it('fails on nested missing field', () => {
    const schema: EventSchema = {
      type: 'object',
      properties: {
        data: { type: 'object', required: ['id'] },
      },
      required: ['data'],
    };
    const result = validator.validate({ data: {} }, schema);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field.includes('id'))).toBe(true);
  });

  it('validates array of strings', () => {
    const schema: EventSchema = {
      type: 'array',
      items: { type: 'string' },
    };
    const result = validator.validate(['a', 'b', 'c'], schema);
    expect(result.ok).toBe(true);
  });

  it('fails on array with wrong item type', () => {
    const schema: EventSchema = {
      type: 'array',
      items: { type: 'string' },
    };
    const result = validator.validate(['a', 2, 'c'], schema);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field.includes('[1]'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// EventRegistry
// ---------------------------------------------------------------------------

describe('EventRegistry', () => {
  let registry: EventRegistry;

  beforeEach(() => {
    registry = new EventRegistry();
  });

  it('registers and retrieves schema', () => {
    const schema: EventSchema = { type: 'object', required: ['userId'] };
    registry.register('user.created', schema);
    expect(registry.getSchema('user.created')).toEqual(schema);
  });

  it('throws when registering duplicate type', () => {
    const schema: EventSchema = { type: 'object' };
    registry.register('user.created', schema);
    expect(() => registry.register('user.created', schema)).toThrow('already registered');
  });

  it('registerOrUpdate overwrites existing', () => {
    const schema1: EventSchema = { type: 'object', required: ['a'] };
    const schema2: EventSchema = { type: 'object', required: ['b'] };
    registry.register('evt', schema1);
    registry.registerOrUpdate('evt', schema2);
    expect(registry.getSchema('evt')).toEqual(schema2);
  });

  it('returns null for unknown schema', () => {
    expect(registry.getSchema('unknown.type')).toBeNull();
  });

  it('validate returns error for unknown type', () => {
    const result = registry.validate('unknown.type', {});
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('Unknown event type');
  });

  it('validate passes for valid payload', () => {
    registry.register('user.deleted', {
      type: 'object',
      required: ['userId'],
      properties: { userId: { type: 'string' } },
    });
    const result = registry.validate('user.deleted', { userId: '123' });
    expect(result.ok).toBe(true);
  });

  it('validate fails for invalid payload', () => {
    registry.register('order.placed', {
      type: 'object',
      required: ['orderId', 'amount'],
    });
    const result = registry.validate('order.placed', { orderId: '1' }); // missing amount
    expect(result.ok).toBe(false);
  });

  it('listTypes returns all registered types', () => {
    registry.register('a', { type: 'object' });
    registry.register('b', { type: 'string' });
    const types = registry.listTypes();
    expect(types).toContain('a');
    expect(types).toContain('b');
  });

  it('has() returns true for registered type', () => {
    registry.register('x', { type: 'object' });
    expect(registry.has('x')).toBe(true);
  });

  it('has() returns false for unregistered type', () => {
    expect(registry.has('y')).toBe(false);
  });

  it('unregister removes event type', () => {
    registry.register('t', { type: 'object' });
    registry.unregister('t');
    expect(registry.has('t')).toBe(false);
  });

  it('clear removes all types', () => {
    registry.register('a', { type: 'object' });
    registry.register('b', { type: 'object' });
    registry.clear();
    expect(registry.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ReconnectStrategy
// ---------------------------------------------------------------------------

describe('ReconnectStrategy', () => {
  it('first delay is initialDelay (1s default)', () => {
    const strategy = new ReconnectStrategy();
    expect(strategy.getDelay(0)).toBe(1_000);
  });

  it('doubles delay each attempt', () => {
    const strategy = new ReconnectStrategy({ initialDelayMs: 1_000 });
    expect(strategy.getDelay(0)).toBe(1_000);
    expect(strategy.getDelay(1)).toBe(2_000);
    expect(strategy.getDelay(2)).toBe(4_000);
    expect(strategy.getDelay(3)).toBe(8_000);
  });

  it('caps at maxDelay (30s default)', () => {
    const strategy = new ReconnectStrategy();
    expect(strategy.getDelay(10)).toBe(30_000); // 1024s > 30s
  });

  it('respects custom initialDelayMs and maxDelayMs', () => {
    const strategy = new ReconnectStrategy({ initialDelayMs: 500, maxDelayMs: 5_000 });
    expect(strategy.getDelay(0)).toBe(500);
    expect(strategy.getDelay(1)).toBe(1_000);
    expect(strategy.getDelay(5)).toBe(5_000); // 16_000 > 5_000
  });

  it('reset() sets attempt back to 0', () => {
    const strategy = new ReconnectStrategy();
    strategy.nextDelay();
    strategy.nextDelay();
    strategy.reset();
    expect(strategy.attempt).toBe(0);
    expect(strategy.nextDelay()).toBe(1_000);
  });

  it('nextDelay() auto-increments attempt', () => {
    const strategy = new ReconnectStrategy();
    const d0 = strategy.nextDelay();
    const d1 = strategy.nextDelay();
    const d2 = strategy.nextDelay();
    expect(d0).toBe(1_000);
    expect(d1).toBe(2_000);
    expect(d2).toBe(4_000);
  });

  it('getDelay(0) with negative returns same as 0', () => {
    const strategy = new ReconnectStrategy();
    expect(strategy.getDelay(-1)).toBe(strategy.getDelay(0));
  });

  it('exposes initialDelay and maxDelay', () => {
    const strategy = new ReconnectStrategy({ initialDelayMs: 200, maxDelayMs: 10_000 });
    expect(strategy.initialDelay).toBe(200);
    expect(strategy.maxDelay).toBe(10_000);
  });
});

// ---------------------------------------------------------------------------
// SubscriptionManager
// ---------------------------------------------------------------------------

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;

  beforeEach(() => {
    manager = new SubscriptionManager();
  });

  it('subscribe and publish delivers payload', () => {
    const handler = vi.fn();
    manager.subscribe('channel:1', handler);
    manager.publish('channel:1', { type: 'update', data: 'x' });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: 'update', data: 'x' });
  });

  it('unsubscribe function removes specific handler', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const unsub1 = manager.subscribe('ch', h1);
    manager.subscribe('ch', h2);

    unsub1();
    manager.publish('ch', 'payload');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('unsubscribeAll removes all handlers for channel', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    manager.subscribe('ch', h1);
    manager.subscribe('ch', h2);
    manager.unsubscribeAll('ch');
    manager.publish('ch', 'x');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('getActiveChannels returns only channels with active subscriptions', () => {
    manager.subscribe('a', vi.fn());
    manager.subscribe('b', vi.fn());
    expect(manager.getActiveChannels()).toContain('a');
    expect(manager.getActiveChannels()).toContain('b');
  });

  it('channel removed from active after unsubscribeAll', () => {
    manager.subscribe('ch', vi.fn());
    manager.unsubscribeAll('ch');
    expect(manager.getActiveChannels()).not.toContain('ch');
  });

  it('channel removed from active after last unsubscribe', () => {
    const unsub = manager.subscribe('ch', vi.fn());
    unsub();
    expect(manager.getActiveChannels()).not.toContain('ch');
    expect(manager.isEmpty).toBe(true);
  });

  it('zero ghost listeners after unsubscribeAll', () => {
    manager.subscribe('ch', vi.fn());
    manager.subscribe('ch', vi.fn());
    manager.unsubscribeAll('ch');
    expect(manager.countSubscriptions('ch')).toBe(0);
    expect(manager.isEmpty).toBe(true);
  });

  it('multiple channels are independent', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    manager.subscribe('a', h1);
    manager.subscribe('b', h2);
    manager.publish('a', 'msg');
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).not.toHaveBeenCalled();
  });

  it('publish to unknown channel does not throw', () => {
    expect(() => manager.publish('no-subs', 'x')).not.toThrow();
  });

  it('totalSubscriptions counts across channels', () => {
    manager.subscribe('a', vi.fn());
    manager.subscribe('a', vi.fn());
    manager.subscribe('b', vi.fn());
    expect(manager.totalSubscriptions).toBe(3);
  });

  it('clear() removes everything', () => {
    manager.subscribe('a', vi.fn());
    manager.subscribe('b', vi.fn());
    manager.clear();
    expect(manager.isEmpty).toBe(true);
    expect(manager.totalSubscriptions).toBe(0);
  });

  it('handler called with correct type when typed', () => {
    const results: string[] = [];
    manager.subscribe<string>('typed', (payload) => results.push(payload));
    manager.publish<string>('typed', 'hello');
    expect(results).toEqual(['hello']);
  });
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe('collectRealtimeMetrics', () => {
  it('M-01 passes when all events have schemas', () => {
    const results = collectRealtimeMetrics({
      eventTypesWithSchema: 5,
      totalEventTypes: 5,
      authorizedSubscriptions: 3,
      totalSubscriptions: 3,
      ghostListenerCount: 0,
      reconnectConfigured: true,
    });
    expect(results.find((r) => r.id === 'M-01')!.pass).toBe(true);
  });

  it('M-01 fails when event types missing schema', () => {
    const results = collectRealtimeMetrics({
      eventTypesWithSchema: 3,
      totalEventTypes: 5,
      authorizedSubscriptions: 0,
      totalSubscriptions: 0,
      ghostListenerCount: 0,
      reconnectConfigured: true,
    });
    const m01 = results.find((r) => r.id === 'M-01')!;
    expect(m01.pass).toBe(false);
    expect(m01.detail).toContain('2 event type(s) missing schema');
  });

  it('M-02 passes when all subscriptions authorized', () => {
    const results = collectRealtimeMetrics({
      eventTypesWithSchema: 2,
      totalEventTypes: 2,
      authorizedSubscriptions: 4,
      totalSubscriptions: 4,
      ghostListenerCount: 0,
      reconnectConfigured: true,
    });
    expect(results.find((r) => r.id === 'M-02')!.pass).toBe(true);
  });

  it('M-02 fails when unauthorized subscriptions exist', () => {
    const results = collectRealtimeMetrics({
      eventTypesWithSchema: 2,
      totalEventTypes: 2,
      authorizedSubscriptions: 2,
      totalSubscriptions: 4,
      ghostListenerCount: 0,
      reconnectConfigured: true,
    });
    expect(results.find((r) => r.id === 'M-02')!.pass).toBe(false);
  });

  it('M-03 passes when no ghost listeners', () => {
    const results = collectRealtimeMetrics({
      eventTypesWithSchema: 2,
      totalEventTypes: 2,
      authorizedSubscriptions: 1,
      totalSubscriptions: 1,
      ghostListenerCount: 0,
      reconnectConfigured: true,
    });
    expect(results.find((r) => r.id === 'M-03')!.pass).toBe(true);
  });

  it('M-03 fails when ghost listeners present', () => {
    const results = collectRealtimeMetrics({
      eventTypesWithSchema: 2,
      totalEventTypes: 2,
      authorizedSubscriptions: 1,
      totalSubscriptions: 1,
      ghostListenerCount: 3,
      reconnectConfigured: true,
    });
    const m03 = results.find((r) => r.id === 'M-03')!;
    expect(m03.pass).toBe(false);
    expect(m03.detail).toContain('3 ghost listener(s)');
  });

  it('M-04 passes when reconnect configured', () => {
    const results = collectRealtimeMetrics({
      eventTypesWithSchema: 0,
      totalEventTypes: 0,
      authorizedSubscriptions: 0,
      totalSubscriptions: 0,
      ghostListenerCount: 0,
      reconnectConfigured: true,
    });
    expect(results.find((r) => r.id === 'M-04')!.pass).toBe(true);
  });

  it('M-04 fails when reconnect not configured', () => {
    const results = collectRealtimeMetrics({
      eventTypesWithSchema: 0,
      totalEventTypes: 0,
      authorizedSubscriptions: 0,
      totalSubscriptions: 0,
      ghostListenerCount: 0,
      reconnectConfigured: false,
    });
    expect(results.find((r) => r.id === 'M-04')!.pass).toBe(false);
  });

  it('returns exactly 4 metrics', () => {
    const results = collectRealtimeMetrics({
      eventTypesWithSchema: 0,
      totalEventTypes: 0,
      authorizedSubscriptions: 0,
      totalSubscriptions: 0,
      ghostListenerCount: 0,
      reconnectConfigured: true,
    });
    expect(results).toHaveLength(4);
  });
});
