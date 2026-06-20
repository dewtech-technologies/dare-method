/**
 * dare-llm-integration — shared types
 * License: MIT
 */

export interface CompletionRequest {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  timeoutMs?: number;
}

export interface CompletionResponse {
  text: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  cached: boolean;
  model: string;
  latencyMs?: number;
}

export interface EmbedRequest {
  model: string;
  input: string | string[];
  timeoutMs?: number;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  tokensUsed: number;
  model: string;
  cached: boolean;
}

export interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  embed(request: EmbedRequest): Promise<EmbeddingResponse>;
}

export interface PromptTemplate {
  name: string;
  version: string;
  content: string;
  variables: string[];
}

export interface CacheEntry {
  value: CompletionResponse | EmbeddingResponse;
  expiresAt: number;
  createdAt: number;
  hits: number;
}

export interface RateLimiterConfig {
  rps: number;
  maxBurst?: number;
}

export interface OutputValidationResult {
  ok: boolean;
  data?: unknown;
  errors: OutputValidationError[];
}

export interface OutputValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface MetricResult {
  id: string;
  pass: boolean;
  description: string;
  detail?: string;
}

export interface LLMUsageStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  rateLimitedRequests: number;
  validatedResponses: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}
