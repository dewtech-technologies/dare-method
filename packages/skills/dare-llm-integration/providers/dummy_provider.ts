/**
 * dare-llm-integration — DummyProvider
 * Returns configurable responses without any network call.
 * Use in tests and offline development.
 * License: MIT
 */

import type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  EmbedRequest,
  EmbeddingResponse,
} from '../types.js';

export interface DummyProviderConfig {
  /** Fixed text to return from complete(). Default: "dummy response" */
  completionText?: string;
  /** Fixed embedding vector. Default: [0.1, 0.2, 0.3] */
  embedding?: number[];
  /** Simulated latency in ms. Default: 0 */
  latencyMs?: number;
  /** If set, complete() will throw this error */
  throwError?: Error;
  /** Token counts to report */
  tokenCounts?: { input: number; output: number };
  /** Called every time complete() is invoked (for spy assertions) */
  onComplete?: (request: CompletionRequest) => void;
  /** Called every time embed() is invoked */
  onEmbed?: (request: EmbedRequest) => void;
}

export class DummyProvider implements LLMProvider {
  private readonly completionText: string;
  private readonly embedding: number[];
  private readonly latencyMs: number;
  private readonly throwError: Error | null;
  private readonly tokenCounts: { input: number; output: number };
  private readonly onComplete: ((req: CompletionRequest) => void) | null;
  private readonly onEmbed: ((req: EmbedRequest) => void) | null;

  /** Tracks all requests received (useful for assertions) */
  public readonly completionHistory: CompletionRequest[] = [];
  public readonly embedHistory: EmbedRequest[] = [];

  constructor(config: DummyProviderConfig = {}) {
    this.completionText = config.completionText ?? 'dummy response';
    this.embedding = config.embedding ?? [0.1, 0.2, 0.3];
    this.latencyMs = config.latencyMs ?? 0;
    this.throwError = config.throwError ?? null;
    this.tokenCounts = config.tokenCounts ?? { input: 10, output: 20 };
    this.onComplete = config.onComplete ?? null;
    this.onEmbed = config.onEmbed ?? null;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.completionHistory.push(request);

    if (this.onComplete) {
      this.onComplete(request);
    }

    if (this.latencyMs > 0) {
      await delay(this.latencyMs);
    }

    if (this.throwError) {
      throw this.throwError;
    }

    return {
      text: this.completionText,
      tokensUsed: {
        input: this.tokenCounts.input,
        output: this.tokenCounts.output,
        total: this.tokenCounts.input + this.tokenCounts.output,
      },
      cached: false,
      model: request.model,
      latencyMs: this.latencyMs,
    };
  }

  async embed(request: EmbedRequest): Promise<EmbeddingResponse> {
    this.embedHistory.push(request);

    if (this.onEmbed) {
      this.onEmbed(request);
    }

    if (this.latencyMs > 0) {
      await delay(this.latencyMs);
    }

    if (this.throwError) {
      throw this.throwError;
    }

    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const embeddings = inputs.map(() => [...this.embedding]);

    return {
      embeddings,
      tokensUsed: inputs.length * 5,
      model: request.model,
      cached: false,
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
