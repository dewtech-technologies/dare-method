/**
 * Neo4jGraph — knowledge graph backend that talks to a Neo4j server via the
 * official HTTP API (`/db/{database}/tx/commit`).
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
import {
  ALL_EDGE_TYPES,
  ALL_NODE_TYPES,
  emptyEdgesByType,
  emptyNodesByType,
} from './types.js';
import type {
  CodeSymbolNode,
  TraverseOptions,
  TraverseResult,
  LocateOptions,
  LocateResult,
} from './types.js';
import { traverse as traverseFn, locate as locateFn } from './traverse.js';

const FLUSH_THRESHOLD = 500;

interface PendingStatement {
  statement: string;
  parameters?: Record<string, unknown>;
}

export class Neo4jQueryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(`Neo4j[${code}]: ${message}`);
    this.name = 'Neo4jQueryError';
  }
}

export interface Neo4jConfig {
  url: string;
  database?: string;
  username?: string;
  password?: string;
  auth?: string;
  /** Must be true to use the neo4j backend (RF-09 experimental gate). */
  experimental?: boolean;
}

interface CypherResponse {
  results?: Array<{
    data?: Array<{ row: unknown[] }>;
  }>;
  errors?: Array<{ code: string; message: string }>;
}

const NODE_TYPES = new Set<string>(ALL_NODE_TYPES);
const EDGE_TYPES = new Set<string>(ALL_EDGE_TYPES);

export function parseNodeFromRecord(row: unknown[]): GraphNode {
  const [id, type, label, description, metadata, createdAt, updatedAt] = row;
  if (typeof id !== 'string' || !id) {
    throw new Neo4jQueryError('SHAPE', 'node id must be a non-empty string');
  }
  if (typeof type !== 'string' || !NODE_TYPES.has(type)) {
    throw new Neo4jQueryError('SHAPE', `invalid node type: ${String(type)}`);
  }
  if (typeof label !== 'string' || !label) {
    throw new Neo4jQueryError('SHAPE', 'node label must be a non-empty string');
  }
  let meta: Record<string, unknown> = {};
  if (typeof metadata === 'string' && metadata) {
    try {
      meta = JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      meta = {};
    }
  } else if (metadata && typeof metadata === 'object') {
    meta = metadata as Record<string, unknown>;
  }
  return {
    id,
    type: type as NodeType,
    label,
    description: typeof description === 'string' ? description : undefined,
    metadata: meta,
    createdAt: typeof createdAt === 'string' ? createdAt : undefined,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : undefined,
  };
}

export function parseEdgeFromRecord(row: unknown[]): GraphEdge {
  const [id, sourceId, targetId, type, weight, metadata] = row;
  if (typeof id !== 'string' || !id) {
    throw new Neo4jQueryError('SHAPE', 'edge id must be a non-empty string');
  }
  if (typeof sourceId !== 'string' || typeof targetId !== 'string') {
    throw new Neo4jQueryError('SHAPE', 'edge endpoints must be strings');
  }
  if (typeof type !== 'string' || !EDGE_TYPES.has(type)) {
    throw new Neo4jQueryError('SHAPE', `invalid edge type: ${String(type)}`);
  }
  let meta: Record<string, unknown> = {};
  if (typeof metadata === 'string' && metadata) {
    try {
      meta = JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      meta = {};
    }
  }
  return {
    id,
    sourceId,
    targetId,
    type: type as EdgeType,
    weight: typeof weight === 'number' ? weight : 1,
    metadata: meta,
  };
}

