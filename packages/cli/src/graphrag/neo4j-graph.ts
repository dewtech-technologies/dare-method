/**
 * Neo4jGraph — knowledge graph backend that talks to a Neo4j server via the
 * official HTTP API (`/db/{database}/tx/commit`).
 *
 * No external Node driver is pulled in — we use the global `fetch` available
 * in Node 18+ and Bolt is not required for our usage. This trades a bit of
 * latency for zero install footprint, which fits the DARE "single package"
 * goal.
 *
 * Activated by `dare-graph.yml`:
 *
 *   backend: neo4j
 *   neo4j:
 *     url: http://localhost:7474
 *     database: dare
 *     username: neo4j
 *     password: dare-secret
 *     # Or:
 *     # auth: bearer <token>
 */
import type {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  SearchResult,
  GraphStatistics,
} from './knowledge-graph.js';

export interface Neo4jConfig {
  url: string;
  database?: string;
  username?: string;
  password?: string;
  /** Optional pre-built Authorization header (overrides username/password). */
  auth?: string;
}

export class Neo4jGraph implements KnowledgeGraph {
  private endpoint: string;
  private headers: Record<string, string>;
  private nodeCache = new Map<string, GraphNode>();
  private edgeCache = new Map<string, GraphEdge>();

  constructor(private readonly config: Neo4jConfig) {
    if (!config.url) {
      throw new Error('Neo4jGraph: `url` is required.');
    }
    const database = config.database ?? 'neo4j';
    this.endpoint = `${stripTrailingSlash(config.url)}/db/${encodeURIComponent(database)}/tx/commit`;
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (config.auth) {
      this.headers.Authorization = config.auth;
    } else if (config.username && config.password) {
      const token = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      this.headers.Authorization = `Basic ${token}`;
    }
  }

  async init(): Promise<void> {
    // Verify connectivity + ensure indexes exist (idempotent).
    await this.runMany([
      { statement: 'CREATE CONSTRAINT dare_node_id IF NOT EXISTS FOR (n:DareNode) REQUIRE n.id IS UNIQUE' },
      { statement: 'CREATE INDEX dare_node_type IF NOT EXISTS FOR (n:DareNode) ON (n.type)' },
    ]);
  }

  // ─── Nodes ────────────────────────────────────────────────────────────────

  addNode(node: GraphNode): void {
    const now = new Date().toISOString();
    const params = {
      id: node.id,
      type: node.type,
      label: node.label,
      description: node.description ?? null,
      metadata: JSON.stringify(node.metadata ?? {}),
      createdAt: node.createdAt ?? now,
      updatedAt: now,
    };
    void this.runMany([
      {
        statement:
          'MERGE (n:DareNode {id:$id}) ' +
          'ON CREATE SET n.type=$type,n.label=$label,n.description=$description,n.metadata=$metadata,n.created_at=$createdAt,n.updated_at=$updatedAt ' +
          'ON MATCH SET n.label=$label,n.description=$description,n.metadata=$metadata,n.updated_at=$updatedAt',
        parameters: params,
      },
    ]);
    this.nodeCache.set(node.id, { ...node, createdAt: params.createdAt, updatedAt: params.updatedAt });
  }

  getNode(id: string): GraphNode | null {
    return this.nodeCache.get(id) ?? null;
  }

  queryNodes(type?: NodeType, limit = 20): GraphNode[] {
    const all = type
      ? [...this.nodeCache.values()].filter((n) => n.type === type)
      : [...this.nodeCache.values()];
    return all.slice(0, limit);
  }

  searchNodes(query: string, limit = 10): SearchResult[] {
    const q = query.toLowerCase();
    const out: SearchResult[] = [];
    for (const node of this.nodeCache.values()) {
      const haystack = `${node.label} ${node.description ?? ''}`.toLowerCase();
      if (haystack.includes(q)) {
        out.push({ node, score: 1, snippet: node.description?.slice(0, 150) });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  deleteNode(id: string): void {
    void this.runMany([
      { statement: 'MATCH (n:DareNode {id:$id}) DETACH DELETE n', parameters: { id } },
    ]);
    this.nodeCache.delete(id);
    for (const [edgeId, e] of this.edgeCache) {
      if (e.sourceId === id || e.targetId === id) this.edgeCache.delete(edgeId);
    }
  }

  // ─── Edges ────────────────────────────────────────────────────────────────

  addEdge(edge: GraphEdge): void {
    const params = {
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      type: edge.type,
      weight: edge.weight ?? 1,
      metadata: JSON.stringify(edge.metadata ?? {}),
    };
    void this.runMany([
      {
        statement:
          'MATCH (s:DareNode {id:$sourceId}),(t:DareNode {id:$targetId}) ' +
          'MERGE (s)-[r:DARE_EDGE {id:$id}]->(t) ' +
          'SET r.type=$type,r.weight=$weight,r.metadata=$metadata',
        parameters: params,
      },
    ]);
    this.edgeCache.set(edge.id, { ...edge, weight: params.weight, metadata: edge.metadata ?? {} });
  }

  getEdges(nodeId: string, direction: 'out' | 'in' | 'both' = 'both'): GraphEdge[] {
    return [...this.edgeCache.values()].filter((e) => {
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
      for (const e of this.edgeCache.values()) {
        if (e.sourceId !== id || e.type !== 'depends_on') continue;
        const target = this.nodeCache.get(e.targetId);
        if (target) {
          out.push(target);
          traverse(e.targetId, d - 1);
        }
      }
    };
    traverse(nodeId, depth);
    return out;
  }

  getStatistics(): GraphStatistics {
    const nodesByType = {} as Record<NodeType, number>;
    const edgesByType = {} as Record<EdgeType, number>;
    for (const n of this.nodeCache.values()) {
      nodesByType[n.type] = (nodesByType[n.type] ?? 0) + 1;
    }
    for (const e of this.edgeCache.values()) {
      edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;
    }
    return {
      totalNodes: this.nodeCache.size,
      totalEdges: this.edgeCache.size,
      nodesByType,
      edgesByType,
    };
  }

  exportToJson(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: [...this.nodeCache.values()],
      edges: [...this.edgeCache.values()],
    };
  }

  importFromJson(data: { nodes: GraphNode[]; edges: GraphEdge[] }): void {
    for (const n of data.nodes) this.addNode(n);
    for (const e of data.edges) this.addEdge(e);
  }

  close(): void {
    // HTTP API has no persistent connection; cache is GC-collected on exit.
  }

  // ─── Internal HTTP plumbing ──────────────────────────────────────────────

  private async runMany(
    statements: Array<{ statement: string; parameters?: Record<string, unknown> }>,
  ): Promise<void> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ statements }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Neo4j ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
    }

    const payload = (await res.json()) as { errors?: Array<{ code: string; message: string }> };
    if (payload.errors && payload.errors.length > 0) {
      throw new Error(`Neo4j: ${payload.errors.map((e) => `${e.code} — ${e.message}`).join('; ')}`);
    }
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
