import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KnowledgeGraph } from '../../../../graphrag/knowledge-graph.js';
import type { GraphEdge, GraphNode } from '../../../../graphrag/types.js';

const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));

export interface DualGraphFixture {
  nodes: GraphNode[];
  edges: GraphEdge[];
  expect?: Record<string, unknown>;
}

export function buildGraphFromFixture(graph: KnowledgeGraph, fixture: DualGraphFixture): void {
  for (const node of fixture.nodes) {
    graph.addNode(node);
  }
  for (const edge of fixture.edges) {
    graph.addEdge(edge);
  }
}

export function loadFixture(name: string): DualGraphFixture {
  const filePath = name.endsWith('.json')
    ? path.join(FIXTURE_DIR, name)
    : path.join(FIXTURE_DIR, `${name}.json`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as DualGraphFixture;
}

export function listFixturePaths(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) out.push(full);
    }
  };
  walk(FIXTURE_DIR);
  return out.sort();
}
