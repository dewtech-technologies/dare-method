/**
 * dare-llm-integration — Metrics collector
 * Evaluates M-01 to M-04 for the dare-llm-integration skill.
 * License: MIT
 */

import type { MetricResult } from './types.js';
import type { LLMCache } from './cache/llm_cache.js';
import type { TokenBucket } from './rate_limit/token_bucket.js';

export interface LLMIntegrationMetricsInput {
  /** M-01: total LLM calls made through LLMProvider */
  totalCallsViaProvider: number;
  /** M-01: total LLM calls made directly (bypassing LLMProvider) */
  totalDirectCalls: number;
  /** M-02: cache instance used (null = cache not configured) */
  cache: LLMCache | null;
  /** M-03: rate limiter instance used (null = not configured) */
  rateLimiter: TokenBucket | null;
  /** M-04: count of responses that went through output validation */
  validatedResponseCount: number;
  /** M-04: count of responses that did NOT go through output validation */
  unvalidatedResponseCount: number;
}

export function collectLLMIntegrationMetrics(input: LLMIntegrationMetricsInput): MetricResult[] {
  return [
    checkM01(input),
    checkM02(input),
    checkM03(input),
    checkM04(input),
  ];
}

/**
 * M-01: 100% of LLM calls come via LLMProvider injected (no direct SDK calls).
 */
function checkM01(input: LLMIntegrationMetricsInput): MetricResult {
  const total = input.totalCallsViaProvider + input.totalDirectCalls;
  const pass = total > 0
    ? input.totalDirectCalls === 0
    : true; // if no calls at all, trivially pass

  return {
    id: 'M-01',
    pass,
    description: '100% of LLM calls via LLMProvider (no direct SDK calls)',
    detail: total === 0
      ? 'No LLM calls recorded'
      : pass
        ? `${input.totalCallsViaProvider}/${total} calls via provider`
        : `${input.totalDirectCalls} direct call(s) detected — use LLMProvider`,
  };
}

/**
 * M-02: Cache is configured and has at least one hit (or is set up for caching).
 */
function checkM02(input: LLMIntegrationMetricsInput): MetricResult {
  const pass = input.cache !== null;

  return {
    id: 'M-02',
    pass,
    description: '100% of LLM responses are cached (cache configured)',
    detail: pass
      ? `Cache configured — hit rate: ${(input.cache!.hitRate * 100).toFixed(1)}% (${input.cache!.hits} hits / ${input.cache!.hits + input.cache!.misses} total)`
      : 'No cache instance provided — configure LLMCache to reduce costs',
  };
}

/**
 * M-03: Rate limiter is configured.
 */
function checkM03(input: LLMIntegrationMetricsInput): MetricResult {
  const pass = input.rateLimiter !== null;

  return {
    id: 'M-03',
    pass,
    description: '100% of LLM requests have rate limit configured',
    detail: pass
      ? `Rate limiter configured at ${input.rateLimiter!.requestsPerSecond} req/sec`
      : 'No rate limiter provided — configure TokenBucket to prevent 429s',
  };
}

/**
 * M-04: 100% of LLM responses are validated against schema.
 */
function checkM04(input: LLMIntegrationMetricsInput): MetricResult {
  const total = input.validatedResponseCount + input.unvalidatedResponseCount;
  const pass = total > 0
    ? input.unvalidatedResponseCount === 0
    : true;

  return {
    id: 'M-04',
    pass,
    description: '100% of LLM responses validated against schema before use',
    detail: total === 0
      ? 'No responses recorded'
      : pass
        ? `All ${input.validatedResponseCount} response(s) validated`
        : `${input.unvalidatedResponseCount} response(s) used without validation`,
  };
}
