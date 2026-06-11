import path from 'node:path';
import fs from 'fs-extra';
import { createHash } from 'node:crypto';
import { parseSemanticConfig } from '../verification/config.js';
import type { KnowledgeGraph } from './knowledge-graph.js';
import type { GraphNode, NodeType } from './types.js';
import {
  EmbeddingModelMissingError,
  loadEmbedder,
  type Embedder,
  type SemanticConfig as EmbeddingSemanticConfig,
} from './embeddings.js';

const QUERY_LIMIT = 1_000_000;
const INDEXABLE_TYPES = new Set<NodeType>(['requirement', 'code_symbol']);

type LoadEmbedderFn = (cfg: EmbeddingSemanticConfig) => Promise<Embedder>;

export interface IncrementalIndexOptions {
  readonly nodeIds?: readonly string[];
  readonly loadEmbedderFn?: LoadEmbedderFn;
  readonly nowIso?: () => string;
}

export interface IncrementalIndexResult {
  readonly semanticEnabled: boolean;
  readonly scanned: number;
  readonly embedded: number;
  readonly skippedUnchanged: number;
}

interface ResolvedSemanticConfig {
  readonly enabled: boolean;
  readonly model: string;
  readonly modelHash: string;
}

export async function runIncrementalSemanticIndex(
  graph: KnowledgeGraph,
  projectRoot: string,
  opts: IncrementalIndexOptions = {},
): Promise<IncrementalIndexResult> {
  const semantic = await loadSemanticConfig(projectRoot);
  if (!semantic.enabled) {
    return {
      semanticEnabled: false,
      scanned: 0,
      embedded: 0,
      skippedUnchanged: 0,
    };
  }

  const candidates = collectCandidates(graph, opts.nodeIds);
  if (candidates.length === 0) {
    return {
      semanticEnabled: true,
      scanned: 0,
      embedded: 0,
      skippedUnchanged: 0,
    };
  }

  let embedder: Embedder;
  const loader = opts.loadEmbedderFn ?? loadEmbedder;
  try {
    embedder = await loader({
      model: semantic.model,
      modelHash: semantic.modelHash,
    });
  } catch (error) {
    if (error instanceof EmbeddingModelMissingError) {
      return {
        semanticEnabled: false,
        scanned: 0,
        embedded: 0,
        skippedUnchanged: 0,
      };
    }
    throw error;
  }

  const nowIso = opts.nowIso ?? (() => new Date().toISOString());
  let embedded = 0;
  let skippedUnchanged = 0;

  for (const node of candidates) {
    const text = embeddingText(node);
    if (!text) continue;

    const metadata = toMetadata(node.metadata);
    const contentHash = readString(metadata, 'contentHash') ?? hashText(text);
    const vectorContentHash = readString(metadata, 'vectorContentHash');
    const hasVector = Array.isArray(node.vector) && node.vector.length > 0;

    if (hasVector && vectorContentHash === contentHash) {
      skippedUnchanged += 1;
      continue;
    }

    const vector = await embedder.embed(text);
    graph.addNode({
      ...node,
      vector: Array.from(vector),
      metadata: {
        ...metadata,
        contentHash,
        vectorContentHash: contentHash,
        embeddedAt: nowIso(),
      },
    });
    embedded += 1;
  }

  return {
    semanticEnabled: true,
    scanned: candidates.length,
    embedded,
    skippedUnchanged,
  };
}

export function mergeWithExistingMetadata(
  graph: KnowledgeGraph,
  nodeId: string,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const existing = toMetadata(graph.getNode(nodeId)?.metadata);
  return { ...existing, ...metadata };
}

async function loadSemanticConfig(projectRoot: string): Promise<ResolvedSemanticConfig> {
  const configPath = path.join(projectRoot, 'dare.config.json');
  const rawConfig: unknown = (await fs.pathExists(configPath))
    ? ((await fs.readJson(configPath)) as unknown)
    : {};
  const parsed = parseSemanticConfig(rawConfig);
  const model = parsed.model.trim();
  const modelHash =
    typeof parsed.modelHash === 'string' && parsed.modelHash.trim().length > 0
      ? parsed.modelHash.trim()
      : createHash('sha256').update(`model:${model}`).digest('hex');
  return {
    enabled: parsed.enabled && model.length > 0,
    model,
    modelHash,
  };
}

function collectCandidates(graph: KnowledgeGraph, nodeIds?: readonly string[]): GraphNode[] {
  const ids = new Set<string>();
  const out: GraphNode[] = [];

  if (nodeIds && nodeIds.length > 0) {
    for (const nodeId of nodeIds) {
      if (ids.has(nodeId)) continue;
      const node = graph.getNode(nodeId);
      if (!node || !INDEXABLE_TYPES.has(node.type)) continue;
      ids.add(node.id);
      out.push(node);
    }
    return out;
  }

  for (const type of INDEXABLE_TYPES) {
    for (const node of graph.queryNodes(type, QUERY_LIMIT)) {
      if (ids.has(node.id)) continue;
      ids.add(node.id);
      out.push(node);
    }
  }
  return out;
}

function embeddingText(node: GraphNode): string {
  const metadata = toMetadata(node.metadata);

  if (node.type === 'requirement') {
    const reqId = readString(metadata, 'reqId');
    const title = readString(metadata, 'title') ?? node.label;
    return reqId ? `${reqId}: ${title}` : title;
  }

  if (node.type === 'code_symbol') {
    const qualifiedName =
      readString(metadata, 'qualifiedName') ??
      node.description ??
      node.id.replace(/^code_symbol:/, '');
    const symbol = readString(metadata, 'symbol') ?? node.label;
    const kind = readString(metadata, 'kind');
    const line =
      typeof metadata.line === 'number' && Number.isFinite(metadata.line)
        ? `line:${Math.trunc(metadata.line)}`
        : undefined;
    return [qualifiedName, symbol, kind, line].filter((part): part is string => Boolean(part)).join('\n');
  }

  return `${node.label}\n${node.description ?? ''}`.trim();
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function toMetadata(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? { ...(value as Record<string, unknown>) } : {};
}

function readString(meta: Record<string, unknown>, key: string): string | undefined {
  const value = meta[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
