import { assertRelativeSafe } from '../utils/path-safety.js';
import type { KnowledgeGraph } from './knowledge-graph.js';
import type {
  GraphEdge,
  GraphNode,
  LocateOptions,
  LocateResult,
  TraverseOptions,
  TraverseResult,
} from './types.js';

const QN_RE = /^[\w./-]+::\w+$/;
const SUPPORTED_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|php|rb|java|kt|cs)$/i;

function findByQualifiedName(graph: KnowledgeGraph, qn: string): GraphNode | null {
  const directId = qn.startsWith('code_symbol:') ? qn : `code_symbol:${qn}`;
  const direct = graph.getNode(directId);
  if (direct) return direct;
  const { nodes } = graph.exportToJson();
  return (
    nodes.find(
      (n) =>
        n.type === 'code_symbol' &&
        (n.metadata?.qualifiedName === qn || n.id === directId),
    ) ?? null
  );
}

function isPathLike(seed: string): boolean {
  return seed.includes('/') || seed.includes('::') || SUPPORTED_EXT.test(seed);
}

function pathPartFromSeed(seed: string): string {
  if (seed.includes('::')) return seed.split('::')[0]!;
  return seed;
}

export function traverse(graph: KnowledgeGraph, opts: TraverseOptions): TraverseResult {
  const maxHops = Math.min(opts.maxHops ?? 3, 5);
  const maxFanout = Math.min(opts.maxFanout ?? 50, 200);
  const direction = opts.direction ?? 'both';
  const edgeFilter = opts.edgeTypes ? new Set(opts.edgeTypes) : null;
  const nodeFilter = opts.nodeTypes ? new Set(opts.nodeTypes) : null;

  const visitedNodes = new Map<string, GraphNode>();
  const visitedEdges = new Map<string, GraphEdge>();

  for (const seedId of opts.seedNodeIds) {
    const seed = graph.getNode(seedId);
    if (seed) visitedNodes.set(seedId, seed);
  }

  let frontier = opts.seedNodeIds.filter((id) => graph.getNode(id));
  let hopsReached = 0;

  for (let depth = 0; depth < maxHops && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];
    hopsReached = depth + 1;

    for (const nodeId of frontier) {
      let edges = graph.getEdges(nodeId, direction);
      edges = edges.sort((a, b) => a.id.localeCompare(b.id)).slice(0, maxFanout);
      if (edgeFilter) edges = edges.filter((e) => edgeFilter.has(e.type));

      for (const edge of edges) {
        visitedEdges.set(edge.id, edge);
        const neighborId =
          edge.sourceId === nodeId ? edge.targetId : edge.sourceId;
        if (visitedNodes.has(neighborId)) continue;
        const node = graph.getNode(neighborId);
        if (!node) continue;
        if (nodeFilter && !nodeFilter.has(node.type)) continue;
        visitedNodes.set(neighborId, node);
        nextFrontier.push(neighborId);
      }
    }
    frontier = nextFrontier;
  }

  return {
    nodes: [...visitedNodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...visitedEdges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    hops: hopsReached,
  };
}

interface ScoredCandidate {
  node: GraphNode;
  score: number;
  path: string[];
}

export function locate(
  graph: KnowledgeGraph,
  seedQuery: string,
  opts: LocateOptions = {},
): LocateResult {
  const hops = Math.min(opts.hops ?? 3, 5);
  const limit = Math.min(opts.limit ?? 10, 50);
  const edgeTypes = opts.edgeTypes ?? ['implements', 'contains', 'depends_on'];
  const nodeTypes = opts.nodeTypes ?? ['code_symbol', 'file', 'task'];

  if (isPathLike(seedQuery)) {
    assertRelativeSafe(pathPartFromSeed(seedQuery));
  }

  const seeds: ScoredCandidate[] = [];

  if (QN_RE.test(seedQuery)) {
    const node = findByQualifiedName(graph, seedQuery);
    if (node) seeds.push({ node, score: 1.0, path: [node.id] });
  } else if (isPathLike(seedQuery) && !seedQuery.includes('::')) {
    const prefix = seedQuery.replace(/\\/g, '/');
    const { nodes } = graph.exportToJson();
    for (const n of nodes) {
      if (n.type !== 'file' && n.type !== 'code_symbol') continue;
      const p = String(n.metadata?.path ?? n.metadata?.qualifiedName ?? '');
      if (p.startsWith(prefix) || n.id.includes(prefix)) {
        seeds.push({ node: n, score: 1.0, path: [n.id] });
      }
    }
  } else {
    for (const hit of graph.searchNodes(seedQuery, 5)) {
      seeds.push({ node: hit.node, score: 0.7, path: [hit.node.id] });
    }
  }

  const candidates = new Map<string, ScoredCandidate>();

  for (const seed of seeds) {
    const key = seed.node.id;
    const existing = candidates.get(key);
    if (!existing || seed.score > existing.score) {
      candidates.set(key, seed);
    }

    const walked = traverse(graph, {
      seedNodeIds: [seed.node.id],
      maxHops: hops,
      edgeTypes,
      nodeTypes,
      direction: 'both',
    });

    for (const node of walked.nodes) {
      const hopDist = walked.edges.length > 0 ? 1 : 0;
      let score = seed.score - hopDist * 0.15;
      if (node.type === 'code_symbol') score += 0.1;
      const prev = candidates.get(node.id);
      if (!prev || score > prev.score) {
        candidates.set(node.id, {
          node,
          score,
          path: [seed.node.id, node.id],
        });
      }
    }
  }

  const sorted = [...candidates.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.node.id.localeCompare(b.node.id);
  });

  return {
    candidates: sorted.slice(0, limit).map((c) => ({
      node: c.node,
      score: c.score,
      path: c.path,
    })),
  };
}