export class Neo4jGraph implements KnowledgeGraph {
  private endpoint: string;
  private headers: Record<string, string>;
  private nodeCache = new Map<string, GraphNode>();
  private edgeCache = new Map<string, GraphEdge>();
  private pendingWrites: PendingStatement[] = [];

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
    await this.runMany([
      { statement: 'CREATE CONSTRAINT dare_node_id IF NOT EXISTS FOR (n:DareNode) REQUIRE n.id IS UNIQUE' },
      { statement: 'CREATE INDEX dare_node_type IF NOT EXISTS FOR (n:DareNode) ON (n.type)' },
    ]);
    await this.hydrateFromServer();
  }

  private async hydrateFromServer(): Promise<void> {
    const nodeRows = await this.runRead<unknown[]>(
      'MATCH (n:DareNode) RETURN n.id, n.type, n.label, n.description, n.metadata, n.created_at, n.updated_at LIMIT $limit',
      { limit: 10000 },
    );
    for (const row of nodeRows) {
      const node = parseNodeFromRecord(row);
      this.nodeCache.set(node.id, node);
    }

    const edgeRows = await this.runRead<unknown[]>(
      'MATCH (s:DareNode)-[r:DARE_EDGE]->(t:DareNode) RETURN r.id, s.id, t.id, r.type, r.weight, r.metadata LIMIT $limit',
      { limit: 10000 },
    );
    for (const row of edgeRows) {
      const edge = parseEdgeFromRecord(row);
      this.edgeCache.set(edge.id, edge);
    }
  }

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
    this.enqueue({
      statement:
        'MERGE (n:DareNode {id:$id}) ' +
        'ON CREATE SET n.type=$type,n.label=$label,n.description=$description,n.metadata=$metadata,n.created_at=$createdAt,n.updated_at=$updatedAt ' +
        'ON MATCH SET n.label=$label,n.description=$description,n.metadata=$metadata,n.updated_at=$updatedAt',
      parameters: params,
    });
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
    this.enqueue({
      statement: 'MATCH (n:DareNode {id:$id}) DETACH DELETE n',
      parameters: { id },
    });
    this.nodeCache.delete(id);
    for (const [edgeId, e] of this.edgeCache) {
      if (e.sourceId === id || e.targetId === id) this.edgeCache.delete(edgeId);
    }
  }

  addEdge(edge: GraphEdge): void {
    const params = {
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      type: edge.type,
      weight: edge.weight ?? 1,
      metadata: JSON.stringify(edge.metadata ?? {}),
    };
    this.enqueue({
      statement:
        'MATCH (s:DareNode {id:$sourceId}),(t:DareNode {id:$targetId}) ' +
        'MERGE (s)-[r:DARE_EDGE {id:$id}]->(t) ' +
        'SET r.type=$type,r.weight=$weight,r.metadata=$metadata',
      parameters: params,
    });
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
    const walk = (id: string, d: number): void => {
      if (d === 0 || visited.has(id)) return;
      visited.add(id);
      for (const e of this.edgeCache.values()) {
        if (e.sourceId !== id || e.type !== 'depends_on') continue;
        const target = this.nodeCache.get(e.targetId);
        if (target) {
          out.push(target);
          walk(e.targetId, d - 1);
        }
      }
    };
    walk(nodeId, depth);
    return out;
  }

  getStatistics(): GraphStatistics {
    const nodesByType = emptyNodesByType();
    const edgesByType = emptyEdgesByType();
    for (const n of this.nodeCache.values()) nodesByType[n.type] += 1;
    for (const e of this.edgeCache.values()) edgesByType[e.type] += 1;
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

  traverse(opts: TraverseOptions): TraverseResult {
    return traverseFn(this, opts);
  }

  locate(seedQuery: string, opts?: LocateOptions): LocateResult {
    return locateFn(this, seedQuery, opts);
  }

  findByQualifiedName(qn: string): CodeSymbolNode | null {
    const normalized = qn.startsWith('code_symbol:') ? qn.slice('code_symbol:'.length) : qn;
    const direct = this.nodeCache.get(`code_symbol:${normalized}`);
    if (direct?.type === 'code_symbol') return direct as CodeSymbolNode;
    for (const node of this.nodeCache.values()) {
      if (node.type === 'code_symbol' && node.metadata?.qualifiedName === normalized) {
        return node as CodeSymbolNode;
      }
    }
    return null;
  }

  async flush(): Promise<void> {
    if (this.pendingWrites.length === 0) return;
    const batch = this.pendingWrites;
    this.pendingWrites = [];
    try {
      await this.runMany(batch);
    } catch (err) {
      this.pendingWrites = batch.concat(this.pendingWrites);
      throw err;
    }
  }

  async close(): Promise<void> {
    await this.flush();
  }

  private enqueue(stmt: PendingStatement): void {
    this.pendingWrites.push(stmt);
    if (this.pendingWrites.length > FLUSH_THRESHOLD) {
      throw new Neo4jQueryError(
        'QUEUE_OVERFLOW',
        `pending write queue exceeded ${FLUSH_THRESHOLD} statements — call flush() before adding more`,
      );
    }
  }

  private async runRead<T = unknown[]>(
    statement: string,
    parameters: Record<string, unknown> = {},
  ): Promise<T[]> {
    const payload = await this.postCypher([{ statement, parameters }]);
    const rows = payload.results?.[0]?.data ?? [];
    return rows.map((d) => d.row as T);
  }

  private async runMany(
    statements: Array<{ statement: string; parameters?: Record<string, unknown> }>,
  ): Promise<void> {
    await this.postCypher(statements);
  }

  private async postCypher(
    statements: Array<{ statement: string; parameters?: Record<string, unknown> }>,
  ): Promise<CypherResponse> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ statements }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Neo4jQueryError(String(res.status), `${res.statusText}: ${body.slice(0, 200)}`);
    }

    const payload = (await res.json()) as CypherResponse;
    if (payload.errors && payload.errors.length > 0) {
      const first = payload.errors[0]!;
      throw new Neo4jQueryError(first.code, first.message);
    }
    return payload;
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
