import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import { GraphRAG } from '../graph-rag.js';
import { JsonGraph } from '../json-graph.js';
import type { KnowledgeGraph } from '../knowledge-graph.js';

type BackendFactory = {
  name: 'sqlite' | 'json';
  extension: 'db' | 'json';
  create: (filePath: string) => KnowledgeGraph;
};

const BACKENDS: readonly BackendFactory[] = [
  { name: 'sqlite', extension: 'db', create: (filePath) => new GraphRAG(filePath) },
  { name: 'json', extension: 'json', create: (filePath) => new JsonGraph(filePath) },
];

function tempPath(prefix: string, extension: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return path.join(os.tmpdir(), `${prefix}-${suffix}.${extension}`);
}

function expectVectorClose(actual: Float32Array, expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  for (let index = 0; index < expected.length; index++) {
    expect(actual[index]).toBeCloseTo(expected[index] ?? 0, 5);
  }
}

describe('vector-persistence', () => {
  it('roundtrip_float32', async () => {
    const expected = [0.125, -2.5, Math.PI, 42.25];

    for (const backend of BACKENDS) {
      const filePath = tempPath(`vector-roundtrip-${backend.name}`, backend.extension);
      const graph = backend.create(filePath);

      try {
        await graph.init();
        graph.addNode({
          id: `concept:${backend.name}-vector`,
          type: 'concept',
          label: `vector-${backend.name}`,
          vector: expected,
        });
        await Promise.resolve(graph.close());

        const reopened = backend.create(filePath);
        try {
          await reopened.init();
          const vectors = reopened.loadVectors();
          expect(vectors).toHaveLength(1);
          expect(vectors[0]?.id).toBe(`concept:${backend.name}-vector`);
          expectVectorClose(vectors[0]!.v, expected);
        } finally {
          await Promise.resolve(reopened.close());
        }
      } finally {
        await fs.remove(filePath).catch(() => undefined);
      }
    }
  });

  it('node_without_vector_is_valid', async () => {
    for (const backend of BACKENDS) {
      const filePath = tempPath(`vector-compat-${backend.name}`, backend.extension);
      const graph = backend.create(filePath);

      try {
        await graph.init();
        graph.addNode({
          id: `task:${backend.name}-legacy`,
          type: 'task',
          label: 'legacy-node',
        });
        expect(graph.getNode(`task:${backend.name}-legacy`)).not.toBeNull();
        expect(graph.loadVectors()).toEqual([]);
      } finally {
        await Promise.resolve(graph.close());
        await fs.remove(filePath).catch(() => undefined);
      }
    }
  });

  it('export_import_preserves_vector', async () => {
    const sourcePath = tempPath('vector-export-source', 'db');
    const targetPath = tempPath('vector-export-target', 'json');
    const expected = [0.5, 1.5, -3.25];

    const source = new GraphRAG(sourcePath);
    const target = new JsonGraph(targetPath);

    try {
      await source.init();
      source.addNode({
        id: 'concept:portable-vector',
        type: 'concept',
        label: 'portable',
        vector: expected,
      });
      source.addNode({
        id: 'task:without-vector',
        type: 'task',
        label: 'no-vector',
      });

      const exported = source.exportToJson();
      await target.init();
      target.importFromJson(exported);

      const restored = target.getNode('concept:portable-vector');
      expect(restored).not.toBeNull();
      expect(Array.isArray(restored?.vector)).toBe(true);
      expectVectorClose(new Float32Array(restored?.vector ?? []), expected);

      const vectors = target.loadVectors();
      expect(vectors).toHaveLength(1);
      expect(vectors[0]?.id).toBe('concept:portable-vector');
      expectVectorClose(vectors[0]!.v, expected);
    } finally {
      await Promise.resolve(source.close());
      await Promise.resolve(target.close());
      await fs.remove(sourcePath).catch(() => undefined);
      await fs.remove(targetPath).catch(() => undefined);
    }
  });
});
