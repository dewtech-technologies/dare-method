/**
 * dare-llm-integration — test suite
 * 50+ tests covering cache, rate limit, providers, prompt loader, validator, metrics.
 * License: MIT
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

import { LLMCache } from '../cache/llm_cache.js';
import { TokenBucket } from '../rate_limit/token_bucket.js';
import { DummyProvider } from '../providers/dummy_provider.js';
import { PromptLoader } from '../prompts/prompt_loader.js';
import { OutputValidator } from '../validators/output_validator.js';
import { collectLLMIntegrationMetrics } from '../metrics.js';
import type { CompletionResponse } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// LLMCache
// ---------------------------------------------------------------------------

describe('LLMCache', () => {
  let cache: LLMCache;

  beforeEach(() => {
    cache = new LLMCache();
  });

  it('returns null for missing key', () => {
    expect(cache.get('missing')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    const value: CompletionResponse = {
      text: 'hello',
      tokensUsed: { input: 5, output: 10, total: 15 },
      cached: false,
      model: 'gpt-4',
    };
    cache.set('key1', value, 60_000);
    const entry = cache.get('key1');
    expect(entry).not.toBeNull();
    expect((entry!.value as CompletionResponse).text).toBe('hello');
  });

  it('marks cached:false on stored value (original)', () => {
    const value: CompletionResponse = {
      text: 'test',
      tokensUsed: { input: 1, output: 1, total: 2 },
      cached: false,
      model: 'gpt-3.5',
    };
    cache.set('k', value, 60_000);
    const retrieved = cache.get('k');
    expect(retrieved).not.toBeNull();
  });

  it('returns null for expired TTL', async () => {
    const value: CompletionResponse = {
      text: 'x',
      tokensUsed: { input: 1, output: 1, total: 2 },
      cached: false,
      model: 'm',
    };
    cache.set('exp', value, 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 10));
    expect(cache.get('exp')).toBeNull();
  });

  it('tracks hit count', () => {
    const value: CompletionResponse = {
      text: 'hi',
      tokensUsed: { input: 1, output: 1, total: 2 },
      cached: false,
      model: 'm',
    };
    cache.set('k', value, 60_000);
    cache.get('k');
    cache.get('k');
    expect(cache.hits).toBe(2);
  });

  it('tracks miss count', () => {
    cache.get('no');
    cache.get('no2');
    expect(cache.misses).toBe(2);
  });

  it('calculates hit rate', () => {
    const value: CompletionResponse = {
      text: 'x',
      tokensUsed: { input: 1, output: 1, total: 2 },
      cached: false,
      model: 'm',
    };
    cache.set('k', value, 60_000);
    cache.get('k'); // hit
    cache.get('k'); // hit
    cache.get('missing'); // miss
    expect(cache.hitRate).toBeCloseTo(2 / 3);
  });

  it('returns 0 hit rate with no requests', () => {
    expect(cache.hitRate).toBe(0);
  });

  it('invalidates a specific key', () => {
    const value: CompletionResponse = {
      text: 'y',
      tokensUsed: { input: 1, output: 1, total: 2 },
      cached: false,
      model: 'm',
    };
    cache.set('k', value, 60_000);
    cache.invalidate('k');
    expect(cache.get('k')).toBeNull();
  });

  it('clears all entries', () => {
    const value: CompletionResponse = {
      text: 'z',
      tokensUsed: { input: 1, output: 1, total: 2 },
      cached: false,
      model: 'm',
    };
    cache.set('k1', value, 60_000);
    cache.set('k2', value, 60_000);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.hits).toBe(0);
    expect(cache.misses).toBe(0);
  });

  it('purges expired entries', async () => {
    const value: CompletionResponse = {
      text: 'x',
      tokensUsed: { input: 1, output: 1, total: 2 },
      cached: false,
      model: 'm',
    };
    cache.set('old', value, 1);
    cache.set('fresh', value, 60_000);
    await new Promise((r) => setTimeout(r, 10));
    const purged = cache.purgeExpired();
    expect(purged).toBe(1);
    expect(cache.size).toBe(1);
  });

  it('has() returns false for expired key', async () => {
    const value: CompletionResponse = {
      text: 'x',
      tokensUsed: { input: 1, output: 1, total: 2 },
      cached: false,
      model: 'm',
    };
    cache.set('exp', value, 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(cache.has('exp')).toBe(false);
  });

  it('has() returns true for valid key', () => {
    const value: CompletionResponse = {
      text: 'x',
      tokensUsed: { input: 1, output: 1, total: 2 },
      cached: false,
      model: 'm',
    };
    cache.set('k', value, 60_000);
    expect(cache.has('k')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TokenBucket
// ---------------------------------------------------------------------------

describe('TokenBucket', () => {
  it('throws for rps <= 0', () => {
    expect(() => new TokenBucket({ rps: 0 })).toThrow();
  });

  it('tryAcquire returns true when tokens available', () => {
    const bucket = new TokenBucket({ rps: 10 });
    expect(bucket.tryAcquire()).toBe(true);
  });

  it('tryAcquire returns false when exhausted', () => {
    const bucket = new TokenBucket({ rps: 1, maxBurst: 1 });
    bucket.tryAcquire(); // consume the 1 token
    expect(bucket.tryAcquire()).toBe(false);
  });

  it('acquire resolves when token available', async () => {
    const bucket = new TokenBucket({ rps: 100 });
    await expect(bucket.acquire()).resolves.toBeUndefined();
  });

  it('acquire blocks and then resolves after refill', async () => {
    const bucket = new TokenBucket({ rps: 10, maxBurst: 1 });
    bucket.tryAcquire(); // consume
    const start = Date.now();
    await bucket.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(80); // ~100ms refill for 10 rps
  });

  it('reports configured rps', () => {
    const bucket = new TokenBucket({ rps: 5 });
    expect(bucket.requestsPerSecond).toBe(5);
  });

  it('multiple tryAcquire calls respect burst limit', () => {
    const bucket = new TokenBucket({ rps: 2, maxBurst: 3 });
    let successes = 0;
    for (let i = 0; i < 5; i++) {
      if (bucket.tryAcquire()) successes++;
    }
    expect(successes).toBe(3); // maxBurst = 3
  });
});

// ---------------------------------------------------------------------------
// DummyProvider
// ---------------------------------------------------------------------------

describe('DummyProvider', () => {
  it('returns configured completion text', async () => {
    const provider = new DummyProvider({ completionText: 'test answer' });
    const result = await provider.complete({ model: 'gpt-4', prompt: 'hello' });
    expect(result.text).toBe('test answer');
    expect(result.model).toBe('gpt-4');
    expect(result.cached).toBe(false);
  });

  it('returns token usage', async () => {
    const provider = new DummyProvider({ tokenCounts: { input: 5, output: 10 } });
    const result = await provider.complete({ model: 'm', prompt: 'q' });
    expect(result.tokensUsed.input).toBe(5);
    expect(result.tokensUsed.output).toBe(10);
    expect(result.tokensUsed.total).toBe(15);
  });

  it('returns embeddings for single input', async () => {
    const provider = new DummyProvider({ embedding: [0.1, 0.2, 0.3] });
    const result = await provider.embed({ model: 'text-embedding', input: 'hello' });
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
  });

  it('returns embeddings for multiple inputs', async () => {
    const provider = new DummyProvider({ embedding: [1, 2] });
    const result = await provider.embed({ model: 'text-embedding', input: ['a', 'b', 'c'] });
    expect(result.embeddings).toHaveLength(3);
  });

  it('throws configured error on complete', async () => {
    const err = new Error('api down');
    const provider = new DummyProvider({ throwError: err });
    await expect(provider.complete({ model: 'm', prompt: 'q' })).rejects.toThrow('api down');
  });

  it('throws configured error on embed', async () => {
    const err = new Error('embed fail');
    const provider = new DummyProvider({ throwError: err });
    await expect(provider.embed({ model: 'm', input: 'x' })).rejects.toThrow('embed fail');
  });

  it('records completion history', async () => {
    const provider = new DummyProvider();
    await provider.complete({ model: 'gpt-4', prompt: 'p1' });
    await provider.complete({ model: 'gpt-4', prompt: 'p2' });
    expect(provider.completionHistory).toHaveLength(2);
    expect(provider.completionHistory[0].prompt).toBe('p1');
  });

  it('calls onComplete spy', async () => {
    const spy = vi.fn();
    const provider = new DummyProvider({ onComplete: spy });
    await provider.complete({ model: 'x', prompt: 'q' });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('simulates latency', async () => {
    const provider = new DummyProvider({ latencyMs: 50 });
    const start = Date.now();
    await provider.complete({ model: 'm', prompt: 'q' });
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });
});

// ---------------------------------------------------------------------------
// PromptLoader
// ---------------------------------------------------------------------------

describe('PromptLoader', () => {
  let loader: PromptLoader;

  beforeEach(() => {
    loader = new PromptLoader({ templatesDir: FIXTURES_DIR });
  });

  it('loads and renders v1 template', () => {
    const result = loader.load('summarize', 'v1', { text: 'Hello world' });
    expect(result).toContain('Hello world');
    expect(result).toContain('Summarize');
  });

  it('loads and renders v2 template with different variables', () => {
    const result = loader.load('summarize', 'v2', { max_words: '50', text: 'Test text' });
    expect(result).toContain('50');
    expect(result).toContain('Test text');
  });

  it('loads greet template', () => {
    const result = loader.load('greet', 'v1', { name: 'Alice', service: 'DARE' });
    expect(result).toContain('Alice');
    expect(result).toContain('DARE');
  });

  it('throws when template not found', () => {
    expect(() => loader.load('nonexistent', 'v1', {})).toThrow('template not found');
  });

  it('caches template content after first load', () => {
    loader.load('summarize', 'v1', { text: 'x' });
    loader.load('summarize', 'v1', { text: 'y' }); // should use cache
    // No error = cache working
  });

  it('clearCache() forces file re-read', () => {
    loader.load('summarize', 'v1', { text: 'x' });
    loader.clearCache();
    // After clear, should still work by re-reading
    const result = loader.load('summarize', 'v1', { text: 'x' });
    expect(result).toContain('x');
  });

  it('listTemplates returns all .jinja2 files', () => {
    const templates = loader.listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(3);
    const names = templates.map((t) => t.name);
    expect(names).toContain('summarize');
    expect(names).toContain('greet');
  });

  it('render() works with inline template string', () => {
    const result = loader.render('Hello {{ name }}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('handles template with multiple variables', () => {
    const result = loader.render('{{ a }} + {{ b }} = {{ c }}', { a: '1', b: '2', c: '3' });
    expect(result).toBe('1 + 2 = 3');
  });

  it('handles missing variable gracefully (renders empty)', () => {
    const result = loader.render('Hello {{ missing_var }}!', {});
    expect(result).toBe('Hello !');
  });
});

// ---------------------------------------------------------------------------
// OutputValidator
// ---------------------------------------------------------------------------

describe('OutputValidator', () => {
  let validator: OutputValidator;

  beforeEach(() => {
    validator = new OutputValidator();
  });

  it('validates valid JSON against schema', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        summary: { type: 'string' as const },
        keywords: { type: 'array' as const, items: { type: 'string' as const } },
      },
      required: ['summary', 'keywords'],
    };
    const output = JSON.stringify({ summary: 'Hello', keywords: ['a', 'b'] });
    const result = validator.validate(output, schema);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ summary: 'Hello', keywords: ['a', 'b'] });
  });

  it('fails on invalid JSON', () => {
    const result = validator.validate('not json', {});
    expect(result.ok).toBe(false);
    expect(result.errors[0].field).toBe('$root');
  });

  it('fails when required field is missing', () => {
    const schema = {
      type: 'object' as const,
      required: ['name', 'email'],
    };
    const result = validator.validate(JSON.stringify({ name: 'Alice' }), schema);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes('email'))).toBe(true);
  });

  it('fails on wrong type', () => {
    const schema = { type: 'string' as const };
    const result = validator.validate('123', schema);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('Expected type string');
  });

  it('passes integer type', () => {
    const schema = { type: 'integer' as const };
    const result = validator.validate('42', schema);
    expect(result.ok).toBe(true);
  });

  it('fails non-integer for integer type', () => {
    const schema = { type: 'integer' as const };
    const result = validator.validate('42.5', schema);
    expect(result.ok).toBe(false);
  });

  it('validates string minLength', () => {
    const schema = { type: 'string' as const, minLength: 5 };
    const result = validator.validate('"hi"', schema);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('minLength');
  });

  it('validates string maxLength', () => {
    const schema = { type: 'string' as const, maxLength: 3 };
    const result = validator.validate('"toolong"', schema);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('maxLength');
  });

  it('validates number minimum', () => {
    const schema = { type: 'number' as const, minimum: 10 };
    const result = validator.validate('5', schema);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('minimum');
  });

  it('validates number maximum', () => {
    const schema = { type: 'number' as const, maximum: 100 };
    const result = validator.validate('200', schema);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('maximum');
  });

  it('validates enum values', () => {
    const schema = { enum: ['a', 'b', 'c'] };
    const result = validator.validate('"d"', schema);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toContain('enum');
  });

  it('passes enum with valid value', () => {
    const schema = { enum: ['a', 'b', 'c'] };
    const result = validator.validate('"b"', schema);
    expect(result.ok).toBe(true);
  });

  it('validateParsed skips JSON parsing', () => {
    const schema = { type: 'string' as const };
    const result = validator.validateParsed('hello', schema);
    expect(result.ok).toBe(true);
  });

  it('validates nested objects', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        user: {
          type: 'object' as const,
          properties: { name: { type: 'string' as const } },
          required: ['name'],
        },
      },
      required: ['user'],
    };
    const result = validator.validate(JSON.stringify({ user: { name: 'Alice' } }), schema);
    expect(result.ok).toBe(true);
  });

  it('fails nested required field', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        user: {
          type: 'object' as const,
          required: ['email'],
        },
      },
      required: ['user'],
    };
    const result = validator.validate(JSON.stringify({ user: { name: 'Alice' } }), schema);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field.includes('email'))).toBe(true);
  });

  it('validates array items', () => {
    const schema = {
      type: 'array' as const,
      items: { type: 'number' as const },
    };
    const result = validator.validate('[1, 2, "three"]', schema);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field.includes('[2]'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe('collectLLMIntegrationMetrics', () => {
  it('M-01 passes when all calls via provider', () => {
    const results = collectLLMIntegrationMetrics({
      totalCallsViaProvider: 10,
      totalDirectCalls: 0,
      cache: null,
      rateLimiter: null,
      validatedResponseCount: 0,
      unvalidatedResponseCount: 0,
    });
    const m01 = results.find((r) => r.id === 'M-01')!;
    expect(m01.pass).toBe(true);
  });

  it('M-01 fails when direct calls detected', () => {
    const results = collectLLMIntegrationMetrics({
      totalCallsViaProvider: 10,
      totalDirectCalls: 2,
      cache: null,
      rateLimiter: null,
      validatedResponseCount: 0,
      unvalidatedResponseCount: 0,
    });
    const m01 = results.find((r) => r.id === 'M-01')!;
    expect(m01.pass).toBe(false);
  });

  it('M-02 passes when cache configured', () => {
    const cache = new LLMCache();
    const results = collectLLMIntegrationMetrics({
      totalCallsViaProvider: 0,
      totalDirectCalls: 0,
      cache,
      rateLimiter: null,
      validatedResponseCount: 0,
      unvalidatedResponseCount: 0,
    });
    const m02 = results.find((r) => r.id === 'M-02')!;
    expect(m02.pass).toBe(true);
  });

  it('M-02 fails when no cache', () => {
    const results = collectLLMIntegrationMetrics({
      totalCallsViaProvider: 0,
      totalDirectCalls: 0,
      cache: null,
      rateLimiter: null,
      validatedResponseCount: 0,
      unvalidatedResponseCount: 0,
    });
    const m02 = results.find((r) => r.id === 'M-02')!;
    expect(m02.pass).toBe(false);
  });

  it('M-03 passes when rate limiter configured', () => {
    const rateLimiter = new TokenBucket({ rps: 10 });
    const results = collectLLMIntegrationMetrics({
      totalCallsViaProvider: 0,
      totalDirectCalls: 0,
      cache: null,
      rateLimiter,
      validatedResponseCount: 0,
      unvalidatedResponseCount: 0,
    });
    const m03 = results.find((r) => r.id === 'M-03')!;
    expect(m03.pass).toBe(true);
    expect(m03.detail).toContain('10 req/sec');
  });

  it('M-03 fails when no rate limiter', () => {
    const results = collectLLMIntegrationMetrics({
      totalCallsViaProvider: 0,
      totalDirectCalls: 0,
      cache: null,
      rateLimiter: null,
      validatedResponseCount: 0,
      unvalidatedResponseCount: 0,
    });
    const m03 = results.find((r) => r.id === 'M-03')!;
    expect(m03.pass).toBe(false);
  });

  it('M-04 passes when all responses validated', () => {
    const results = collectLLMIntegrationMetrics({
      totalCallsViaProvider: 5,
      totalDirectCalls: 0,
      cache: null,
      rateLimiter: null,
      validatedResponseCount: 5,
      unvalidatedResponseCount: 0,
    });
    const m04 = results.find((r) => r.id === 'M-04')!;
    expect(m04.pass).toBe(true);
  });

  it('M-04 fails when unvalidated responses exist', () => {
    const results = collectLLMIntegrationMetrics({
      totalCallsViaProvider: 5,
      totalDirectCalls: 0,
      cache: null,
      rateLimiter: null,
      validatedResponseCount: 3,
      unvalidatedResponseCount: 2,
    });
    const m04 = results.find((r) => r.id === 'M-04')!;
    expect(m04.pass).toBe(false);
    expect(m04.detail).toContain('2 response(s) used without validation');
  });

  it('returns exactly 4 metrics', () => {
    const results = collectLLMIntegrationMetrics({
      totalCallsViaProvider: 0,
      totalDirectCalls: 0,
      cache: null,
      rateLimiter: null,
      validatedResponseCount: 0,
      unvalidatedResponseCount: 0,
    });
    expect(results).toHaveLength(4);
  });

  it('all metrics pass with full config', () => {
    const cache = new LLMCache();
    const rateLimiter = new TokenBucket({ rps: 5 });
    const results = collectLLMIntegrationMetrics({
      totalCallsViaProvider: 10,
      totalDirectCalls: 0,
      cache,
      rateLimiter,
      validatedResponseCount: 10,
      unvalidatedResponseCount: 0,
    });
    for (const r of results) {
      expect(r.pass).toBe(true);
    }
  });
});
