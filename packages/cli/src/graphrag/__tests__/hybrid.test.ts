import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Embedder } from '../embeddings.js';
import { JsonGraph } from '../json-graph.js';
import { hybridSearch } from '../hybrid.js';

function createEmbedder(vector: Float32Array): Embedder {
  return {
    dim: vector.length,
    async embed(): Promise<Float32Array> {
      return vector;
    },
  };
}

describe('hybridSearch', () => {
  let graph: JsonGraph;

  beforeEach(async () => {
    const file = path.join(os.tmpdir(), `hybrid-${Date.now()}-${Math.random()}.json`);
    graph = new JsonGraph(file);
    await graph.init();

    graph.addNode({
      id: 'node:a',
      type: 'task',
      label: 'Alpha keyword champion',
      description: 'alpha dominates keyword list',
    });
    graph.addNode({
      id: 'node:b',
      type: 'file',
      label: 'Beta semantic winner',
      description: 'vector-only candidate',
      metadata: { vector: [1, 0] },
    });
    graph.addNode({
      id: 'node:c',
      type: 'code_symbol',
      label: 'Gamma balanced candidate',
      description: 'good in keyword and vector',
      metadata: { vector: [0.9, 0.1] },
    });

    graph.addEdge({
      id: 'edge:a-c',
      sourceId: 'node:a',
      targetId: 'node:c',
      type: 'related_to',
    });
  });

  afterEach(() => {
    graph.close();
  });

  it('rrf_combines_three_lists', async () => {
    const embedder = createEmbedder(new Float32Array([1, 0]));

    const ranked = await hybridSearch(graph, embedder, 'keyword', { k: 3, rrfK: 60 });

    expect(ranked.map((item) => item.node.id)).toEqual(['node:c', 'node:a', 'node:b']);
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? -Infinity);
    expect(ranked[1]?.score).toBeGreaterThan(ranked[2]?.score ?? -Infinity);
  });

  it('fallback_keyword_when_no_embedder', async () => {
    const keywordOnly = graph.searchNodes('keyword', 3);
    const ranked = await hybridSearch(graph, null, 'keyword', { k: 3, rrfK: 60 });

    expect(ranked).toEqual(keywordOnly);
  });

  it('respects_rrfK_and_k', async () => {
    const embedder = createEmbedder(new Float32Array([1, 0]));

    const tight = await hybridSearch(graph, embedder, 'keyword', { k: 2, rrfK: 1 });
    const loose = await hybridSearch(graph, embedder, 'keyword', { k: 2, rrfK: 100 });

    expect(tight).toHaveLength(2);
    expect(loose).toHaveLength(2);
    expect(tight[0]?.score).toBeGreaterThan(loose[0]?.score ?? Infinity);
  });
});
