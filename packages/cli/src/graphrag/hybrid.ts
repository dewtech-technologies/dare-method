import type { Embedder } from './embeddings.js';
import type { GraphEdge, GraphNode, KnowledgeGraph, SearchResult } from './knowledge-graph.js';
import { cosineTopK } from './vector-search.js';

const DEFAULT_K = 10;
const DEFAULT_RRF_K = 60;
const DEFAULT_GRAPH_HOPS = 2;
const DEFAULT_GRAPH_FANOUT = 50;

export interface HybridOptions {
  readonly k?: number;
  readonly rrfK?: number;
}

interface LoadedVector {
  readonly id: string;
  readonly v: Float32Array;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}

function normalizeRrfK(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : fallback;
}

function toFloat32Vector(value: unknown): Float32Array | null {
  if (value instanceof Float32Array) {
    return value.length > 0 ? value : null;
  }
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const numeric = value.map((item) => Number(item));
  if (numeric.some((item) => !Number.isFinite(item))) {
    return null;
  }
  return new Float32Array(numeric);
}

function extractVectorFromNode(node: GraphNode): Float32Array | null {
  const directVector = (node as GraphNode & { vector?: unknown }).vector;
  const metadataVector = (node.metadata as Record<string, unknown> | undefined)?.vector;
  return toFloat32Vector(directVector) ?? toFloat32Vector(metadataVector);
}

function loadVectors(graph: KnowledgeGraph): LoadedVector[] {
  const fromLoader = graph.loadVectors();
  if (fromLoader.length > 0) {
    return fromLoader
      .map((entry) => ({
        id: entry.id,
        v: toFloat32Vector(entry.v),
      }))
      .filter((entry): entry is LoadedVector => entry.v !== null);
  }

  const { nodes } = graph.exportToJson();
  return nodes
    .map((node) => ({
      id: node.id,
      v: extractVectorFromNode(node),
    }))
    .filter((entry): entry is LoadedVector => entry.v !== null);
}

function buildNodeIndex(graph: KnowledgeGraph): Map<string, GraphNode> {
  const { nodes } = graph.exportToJson();
  return new Map(nodes.map((node) => [node.id, node]));
}

function buildAdjacency(edges: readonly GraphEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    const sourceNeighbors = adjacency.get(edge.sourceId) ?? new Set<string>();
    sourceNeighbors.add(edge.targetId);
    adjacency.set(edge.sourceId, sourceNeighbors);

    const targetNeighbors = adjacency.get(edge.targetId) ?? new Set<string>();
    targetNeighbors.add(edge.sourceId);
    adjacency.set(edge.targetId, targetNeighbors);
  }
  return adjacency;
}

function computeHopDistances(
  seedId: string,
  edges: readonly GraphEdge[],
  maxHops: number,
): Map<string, number> {
  const adjacency = buildAdjacency(edges);
  const distances = new Map<string, number>([[seedId, 0]]);
  const queue: Array<{ id: string; hops: number }> = [{ id: seedId, hops: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.hops >= maxHops) continue;

    const neighbors = adjacency.get(current.id);
    if (!neighbors) continue;
    for (const neighborId of neighbors) {
      const nextHops = current.hops + 1;
      const previous = distances.get(neighborId);
      if (previous !== undefined && previous <= nextHops) continue;
      distances.set(neighborId, nextHops);
      queue.push({ id: neighborId, hops: nextHops });
    }
  }

  return distances;
}

function buildGraphRankedList(
  graph: KnowledgeGraph,
  nodeIndex: ReadonlyMap<string, GraphNode>,
  seedIds: readonly string[],
  limit: number,
): SearchResult[] {
  const rankedNodeIds: string[] = [];
  const seen = new Set<string>();

  for (const seedId of seedIds) {
    const traversed = graph.traverse({
      seedNodeIds: [seedId],
      maxHops: DEFAULT_GRAPH_HOPS,
      maxFanout: DEFAULT_GRAPH_FANOUT,
      direction: 'both',
    });
    const distances = computeHopDistances(seedId, traversed.edges, DEFAULT_GRAPH_HOPS);
    const ordered = traversed.nodes
      .map((node) => ({ id: node.id, hops: distances.get(node.id) }))
      .filter((entry): entry is { id: string; hops: number } => entry.hops !== undefined)
      .sort((left, right) => {
        if (left.hops !== right.hops) return left.hops - right.hops;
        return left.id.localeCompare(right.id);
      });

    for (const entry of ordered) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      rankedNodeIds.push(entry.id);
      if (rankedNodeIds.length >= limit) break;
    }

    if (rankedNodeIds.length >= limit) break;
  }

  return rankedNodeIds
    .map((id) => nodeIndex.get(id) ?? graph.getNode(id))
    .filter((node): node is GraphNode => node !== null)
    .map((node) => ({
      node,
      score: 1,
    }));
}

function fuseByRrf(
  rankedLists: readonly SearchResult[][],
  limit: number,
  rrfK: number,
): SearchResult[] {
  const byNodeId = new Map<string, { node: GraphNode; score: number; snippet?: string }>();

  for (const list of rankedLists) {
    for (let index = 0; index < list.length; index++) {
      const ranked = list[index];
      if (!ranked) continue;

      const rank = index + 1;
      const contribution = 1 / (rrfK + rank);
      const existing = byNodeId.get(ranked.node.id);
      if (!existing) {
        byNodeId.set(ranked.node.id, {
          node: ranked.node,
          score: contribution,
          snippet: ranked.snippet,
        });
        continue;
      }
      existing.score += contribution;
      if (!existing.snippet && ranked.snippet) existing.snippet = ranked.snippet;
    }
  }

  return [...byNodeId.values()]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.node.id.localeCompare(right.node.id);
    })
    .slice(0, limit)
    .map((entry) => ({
      node: entry.node,
      score: entry.score,
      snippet: entry.snippet,
    }));
}

export async function hybridSearch(
  graph: KnowledgeGraph,
  embedder: Embedder | null,
  query: string,
  opts: HybridOptions = {},
): Promise<SearchResult[]> {
  const k = normalizeLimit(opts.k, DEFAULT_K);
  if (k === 0) return [];

  const keywordRanked = graph.searchNodes(query, k);
  if (embedder === null) {
    return keywordRanked;
  }

  const nodeIndex = buildNodeIndex(graph);

  let vectorRanked: SearchResult[] = [];
  try {
    const vectors = loadVectors(graph);
    if (vectors.length > 0) {
      const queryVector = await embedder.embed(query);
      vectorRanked = cosineTopK(queryVector, vectors, k)
        .map((result) => nodeIndex.get(result.id) ?? graph.getNode(result.id))
        .filter((node): node is GraphNode => node !== null)
        .map((node) => ({
          node,
          score: 1,
        }));
    }
  } catch {
    vectorRanked = [];
  }

  const graphSeedIds = [
    ...new Set([...keywordRanked.map((result) => result.node.id), ...vectorRanked.map((result) => result.node.id)]),
  ];
  const graphRanked =
    graphSeedIds.length > 0 ? buildGraphRankedList(graph, nodeIndex, graphSeedIds, k) : [];

  const rankedLists = [keywordRanked, vectorRanked, graphRanked].filter(
    (list) => list.length > 0,
  );
  if (rankedLists.length === 0) {
    return [];
  }

  return fuseByRrf(rankedLists, k, normalizeRrfK(opts.rrfK, DEFAULT_RRF_K));
}
