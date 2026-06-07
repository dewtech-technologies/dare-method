/**
 * Common interface implemented by every backend (SQLite, JSON, Neo4j…).
 *
 * Methods mirror the SQLite implementation so callers don't care which
 * backend is in use. Backends should:
 *  - upsert by `id` on addNode / addEdge
 *  - persist incrementally (or on close, when that's safer)
 *  - never throw on unknown ids — return `null` / empty arrays
 */
import type {
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  SearchResult,
  GraphStatistics,
  TraverseOptions,
  TraverseResult,
  LocateOptions,
  LocateResult,
  CodeSymbolNode,
} from './types.js';

export interface KnowledgeGraph {
  init(): Promise<void>;

  addNode(node: GraphNode): void;
  getNode(id: string): GraphNode | null;
  queryNodes(type?: NodeType, limit?: number): GraphNode[];
  searchNodes(query: string, limit?: number): SearchResult[];
  deleteNode(id: string): void;

  addEdge(edge: GraphEdge): void;
  getEdges(nodeId: string, direction?: 'out' | 'in' | 'both'): GraphEdge[];
  getNodeDependencies(nodeId: string, depth?: number): GraphNode[];

  getStatistics(): GraphStatistics;

  traverse(opts: TraverseOptions): TraverseResult;
  locate(seedQuery: string, opts?: LocateOptions): LocateResult;
  findByQualifiedName(qn: string): CodeSymbolNode | null;

  exportToJson(): { nodes: GraphNode[]; edges: GraphEdge[] };
  importFromJson(data: { nodes: GraphNode[]; edges: GraphEdge[] }): void;

  /** Optional — Neo4j batches writes and flushes on demand. */
  flush?(): Promise<void>;

  close(): void | Promise<void>;
}

export type {
  NodeType,
  EdgeType,
  GraphNode,
  GraphEdge,
  SearchResult,
  GraphStatistics,
  TraverseOptions,
  TraverseResult,
  LocateOptions,
  LocateResult,
  CodeSymbolNode,
};
