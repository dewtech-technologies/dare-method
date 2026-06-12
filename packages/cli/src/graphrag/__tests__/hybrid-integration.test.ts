import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMcpServer } from '../../mcp-server/server.js';
import { GraphRAG } from '../graph-rag.js';

const mocks = vi.hoisted(() => ({
  loadEmbedder: vi.fn(),
  hybridSearch: vi.fn(),
}));

vi.mock('../embeddings.js', async () => {
  const actual = await vi.importActual<typeof import('../embeddings.js')>('../embeddings.js');
  return {
    ...actual,
    loadEmbedder: mocks.loadEmbedder,
  };
});

vi.mock('../hybrid.js', async () => {
  const actual = await vi.importActual<typeof import('../hybrid.js')>('../hybrid.js');
  return {
    ...actual,
    hybridSearch: mocks.hybridSearch,
  };
});

type ProjectFixture = {
  readonly projectRoot: string;
  readonly graph: GraphRAG;
  cleanup(): Promise<void>;
};

async function createFixture(semanticEnabled: boolean): Promise<ProjectFixture> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-integration-'));
  await fs.ensureDir(path.join(projectRoot, 'DARE'));
  await fs.writeJson(path.join(projectRoot, 'dare.config.json'), {
    graphrag: {
      backend: 'sqlite',
      semantic: {
        enabled: semanticEnabled,
        model: 'all-MiniLM-L6-v2',
        rrfK: 60,
      },
    },
  });

  const dbPath = path.join(projectRoot, '.dare', 'graph.db');
  const graph = new GraphRAG(dbPath);
  await graph.init();
  graph.addNode({
    id: 'task:alpha',
    type: 'task',
    label: 'Alpha keyword hit',
    description: 'keyword fallback candidate',
  });
  graph.addNode({
    id: 'code_symbol:src/semantic.ts::search',
    type: 'code_symbol',
    label: 'semantic-search',
    description: 'semantic candidate',
    metadata: {
      qualifiedName: 'src/semantic.ts::search',
      path: 'src/semantic.ts',
      symbol: 'search',
      kind: 'function',
    },
  });

  return {
    projectRoot,
    graph,
    async cleanup(): Promise<void> {
      await Promise.resolve(graph.close());
      await fs.remove(projectRoot).catch(() => undefined);
    },
  };
}

afterEach(() => {
  mocks.loadEmbedder.mockReset();
  mocks.hybridSearch.mockReset();
  vi.restoreAllMocks();
});

describe('hybrid integration', () => {
  it('enabled_uses_hybrid', async () => {
    const fixture = await createFixture(true);
    try {
      mocks.loadEmbedder.mockResolvedValue({
        dim: 2,
        async embed(): Promise<Float32Array> {
          return new Float32Array([1, 0]);
        },
      });
      const semanticNode = fixture.graph.getNode('code_symbol:src/semantic.ts::search');
      mocks.hybridSearch.mockResolvedValue([
        {
          node: semanticNode,
          score: 0.99,
          snippet: 'semantic',
        },
      ]);

      const ranked = await fixture.graph.searchNodesHybrid('semantic target', 5);

      expect(mocks.loadEmbedder).toHaveBeenCalledTimes(1);
      expect(mocks.hybridSearch).toHaveBeenCalledTimes(1);
      expect(ranked[0]?.node.id).toBe('code_symbol:src/semantic.ts::search');
    } finally {
      await fixture.cleanup();
    }
  });

  it('disabled_uses_keyword', async () => {
    const fixture = await createFixture(false);
    try {
      const ranked = await fixture.graph.searchNodesHybrid('alpha', 5);
      expect(ranked.map((entry) => entry.node.id)).toContain('task:alpha');
      expect(mocks.loadEmbedder).not.toHaveBeenCalled();
      expect(mocks.hybridSearch).not.toHaveBeenCalled();
    } finally {
      await fixture.cleanup();
    }
  });

  it('fallback_when_model_missing', async () => {
    const fixture = await createFixture(true);
    try {
      const { EmbeddingModelMissingError } = await import('../embeddings.js');
      mocks.loadEmbedder.mockRejectedValueOnce(
        new EmbeddingModelMissingError('@huggingface/transformers'),
      );
      const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

      const ranked = await fixture.graph.searchNodesHybrid('alpha', 5);

      expect(ranked.map((entry) => entry.node.id)).toContain('task:alpha');
      expect(mocks.hybridSearch).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();
    } finally {
      await fixture.cleanup();
    }
  });

  it('mcp_graph_locate_hybrid', async () => {
    const fixture = await createFixture(true);
    try {
      mocks.loadEmbedder.mockResolvedValue({
        dim: 2,
        async embed(): Promise<Float32Array> {
          return new Float32Array([1, 0]);
        },
      });
      const semanticNode = fixture.graph.getNode('code_symbol:src/semantic.ts::search');
      mocks.hybridSearch.mockResolvedValue([
        {
          node: semanticNode,
          score: 0.98,
          snippet: 'semantic locate',
        },
      ]);

      const app = createMcpServer(fixture.projectRoot, { allowLoopbackWithoutToken: true });
      const res = await request(app).post('/graph/locate').send({ seed: 'semantic target' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const ids = (res.body.candidates as Array<{ node: { id: string } }>).map((c) => c.node.id);
      expect(ids).toContain('code_symbol:src/semantic.ts::search');
      expect(mocks.hybridSearch).toHaveBeenCalled();
    } finally {
      await fixture.cleanup();
    }
  });
});
