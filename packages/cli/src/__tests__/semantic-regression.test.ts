import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { describe, expect, it, vi } from 'vitest';
import { EmbeddingModelMissingError, type Embedder } from '../graphrag/embeddings.js';
import * as embeddingsModule from '../graphrag/embeddings.js';
import { GraphRAG } from '../graphrag/graph-rag.js';
import { hybridSearch } from '../graphrag/hybrid.js';
import { JsonGraph } from '../graphrag/json-graph.js';
import type { GraphNode, SearchResult } from '../graphrag/types.js';

interface LabeledQuery {
  readonly id: string;
  readonly kind: 'keyword' | 'semantic';
  readonly query: string;
  readonly relevantNodeIds: readonly string[];
}

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(TEST_DIR, '__fixtures__', 'semantic-queries.json');
const PKG_ROOT = path.resolve(TEST_DIR, '..', '..');
const ALLOWED_REL = path.join('src', 'graphrag', 'embeddings.ts');
const FORBIDDEN_IMPORT_RE =
  /(?:import|require)\s*\(?['"](?:onnxruntime|@xenova\/transformers)|from\s+['"](?:onnxruntime|@xenova\/transformers)/;
const EMBEDDING_DIM = 8;

function canonicalSemanticKey(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes('refund')) return 'concept:refund_policy';
  if (normalized.includes('billing') || normalized.includes('invoice')) return 'concept:billing_invoice';
  if (
    normalized.includes('cancel') ||
    normalized.includes('termination') ||
    normalized.includes('stop recurring')
  ) {
    return 'concept:cancel_subscription';
  }
  if (
    normalized.includes('downgrade') ||
    normalized.includes('cheaper tier') ||
    normalized.includes('lower tier')
  ) {
    return 'concept:downgrade_plan';
  }
  return `concept:${normalized.replace(/\s+/g, '_')}`;
}

function deterministicVector(text: string): Float32Array {
  const digest = createHash('sha256').update(canonicalSemanticKey(text)).digest();
  const vector = new Float32Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    const left = digest[i] ?? 0;
    const right = digest[i + EMBEDDING_DIM] ?? 0;
    vector[i] = (left - right) / 255;
  }
  return vector;
}

function createDeterministicEmbedder(): Embedder {
  return {
    dim: EMBEDDING_DIM,
    async embed(text: string): Promise<Float32Array> {
      return deterministicVector(text);
    },
  };
}

function buildFixtureNodes(): GraphNode[] {
  return [
    {
      id: 'node:refund',
      type: 'task',
      label: 'refund policy handbook',
      description: 'official refund policy for digital orders',
      vector: Array.from(deterministicVector('refund policy')),
    },
    {
      id: 'node:billing',
      type: 'task',
      label: 'billing invoice reconciliation',
      description: 'billing invoice closing steps',
      vector: Array.from(deterministicVector('billing invoice')),
    },
    {
      id: 'node:cancel',
      type: 'task',
      label: 'subscription termination playbook',
      description: 'stop recurring charge workflow',
      vector: Array.from(deterministicVector('cancel subscription')),
    },
    {
      id: 'node:downgrade',
      type: 'task',
      label: 'plan tier adjustment guide',
      description: 'switch to a lower tier safely',
      vector: Array.from(deterministicVector('downgrade plan')),
    },
    {
      id: 'node:noise',
      type: 'task',
      label: 'engineering onboarding notes',
      description: 'team process and meeting cadence',
      vector: Array.from(deterministicVector('engineering onboarding')),
    },
  ];
}

function readLabeledQueries(): LabeledQuery[] {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as LabeledQuery[];
}

function reciprocalRank(results: readonly SearchResult[], relevantNodeIds: ReadonlySet<string>): number {
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    if (item && relevantNodeIds.has(item.node.id)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function recallAtK(
  results: readonly SearchResult[],
  relevantNodeIds: ReadonlySet<string>,
  k: number,
): number {
  if (relevantNodeIds.size === 0) return 0;
  const matched = new Set(
    results.slice(0, k).filter((result) => relevantNodeIds.has(result.node.id)).map((result) => result.node.id),
  );
  return matched.size / relevantNodeIds.size;
}

function walkTsFiles(dir: string, base = PKG_ROOT): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      files.push(...walkTsFiles(full, base));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) continue;
    files.push(path.relative(base, full));
  }
  return files;
}

