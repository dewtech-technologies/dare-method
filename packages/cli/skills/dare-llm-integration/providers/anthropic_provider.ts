/**
 * dare-llm-integration — AnthropicProvider
 * Calls Anthropic Messages API using fetch (no external SDK).
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

export interface AnthropicProviderConfig {
  apiKey: string;
  cache?: LLMCache;
  rateLimiter?: TokenBucket;
  defaultCacheTtlMs?: number;
  defaultTimeoutMs?: number;
  anthropicVersion?: string;
  onTokenUsage?: (model: string, input: number, output: number) => void;
}

export class AnthropicProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly cache: LLMCache | null;
  private readonly rateLimiter: TokenBucket | null;
  private readonly defaultCacheTtlMs: number;
  private readonly defaultTimeoutMs: number;
  private readonly anthropicVersion: string;
  private readonly onTokenUsage: ((model: string, input: number, output: number) => void) | null;

  constructor(config: AnthropicProviderConfig) {
    this.apiKey = config.apiKey;
    this.cache = config.cache ?? null;
    this.rateLimiter = config.rateLimiter ?? null;
    this.defaultCacheTtlMs = config.defaultCacheTtlMs ?? 24 * 60 * 60 * 1000;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000;
    this.anthropicVersion = config.anthropicVersion ?? '2023-06-01';
    this.onTokenUsage = config.onTokenUsage ?? null;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const cacheKey = this.buildCacheKey('complete', request.model, request.prompt);

    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached.value as CompletionResponse;
      }
    }

    if (this.rateLimiter) {
      await this.rateLimiter.acquire();
    }

    const start = Date.now();
    const result = await this.callMessagesAPI(request);
    const latencyMs = Date.now() - start;

    const response: CompletionResponse = { ...result, cached: false, latencyMs };

    if (this.onTokenUsage) {
      this.onTokenUsage(request.model, response.tokensUsed.input, response.tokensUsed.output);
    }

    if (this.cache) {
      this.cache.set(cacheKey, response, this.defaultCacheTtlMs);
    }

    return response;
  }

  async embed(_request: EmbedRequest): Promise<EmbeddingResponse> {
    // Anthropic does not provide an embeddings API (as of v1.0).
    // Return empty embeddings to satisfy interface; callers should use OpenAI for embeddings.
    throw new Error(
      'AnthropicProvider: embed() is not supported. Use OpenAIProvider for embeddings.'
    );
  }

  private buildCacheKey(op: string, model: string, content: string): string {
    const combined = `${op}:${model}:${content}`;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `llm:anthropic:${op}:${model}:${Math.abs(hash).toString(16)}`;
  }

  private async callMessagesAPI(request: CompletionRequest): Promise<CompletionResponse> {
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let data: unknown;
    try {
      const body: Record<string, unknown> = {
        model: request.model,
        max_tokens: request.maxTokens ?? 1024,
        messages: [{ role: 'user', content: request.prompt }],
      };

      if (request.systemPrompt) {
        body['system'] = request.systemPrompt;
      }

      if (request.temperature !== undefined) {
        body['temperature'] = request.temperature;
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.anthropicVersion,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
      }

      data = await response.json();
    } finally {
      clearTimeout(timer);
    }

    const d = data as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
      model: string;
    };

    const textContent = d.content.find((c) => c.type === 'text');
    const text = textContent?.text ?? '';
    const inputTokens = d.usage.input_tokens;
    const outputTokens = d.usage.output_tokens;

    return {
      text,
      tokensUsed: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
      cached: false,
      model: d.model,
    };
  }
}
