/**
 * dare-llm-integration — OpenAIProvider
 * Real implementation using fetch (no external SDK).
 * License: MIT
 */

import type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  EmbedRequest,
  EmbeddingResponse,
} from '../types.js';
import { LLMCache } from '../cache/llm_cache.js';
import { TokenBucket } from '../rate_limit/token_bucket.js';

export interface OpenAIProviderConfig {
  apiKey: string;
  cache?: LLMCache;
  rateLimiter?: TokenBucket;
  defaultCacheTtlMs?: number;
  defaultTimeoutMs?: number;
  onTokenUsage?: (model: string, input: number, output: number) => void;
}

export class OpenAIProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly cache: LLMCache | null;
  private readonly rateLimiter: TokenBucket | null;
  private readonly defaultCacheTtlMs: number;
  private readonly defaultTimeoutMs: number;
  private readonly onTokenUsage: ((model: string, input: number, output: number) => void) | null;

  constructor(config: OpenAIProviderConfig) {
    this.apiKey = config.apiKey;
    this.cache = config.cache ?? null;
    this.rateLimiter = config.rateLimiter ?? null;
    this.defaultCacheTtlMs = config.defaultCacheTtlMs ?? 24 * 60 * 60 * 1000; // 24h
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000;
    this.onTokenUsage = config.onTokenUsage ?? null;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const cacheKey = this.buildCacheKey('complete', request.model, request.prompt);

    // Check cache
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached.value as CompletionResponse;
      }
    }

    // Rate limit
    if (this.rateLimiter) {
      await this.rateLimiter.acquire();
    }

    const start = Date.now();
    const response = await this.callCompletionAPI(request);
    const latencyMs = Date.now() - start;

    const result: CompletionResponse = {
      ...response,
      cached: false,
      latencyMs,
    };

    // Log token usage
    if (this.onTokenUsage) {
      this.onTokenUsage(request.model, result.tokensUsed.input, result.tokensUsed.output);
    }

    // Store in cache
    if (this.cache) {
      this.cache.set(cacheKey, result, this.defaultCacheTtlMs);
    }

    return result;
  }

  async embed(request: EmbedRequest): Promise<EmbeddingResponse> {
    const inputStr = Array.isArray(request.input) ? request.input.join('|') : request.input;
    const cacheKey = this.buildCacheKey('embed', request.model, inputStr);

    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached.value as EmbeddingResponse;
      }
    }

    if (this.rateLimiter) {
      await this.rateLimiter.acquire();
    }

    const result = await this.callEmbedAPI(request);

    if (this.cache) {
      this.cache.set(cacheKey, result, this.defaultCacheTtlMs);
    }

    return result;
  }

  private buildCacheKey(op: string, model: string, content: string): string {
    // Deterministic hash-like key using a simple digest
    const combined = `${op}:${model}:${content}`;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `llm:${op}:${model}:${Math.abs(hash).toString(16)}`;
  }

  private async callCompletionAPI(request: CompletionRequest): Promise<CompletionResponse> {
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });

    let data: unknown;
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      data = await response.json();
    } finally {
      clearTimeout(timer);
    }

    const d = data as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };

    return {
      text: d.choices[0].message.content,
      tokensUsed: {
        input: d.usage.prompt_tokens,
        output: d.usage.completion_tokens,
        total: d.usage.total_tokens,
      },
      cached: false,
      model: d.model,
    };
  }

  private async callEmbedAPI(request: EmbedRequest): Promise<EmbeddingResponse> {
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let data: unknown;
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          input: request.input,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      data = await response.json();
    } finally {
      clearTimeout(timer);
    }

    const d = data as {
      data: Array<{ embedding: number[] }>;
      usage: { total_tokens: number };
      model: string;
    };

    return {
      embeddings: d.data.map((item) => item.embedding),
      tokensUsed: d.usage.total_tokens,
      model: d.model,
      cached: false,
    };
  }
}