describe('semantic regression audit (task-809)', () => {
  it('hybrid_not_worse_than_keyword', async () => {
    const graphPath = path.join(os.tmpdir(), `semantic-regression-${Date.now()}-${Math.random()}.json`);
    const graph = new JsonGraph(graphPath);
    await graph.init();
    for (const node of buildFixtureNodes()) {
      graph.addNode(node);
    }

    try {
      const queries = readLabeledQueries();
      const embedder = createDeterministicEmbedder();
      let semanticImproved = false;

      for (const query of queries) {
        const relevant = new Set(query.relevantNodeIds);
        const keywordRanked = graph.searchNodes(query.query, 5);
        const hybridRanked = await hybridSearch(graph, embedder, query.query, { k: 5, rrfK: 60 });

        const keywordMrr = reciprocalRank(keywordRanked, relevant);
        const hybridMrr = reciprocalRank(hybridRanked, relevant);
        const keywordRecall = recallAtK(keywordRanked, relevant, 5);
        const hybridRecall = recallAtK(hybridRanked, relevant, 5);

        expect(
          hybridMrr,
          `MRR regressed for query "${query.id}" (${query.query})`,
        ).toBeGreaterThanOrEqual(keywordMrr);
        expect(
          hybridRecall,
          `Recall@5 regressed for query "${query.id}" (${query.query})`,
        ).toBeGreaterThanOrEqual(keywordRecall);

        if (
          query.kind === 'semantic' &&
          (hybridMrr > keywordMrr || hybridRecall > keywordRecall)
        ) {
          semanticImproved = true;
        }
      }

      expect(semanticImproved).toBe(true);
    } finally {
      graph.close();
      await fs.remove(graphPath).catch(() => undefined);
    }
  });

  it('fallback_without_model', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'semantic-fallback-'));
    const dbPath = path.join(projectRoot, '.dare', 'graph.db');
    await fs.ensureDir(path.dirname(dbPath));
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), {
      graphrag: {
        backend: 'sqlite',
        semantic: {
          enabled: true,
          model: 'all-MiniLM-L6-v2',
          modelHash: 'sha256:missing',
          rrfK: 60,
        },
      },
    });

    const loadEmbedderSpy = vi
      .spyOn(embeddingsModule, 'loadEmbedder')
      .mockRejectedValue(new EmbeddingModelMissingError('missing-runtime'));
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const graph = new GraphRAG(dbPath);
    await graph.init();
    graph.addNode({
      id: 'node:keyword-fallback',
      type: 'task',
      label: 'fallback keyword target',
      description: 'keyword fallback should still resolve this node',
    });

    try {
      const keywordRanked = graph.searchNodes('fallback keyword', 5);
      const hybridRanked = await graph.searchNodesHybrid('fallback keyword', 5);
      expect(hybridRanked.map((entry) => entry.node.id)).toEqual(
        keywordRanked.map((entry) => entry.node.id),
      );
      expect(loadEmbedderSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('semantic disabled, using keyword fallback'),
      );
    } finally {
      vi.restoreAllMocks();
      await Promise.resolve(graph.close());
      await fs.remove(projectRoot).catch(() => undefined);
    }
  });

  it('no_heavy_dep_in_core', () => {
    const sourceFiles = walkTsFiles(path.join(PKG_ROOT, 'src')).filter(
      (rel) => path.normalize(rel) !== path.normalize(ALLOWED_REL),
    );
    const offenders = sourceFiles.filter((rel) => {
      const content = readFileSync(path.join(PKG_ROOT, rel), 'utf8');
      return FORBIDDEN_IMPORT_RE.test(content);
    });
    expect(offenders).toEqual([]);
  });

  it('legacy_graph_without_vectors', async () => {
    const graphPath = path.join(os.tmpdir(), `legacy-semantic-${Date.now()}-${Math.random()}.json`);
    const graph = new JsonGraph(graphPath);
    await graph.init();
    graph.addNode({
      id: 'legacy:1',
      type: 'task',
      label: 'legacy keyword anchor',
      description: 'legacy graph has no vectors',
    });
    graph.addNode({
      id: 'legacy:2',
      type: 'task',
      label: 'legacy keyword secondary',
      description: 'secondary keyword fallback candidate',
    });

    try {
      const keywordRanked = graph.searchNodes('legacy keyword', 5);
      const hybridRanked = await hybridSearch(
        graph,
        createDeterministicEmbedder(),
        'legacy keyword',
        { k: 5, rrfK: 60 },
      );
      expect(hybridRanked.map((entry) => entry.node.id)).toEqual(
        keywordRanked.map((entry) => entry.node.id),
      );
    } finally {
      graph.close();
      await fs.remove(graphPath).catch(() => undefined);
    }
  });

  it('embeddings_deterministic', async () => {
    const embedder = createDeterministicEmbedder();
    const first = await embedder.embed('cancel my plan');
    const second = await embedder.embed('cancel my plan');
    const different = await embedder.embed('move to cheaper tier');

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(Array.from(first)).not.toEqual(Array.from(different));
  });
});
