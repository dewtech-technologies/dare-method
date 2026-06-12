import { createHash } from 'node:crypto';

const DEFAULT_RUNTIME_PACKAGE = '@huggingface/transformers';

export interface SemanticConfig {
  readonly model: string;
  readonly modelHash: string;
  readonly runtimePackage?: string;
}

export interface Embedder {
  readonly dim: number;
  embed(text: string): Promise<Float32Array>;
}

export class EmbeddingModelMissingError extends Error {
  readonly code = 'EMBEDDING_MODEL_MISSING' as const;

  constructor(runtimePackage = DEFAULT_RUNTIME_PACKAGE) {
    super(
      `Optional embedding runtime not installed. Run: npm i ${runtimePackage} — or disable graphrag.semantic.`,
    );
    this.name = 'EmbeddingModelMissingError';
  }
}

type RuntimeEmbedderCandidate = {
  readonly dim?: number;
  readonly dimension?: number;
  readonly modelHash?: string;
  readonly sha256?: string;
  embed(text: string): Promise<unknown> | unknown;
};

type RuntimeFactory = (
  cfg: Pick<SemanticConfig, 'model' | 'modelHash'>,
) => Promise<RuntimeEmbedderCandidate> | RuntimeEmbedderCandidate;

type TransformersPipeline = (
  task: 'feature-extraction',
  model: string,
) => Promise<(text: string, opts?: Record<string, unknown>) => Promise<unknown>>;

type EmbeddingRuntimeModule = {
  readonly createEmbedder?: RuntimeFactory;
  readonly loadEmbedder?: RuntimeFactory;
  readonly pipeline?: TransformersPipeline;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readModelHash(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const candidates = [value.modelHash, value.sha256, value.hash];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

function toFloat32Array(value: unknown): Float32Array {
  if (value instanceof Float32Array) {
    return value;
  }
  if (Array.isArray(value)) {
    return new Float32Array(value.map((item) => Number(item)));
  }
  if (isRecord(value)) {
    if (value.data instanceof Float32Array) {
      return value.data;
    }
    if (Array.isArray(value.data)) {
      return new Float32Array(value.data.map((item) => Number(item)));
    }
  }
  throw new Error('Embedding runtime returned an unsupported vector shape.');
}

function assertModelHash(model: string, expectedHash: string, candidates: ReadonlyArray<unknown>): void {
  const discoveredHash = candidates.map(readModelHash).find((hash) => hash !== null);
  const effectiveHash =
    discoveredHash ?? createHash('sha256').update(`model:${model}`).digest('hex');

  if (effectiveHash !== expectedHash) {
    throw new Error(
      `Embedding model hash mismatch for "${model}". Expected ${expectedHash}, got ${effectiveHash}.`,
    );
  }
}

function normalizeEmbedder(candidate: RuntimeEmbedderCandidate): Embedder {
  return {
    get dim(): number {
      const dim = candidate.dim ?? candidate.dimension;
      if (typeof dim !== 'number' || !Number.isFinite(dim) || dim <= 0) {
        throw new Error('Embedding runtime returned an invalid vector dimension.');
      }
      return Math.trunc(dim);
    },
    async embed(text: string): Promise<Float32Array> {
      const vector = await candidate.embed(text);
      return toFloat32Array(vector);
    },
  };
}

async function fromRuntimeFactory(rt: EmbeddingRuntimeModule, cfg: SemanticConfig): Promise<Embedder | null> {
  const factory = rt.loadEmbedder ?? rt.createEmbedder;
  if (!factory) {
    return null;
  }

  const candidate = await factory({ model: cfg.model, modelHash: cfg.modelHash });
  assertModelHash(cfg.model, cfg.modelHash, [candidate]);
  return normalizeEmbedder(candidate);
}

async function fromTransformersRuntime(rt: EmbeddingRuntimeModule, cfg: SemanticConfig): Promise<Embedder> {
  if (!rt.pipeline) {
    throw new Error('Embedding runtime is missing a supported embedder factory.');
  }

  const extractor = await rt.pipeline('feature-extraction', cfg.model);
  const probe = await extractor('shape probe', { pooling: 'mean', normalize: true });
  const probeVector = toFloat32Array(probe);
  assertModelHash(cfg.model, cfg.modelHash, [extractor, probe]);

  return {
    dim: probeVector.length,
    async embed(text: string): Promise<Float32Array> {
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      const vector = toFloat32Array(output);
      if (vector.length !== probeVector.length) {
        throw new Error(
          `Embedding dimension drift detected. Expected ${probeVector.length}, got ${vector.length}.`,
        );
      }
      return vector;
    },
  };
}

export async function loadEmbedder(cfg: SemanticConfig): Promise<Embedder> {
  const runtimePackage = cfg.runtimePackage ?? DEFAULT_RUNTIME_PACKAGE;
  let runtime: EmbeddingRuntimeModule;
  try {
    runtime = (await import(runtimePackage)) as EmbeddingRuntimeModule;
  } catch {
    throw new EmbeddingModelMissingError(runtimePackage);
  }

  const embedderFromRuntime = await fromRuntimeFactory(runtime, cfg);
  if (embedderFromRuntime) {
    return embedderFromRuntime;
  }

  return fromTransformersRuntime(runtime, cfg);
}
