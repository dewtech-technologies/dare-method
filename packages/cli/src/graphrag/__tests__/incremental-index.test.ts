import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonGraph } from '../json-graph.js';
import { runIncrementalSemanticIndex } from '../incremental-index.js';

const cleanupRoots: string[] = [];

async function createFixture(semanticEnabled: boolean): Promise<{
  root: string;
  graph: JsonGraph;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'incremental-index-'));
  cleanupRoots.push(root);
  await fs.writeJson(path.join(root, 'dare.config.json'), {
    graphrag: {
      backend: 'json',
      semantic: {
        enabled: semanticEnabled,
        model: 'all-MiniLM-L6-v2',
        modelHash: 'test-model-hash',
        rrfK: 60,
      },
    },
  });
  const graph = new JsonGraph(path.join(root, '.dare', 'graph.json'));
  await graph.init();
  return { root, graph };
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

afterEach(async () => {
  for (const root of cleanupRoots.splice(0, cleanupRoots.length)) {
    await fs.remove(root).catch(() => undefined);
  }
});

describe('incremental-index', () => {
  it('unchanged_node_not_reembedded', async () => {
    const { root, graph } = await createFixture(true);
    const nodeId = 'code_symbol:src/orders.ts::checkout';
    const stableHash = hash('stable-node');
    graph.addNode({
      id: nodeId,
      type: 'code_symbol',
      label: 'checkout',
      description: 'src/orders.ts::checkout',
      vector: [0.1, 0.2],
      metadata: {
        qualifiedName: 'src/orders.ts::checkout',
        symbol: 'checkout',
        kind: 'function',
        contentHash: stableHash,
        vectorContentHash: stableHash,
      },
    });

    const embedSpy = vi.fn(async () => new Float32Array([9, 9]));
    const result = await runIncrementalSemanticIndex(graph, root, {
      loadEmbedderFn: async () => ({ dim: 2, embed: embedSpy }),
    });

    expect(result.semanticEnabled).toBe(true);
    expect(result.scanned).toBe(1);
    expect(result.embedded).toBe(0);
    expect(result.skippedUnchanged).toBe(1);
    expect(embedSpy).not.toHaveBeenCalled();
  });

  it('changed_node_reembedded', async () => {
    const { root, graph } = await createFixture(true);
    const nodeId = 'code_symbol:src/orders.ts::checkout';
    const oldHash = hash('checkout-v1');
    const newHash = hash('checkout-v2');

    graph.addNode({
      id: nodeId,
      type: 'code_symbol',
      label: 'checkout',
      description: 'src/orders.ts::checkout',
      vector: [0.01, 0.02],
      metadata: {
        qualifiedName: 'src/orders.ts::checkout',
        symbol: 'checkout',
        kind: 'function',
        contentHash: oldHash,
        vectorContentHash: oldHash,
      },
    });

    graph.addNode({
      id: nodeId,
      type: 'code_symbol',
      label: 'checkout',
      description: 'src/orders.ts::checkout',
      metadata: {
        qualifiedName: 'src/orders.ts::checkout',
        symbol: 'checkout',
        kind: 'function',
        contentHash: newHash,
        vectorContentHash: oldHash,
      },
    });

    const embedSpy = vi.fn(async () => new Float32Array([0.9, 0.1]));
    const result = await runIncrementalSemanticIndex(graph, root, {
      loadEmbedderFn: async () => ({ dim: 2, embed: embedSpy }),
    });

    expect(result.semanticEnabled).toBe(true);
    expect(result.embedded).toBe(1);
    expect(embedSpy).toHaveBeenCalledTimes(1);

    const updated = graph.getNode(nodeId);
    expect(updated?.vector?.[0]).toBeCloseTo(0.9, 5);
    expect(updated?.vector?.[1]).toBeCloseTo(0.1, 5);
    const metadata = updated?.metadata as Record<string, unknown> | undefined;
    expect(metadata?.contentHash).toBe(newHash);
    expect(metadata?.vectorContentHash).toBe(newHash);
  });

  it('disabled_skips_embedding', async () => {
    const { root, graph } = await createFixture(false);
    graph.addNode({
      id: 'requirement:RF-01',
      type: 'requirement',
      label: 'RF-01',
      metadata: {
        reqId: 'RF-01',
        title: 'Auth MUST',
        contentHash: hash('Auth MUST'),
      },
    });

    const loaderSpy = vi.fn(async () => ({
      dim: 2,
      embed: vi.fn(async () => new Float32Array([1, 0])),
    }));
    const result = await runIncrementalSemanticIndex(graph, root, {
      loadEmbedderFn: loaderSpy,
    });

    expect(result.semanticEnabled).toBe(false);
    expect(result.scanned).toBe(0);
    expect(result.embedded).toBe(0);
    expect(loaderSpy).not.toHaveBeenCalled();
  });
});
