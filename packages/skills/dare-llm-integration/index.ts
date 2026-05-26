/**
 * dare-llm-integration — public API
 * License: MIT
 */

// Types
export type {
  CompletionRequest,
  CompletionResponse,
  EmbedRequest,
  EmbeddingResponse,
  LLMProvider,
  PromptTemplate,
  CacheEntry,
  RateLimiterConfig,
  OutputValidationResult,
  OutputValidationError,
  MetricResult,
  LLMUsageStats,
} from './types.js';

// Providers
export { OpenAIProvider } from './providers/openai_provider.js';
export type { OpenAIProviderConfig } from './providers/openai_provider.js';

export { AnthropicProvider } from './providers/anthropic_provider.js';
export type { AnthropicProviderConfig } from './providers/anthropic_provider.js';

export { DummyProvider } from './providers/dummy_provider.js';
export type { DummyProviderConfig } from './providers/dummy_provider.js';

// Cache
export { LLMCache } from './cache/llm_cache.js';

// Rate limit
export { TokenBucket } from './rate_limit/token_bucket.js';
export type { TokenBucketConfig } from './rate_limit/token_bucket.js';

// Prompts
export { PromptLoader } from './prompts/prompt_loader.js';
export type { PromptLoaderConfig } from './prompts/prompt_loader.js';

// Validators
export { OutputValidator } from './validators/output_validator.js';
export type { JsonSchema } from './validators/output_validator.js';

// Metrics
export { collectLLMIntegrationMetrics } from './metrics.js';
export type { LLMIntegrationMetricsInput } from './metrics.js';
