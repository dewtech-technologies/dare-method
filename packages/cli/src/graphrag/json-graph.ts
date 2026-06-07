/**
 * JsonGraph — minimal in-memory knowledge graph persisted to a JSON file.
 *
 * Useful for projects that want zero native dependencies (no sql.js).
 * Trade-offs vs SQLite: no FTS, no SQL queries, full file rewrite on each
 * mutation. Good enough for small DARE projects (<10k nodes).
 */
import path from 'path';
import fs from 'fs-extra';
import type {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  SearchResult,
  GraphStatistics,
} from './knowledge-graph.js';
import { emptyEdgesByType, emptyNodesByType } from './types.js';
import type {
  CodeSymbolNode,
  TraverseOptions,
  TraverseResult,
  LocateOptions,
  LocateResult,
} from './types.js';
import { traverse as traverseFn, locate as locateFn } from './traverse.js';

interface Persisted {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class JsonGraph implements KnowledgeGraph {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  /** qualifiedName → node id (code_symbol only) */
  private qnIndex = new Map<string, string>();

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await fs.ensureDir(path.dirname(this.filePath));
    if (await fs.pathExists(this.filePath)) {
      try {
        const data = (await fs.readJson(this.filePath)) as Persisted;
        for (const n of data.nodes ?? []) this.nodes.set(n.id, n);
        for (const e of data.edges ?? []) this.edges.set(e.id, e);
        this.rebuildQnIndex();
      } catch {
        // corrupt file — start fresh, but keep a backup
        await fs.copy(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
      }
    }
    this.flushSync();
  }

  // ─── Nodes ────────────────────────────────────────────────────────────────

  addNode(node: GraphNode): void {
    const now = new Date().toISOString();
    const existing = this.nodes.get(node.id);
    const merged: GraphNode = existing
      ? {
          ...existing,
          label: node.label,
          description: node.description,
          metadata: node.metadata ?? existing.metadata ?? {},
          updatedAt: now,
        }
      : {
          ...node,
          metadata: node.metadata ?? {},
          createdAt: node.createdAt ?? now,
          updatedAt: now,
        };
    this.nodes.set(node.id, merged);
    this.indexCodeSymbol(merged);
    this.flushSync();
  }

  getNode(id: string): GraphNode | null {
    return this.nodes.get(id) ?? null;
  }

  queryNodes(type?: NodeType, limit = 20): GraphNode[] {
    const all = type
      ? [...this.nodes.values()].filter((n) => n.type === type)
      : [...this.nodes.values()];
    return all.slice(0, limit);
  }

  searchNodes(query: string, limit = 10): SearchResult[] {
    const q = query.toLowerCase();
    const out: SearchResult[] = [];
    for (const node of this.nodes.values()) {
      const haystack = `${node.label} ${node.description ?? ''}`.toLowerCase();
      if (haystack.includes(q)) {
        out.push({
          node,
          score: 1,
          snippet: node.description?.slice(0, 150),
        });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  deleteNode(id: string): void {
    const removed = this.nodes.get(id);
    if (removed?.type === 'code_symbol') {
      const qn = String(removed.metadata?.qualifiedName ?? '');
      if (qn) this.qnIndex.delete(qn);
    }
    this.nodes.delete(id);
    for (const [edgeId, e] of this.edges) {
      if (e.sourceId === id || e.targetId === id) this.edges.delete(edgeId);
    }
    this.flushSync();
  }

  // ─── Edges ────────────────────────────────────────────────────────────────

  addEdge(edge: GraphEdge): void {
    const existing = this.edges.get(edge.id);
    const merged: GraphEdge = existing
      ? { ...existing, type: edge.type, weight: edge.weight ?? existing.weight ?? 1, metadata: edge.metadata ?? existing.metadata ?? {} }
      : { ...edge, weight: edge.weight ?? 1, metadata: edge.metadata ?? {} };
    this.edges.set(edge.id, merged);
    this.flushSync();
  }

  getEdges(nodeId: string, direction: 'out' | 'in' | 'both' = 'both'): GraphEdge[] {
    return [...this.edges.values()].filter((e) => {
      if (direction === 'out') return e.sourceId === nodeId;
      if (direction === 'in') return e.targetId === nodeId;
      return e.sourceId === nodeId || e.targetId === nodeId;
    });
  }

  getNodeDependencies(nodeId: string, depth = 3): GraphNode[] {
    const visited = new Set<string>();
    const out: GraphNode[] = [];
    const traverse = (id: string, d: number): void => {
      if (d === 0 || visited.has(id)) return;
      visited.add(id);
      for (const e of this.edges.values()) {
        if (e.sourceId !== id || e.type !== 'depends_on') continue;
        const target = this.nodes.get(e.targetId);
        if (target) {
          out.push(target);
          traverse(e.targetId, d - 1);
        }
      }
    };
    traverse(nodeId, depth);
    return out;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  getStatistics(): GraphStatistics {
    const nodesByType = emptyNodesByType();
    const edgesByType = emptyEdgesByType();
    for (const n of this.nodes.values()) {
      nodesByType[n.type] += 1;
    }
    for (const e of this.edges.values()) {
      edgesByType[e.type] += 1;
    }
    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.size,
      nodesByType,
      edgesByType,
    };
  }

  exportToJson(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return { nodes: [...this.nodes.values()], edges: [...this.edges.values()] };
  }

  importFromJson(data: { nodes: GraphNode[]; edges: GraphEdge[] }): void {
    for (const n of data.nodes) this.addNode(n);
    for (const e of data.edges) this.addEdge(e);
    this.rebuildQnIndex();
  }

  traverse(opts: TraverseOptions): TraverseResult {
    return traverseFn(this, opts);
  }

  locate(seedQuery: string, opts?: LocateOptions): LocateResult {
    return locateFn(this, seedQuery, opts);
  }

  findByQualifiedName(qn: string): CodeSymbolNode | null {
    const normalized = qn.startsWith('code_symbol:') ? qn.slice('code_symbol:'.length) : qn;
    const id = this.qnIndex.get(normalized);
    if (id) {
      const node = this.nodes.get(id);
      if (node?.type === 'code_symbol') return node as CodeSymbolNode;
    }
    const directId = `code_symbol:${normalized}`;
    const direct = this.nodes.get(directId);
    if (direct?.type === 'code_symbol') return direct as CodeSymbolNode;
    return null;
  }

  close(): void {
    // Synchronous flush is performed on every mutation; no shutdown work.
  }

  private indexCodeSymbol(node: GraphNode): void {
    if (node.type !== 'code_symbol') return;
    const qn = String(node.metadata?.qualifiedName ?? '');
    if (qn) this.qnIndex.set(qn, node.id);
  }

  private rebuildQnIndex(): void {
    this.qnIndex.clear();
    for (const n of this.nodes.values()) {
      this.indexCodeSymbol(n);
    }
  }

  private flushSync(): void {
    const data: Persisted = {
      nodes: [...this.nodes.values()],
      edges: [...this.edges.values()],
    };
    try {
      fs.writeJsonSync(this.filePath, data, { spaces: 2 });
    } catch {
      // best-effort persistence
    }
  }
}
