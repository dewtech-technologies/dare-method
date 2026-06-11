import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { createHash } from 'node:crypto';
import path from 'path';
import fs from 'fs-extra';
import type { KnowledgeGraph, VectorRow } from './knowledge-graph.js';
import type {
  GraphNode, GraphEdge, NodeType, EdgeType,
  SearchResult, GraphStatistics,
  CodeSymbolNode, TraverseOptions, TraverseResult,
  LocateOptions, LocateResult,
} from './types.js';
import { emptyEdgesByType, emptyNodesByType } from './types.js';
import { traverse as traverseFn, locate as locateFn } from './traverse.js';
import { EmbeddingModelMissingError, type Embedder, loadEmbedder } from './embeddings.js';
import { hybridSearch } from './hybrid.js';
import { parseSemanticConfig } from '../verification/config.js';

export type { VectorRow } from './knowledge-graph.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  vector BLOB,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  metadata TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
`;

type SqlParam = string | number | Uint8Array | null;
const PATH_SEED_HINT_RE = /[\\/]|::|\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|php|rb|java|kt|cs)$/i;

interface ResolvedSemanticConfig {
  readonly enabled: boolean;
  readonly model: string;
  readonly modelHash: string;
  readonly rrfK: number;
}

export class GraphRAG implements KnowledgeGraph {
  private db!: Database;
  private dbPath: string;
  private SQL!: SqlJsStatic;
  private semanticConfigCache: ResolvedSemanticConfig | null = null;
  private embedderPromise: Promise<Embedder | null> | null = null;
  private semanticFallbackLogged = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    this.SQL = await initSqlJs();
    fs.ensureDirSync(path.dirname(this.dbPath));

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
    } else {
      this.db = new this.SQL.Database();
    }

    this.db.run(SCHEMA_SQL);
    this.ensureVectorColumn();
    this.save();
  }

  private save(): void {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  private run(sql: string, params: SqlParam[] = []): void {
    this.db.run(sql, params);
    this.save();
  }

  private query<T>(sql: string, params: SqlParam[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }

  private queryOne<T>(sql: string, params: SqlParam[] = []): T | null {
    const results = this.query<T>(sql, params);
    return results[0] ?? null;
  }

  private ensureVectorColumn(): void {
    const columns = this.query<{ name: string }>('PRAGMA table_info(nodes)');
    const hasVectorColumn = columns.some((column) => column.name === 'vector');
    if (!hasVectorColumn) {
      this.db.run('ALTER TABLE nodes ADD COLUMN vector BLOB');
    }
  }

  // ─── Node Operations ───────────────────────────────────────────────────────

  addNode(node: GraphNode): void {
    const existing = this.queryOne('SELECT id FROM nodes WHERE id = ?', [node.id]);
    const vectorBlob = node.vector === undefined ? undefined : this.serializeVector(node.vector);
    if (existing) {
      if (vectorBlob === undefined) {
        this.run(
          `UPDATE nodes SET label = ?, description = ?, metadata = ?, updated_at = datetime('now') WHERE id = ?`,
          [node.label, node.description || null, JSON.stringify(node.metadata || {}), node.id]
        );
      } else {
        this.run(
          `UPDATE nodes SET label = ?, description = ?, vector = ?, metadata = ?, updated_at = datetime('now') WHERE id = ?`,
          [node.label, node.description || null, vectorBlob, JSON.stringify(node.metadata || {}), node.id]
        );
      }
    } else {
      this.run(
        `INSERT INTO nodes (id, type, label, description, vector, metadata) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          node.id,
          node.type,
          node.label,
          node.description || null,
          vectorBlob ?? null,
          JSON.stringify(node.metadata || {}),
        ]
      );
    }
  }

  getNode(id: string): GraphNode | null {
    const row = this.queryOne<Record<string, unknown>>('SELECT * FROM nodes WHERE id = ?', [id]);
    if (!row) return null;
    return this.rowToNode(row);
  }

  queryNodes(type?: NodeType, limit = 20): GraphNode[] {
    const rows = type
      ? this.query<Record<string, unknown>>('SELECT * FROM nodes WHERE type = ? LIMIT ?', [type, limit])
      : this.query<Record<string, unknown>>('SELECT * FROM nodes LIMIT ?', [limit]);
    return rows.map((r) => this.rowToNode(r));
  }

  searchNodes(queryStr: string, limit = 10): SearchResult[] {
    return this.keywordSearchNodes(queryStr, limit);
  }

  async searchNodesHybrid(queryStr: string, limit = 10): Promise<SearchResult[]> {
    const keywordRanked = this.keywordSearchNodes(queryStr, limit);
    const semantic = this.getSemanticConfig();
    if (!semantic.enabled) {
      return keywordRanked;
    }

    const embedder = await this.loadEmbedderLazy(semantic);
    if (!embedder) {
      return keywordRanked;
    }

    try {
      const keywordView = this.createSearchOverrideView((query, searchLimit = 10) =>
        this.keywordSearchNodes(query, searchLimit),
      );
      return await hybridSearch(keywordView, embedder, queryStr, { k: limit, rrfK: semantic.rrfK });
    } catch (error) {
      this.logSemanticFallback(error);
      return keywordRanked;
    }
  }

  private keywordSearchNodes(queryStr: string, limit = 10): SearchResult[] {
    // Simple LIKE-based search (sql.js doesn't support FTS5)
    const pattern = `%${queryStr.toLowerCase()}%`;
    const rows = this.query<Record<string, unknown>>(
      `SELECT * FROM nodes WHERE lower(label) LIKE ? OR lower(description) LIKE ? LIMIT ?`,
      [pattern, pattern, limit]
    );
    return rows.map((row) => ({
      node: this.rowToNode(row),
      score: 1.0,
      snippet: (row['description'] as string)?.substring(0, 150),
    }));
  }

  deleteNode(id: string): void {
    this.run('DELETE FROM edges WHERE source_id = ? OR target_id = ?', [id, id]);
    this.run('DELETE FROM nodes WHERE id = ?', [id]);
  }

  // ─── Edge Operations ───────────────────────────────────────────────────────

  addEdge(edge: GraphEdge): void {
    const existing = this.queryOne('SELECT id FROM edges WHERE id = ?', [edge.id]);
    if (existing) {
      this.run(
        `UPDATE edges SET type = ?, weight = ?, metadata = ? WHERE id = ?`,
        [edge.type, edge.weight ?? 1.0, JSON.stringify(edge.metadata || {}), edge.id]
      );
    } else {
      this.run(
        `INSERT INTO edges (id, source_id, target_id, type, weight, metadata) VALUES (?, ?, ?, ?, ?, ?)`,
        [edge.id, edge.sourceId, edge.targetId, edge.type, edge.weight ?? 1.0, JSON.stringify(edge.metadata || {})]
      );
    }
  }

  getEdges(nodeId: string, direction: 'out' | 'in' | 'both' = 'both'): GraphEdge[] {
    let sql = '';
    let params: string[];
    if (direction === 'out') { sql = 'SELECT * FROM edges WHERE source_id = ?'; params = [nodeId]; }
    else if (direction === 'in') { sql = 'SELECT * FROM edges WHERE target_id = ?'; params = [nodeId]; }
    else { sql = 'SELECT * FROM edges WHERE source_id = ? OR target_id = ?'; params = [nodeId, nodeId]; }

    const rows = this.query<Record<string, unknown>>(sql, params);
    return rows.map((r) => this.rowToEdge(r));
  }

  getNodeDependencies(nodeId: string, depth = 3): GraphNode[] {
    const visited = new Set<string>();
    const result: GraphNode[] = [];

    const traverse = (id: string, currentDepth: number) => {
      if (currentDepth === 0 || visited.has(id)) return;
      visited.add(id);

      const edges = this.query<Record<string, unknown>>(
        "SELECT * FROM edges WHERE source_id = ? AND type = 'depends_on'",
        [id]
      );

      for (const edge of edges) {
        const targetId = edge['target_id'] as string;
        const node = this.getNode(targetId);
        if (node) {
          result.push(node);
          traverse(targetId, currentDepth - 1);
        }
      }
    };

    traverse(nodeId, depth);
    return result;
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  traverse(opts: TraverseOptions): TraverseResult {
    return traverseFn(this, opts);
  }

  locate(seedQuery: string, opts?: LocateOptions): LocateResult {
    return locateFn(this, seedQuery, opts);
  }

  async locateHybrid(seedQuery: string, opts?: LocateOptions): Promise<LocateResult> {
    const semantic = this.getSemanticConfig();
    if (!semantic.enabled || PATH_SEED_HINT_RE.test(seedQuery)) {
      return locateFn(this, seedQuery, opts);
    }

    const hybridRanked = await this.searchNodesHybrid(seedQuery, 5);
    const rankedForSeed = hybridRanked.slice(0, 5);
    if (rankedForSeed.length === 0) {
      return locateFn(this, seedQuery, opts);
    }

    const seededView = this.createSearchOverrideView((query, limit = 10) => {
      if (query === seedQuery) return rankedForSeed.slice(0, limit);
      return this.keywordSearchNodes(query, limit);
    });
    return locateFn(seededView, seedQuery, opts);
  }

  findByQualifiedName(qn: string): CodeSymbolNode | null {
    const normalized = qn.startsWith('code_symbol:') ? qn.slice('code_symbol:'.length) : qn;
    const directId = `code_symbol:${normalized}`;
    const direct = this.getNode(directId);
    if (direct?.type === 'code_symbol') return direct as CodeSymbolNode;

    try {
      const row = this.queryOne<Record<string, unknown>>(
        `SELECT * FROM nodes WHERE type = 'code_symbol' AND json_extract(metadata, '$.qualifiedName') = ? LIMIT 1`,
        [normalized],
      );
      if (row) return this.rowToNode(row) as CodeSymbolNode;
    } catch {
      // json_extract unavailable — fall through to scan
    }

    for (const node of this.queryNodes('code_symbol', 10_000)) {
      if (node.metadata?.qualifiedName === normalized) return node as CodeSymbolNode;
    }
    return null;
  }

  loadVectors(): VectorRow[] {
    const rows = this.query<{ id: string; vector: unknown }>(
      'SELECT id, vector FROM nodes WHERE vector IS NOT NULL'
    );
    const vectors: VectorRow[] = [];
    for (const row of rows) {
      const decoded = this.deserializeVector(row.vector);
      if (!decoded || decoded.length === 0) continue;
      vectors.push({ id: row.id, v: decoded });
    }
    return vectors;
  }

  getStatistics(): GraphStatistics {
    const totalNodesRow = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM nodes');
    const totalEdgesRow = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM edges');
    const totalNodes = totalNodesRow?.count ?? 0;
    const totalEdges = totalEdgesRow?.count ?? 0;

    const nodeRows = this.query<{ type: string; count: number }>('SELECT type, COUNT(*) as count FROM nodes GROUP BY type');
    const edgeRows = this.query<{ type: string; count: number }>('SELECT type, COUNT(*) as count FROM edges GROUP BY type');

    const nodesByType = emptyNodesByType();
    const edgesByType = emptyEdgesByType();
    for (const r of nodeRows) {
      const t = r.type as NodeType;
      if (t in nodesByType) nodesByType[t] = r.count;
    }
    for (const r of edgeRows) {
      const t = r.type as EdgeType;
      if (t in edgesByType) edgesByType[t] = r.count;
    }

    return { totalNodes, totalEdges, nodesByType, edgesByType };
  }

  exportToJson(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes = this.query<Record<string, unknown>>('SELECT * FROM nodes').map((r) => this.rowToNode(r));
    const edges = this.query<Record<string, unknown>>('SELECT * FROM edges').map((r) => this.rowToEdge(r));
    return { nodes, edges };
  }

  importFromJson(data: { nodes: GraphNode[]; edges: GraphEdge[] }): void {
    data.nodes.forEach((n) => this.addNode(n));
    data.edges.forEach((e) => this.addEdge(e));
  }

  close(): void {
    this.save();
    this.db.close();
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private rowToNode(row: Record<string, unknown>): GraphNode {
    const vector = this.deserializeVector(row['vector']);
    return {
      id: row['id'] as string,
      type: row['type'] as NodeType,
      label: row['label'] as string,
      description: row['description'] as string | undefined,
      vector: vector ? Array.from(vector) : undefined,
      metadata: JSON.parse((row['metadata'] as string) || '{}'),
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  private rowToEdge(row: Record<string, unknown>): GraphEdge {
    return {
      id: row['id'] as string,
      sourceId: row['source_id'] as string,
      targetId: row['target_id'] as string,
      type: row['type'] as EdgeType,
      weight: row['weight'] as number,
      metadata: JSON.parse((row['metadata'] as string) || '{}'),
    };
  }

  private serializeVector(vector: readonly number[]): Uint8Array {
    const floatVector = new Float32Array(vector.map((value) => Number(value)));
    return new Uint8Array(floatVector.buffer);
  }

  private deserializeVector(value: unknown): Float32Array | null {
    const bytes = toUint8Array(value);
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
      return null;
    }
    const copy = Uint8Array.from(bytes);
    return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / Float32Array.BYTES_PER_ELEMENT);
  }

  private createSearchOverrideView(
    search: (query: string, limit?: number) => SearchResult[],
  ): KnowledgeGraph {
    const view = Object.create(this) as KnowledgeGraph;
    view.searchNodes = search;
    return view;
  }

  private getSemanticConfig(): ResolvedSemanticConfig {
    if (this.semanticConfigCache) {
      return this.semanticConfigCache;
    }

    const projectRoot = this.resolveProjectRoot();
    const configPath = path.join(projectRoot, 'dare.config.json');
    const rawConfig: unknown =
      fs.existsSync(configPath) ? (fs.readJSONSync(configPath) as unknown) : {};
    const parsed = parseSemanticConfig(rawConfig);
    const model = parsed.model.trim();
    const modelHash =
      typeof parsed.modelHash === 'string' && parsed.modelHash.trim().length > 0
        ? parsed.modelHash.trim()
        : createHash('sha256').update(`model:${model}`).digest('hex');
    this.semanticConfigCache = {
      enabled: parsed.enabled && model.length > 0,
      model,
      modelHash,
      rrfK: parsed.rrfK,
    };
    return this.semanticConfigCache;
  }

  private resolveProjectRoot(): string {
    const dbDir = path.dirname(this.dbPath);
    if (path.basename(dbDir) === '.dare') {
      return path.dirname(dbDir);
    }
    return process.cwd();
  }

  private async loadEmbedderLazy(semantic: ResolvedSemanticConfig): Promise<Embedder | null> {
    if (this.embedderPromise) {
      return this.embedderPromise;
    }
    this.embedderPromise = loadEmbedder({
      model: semantic.model,
      modelHash: semantic.modelHash,
    }).catch((error) => {
      this.logSemanticFallback(error);
      return null;
    });
    return this.embedderPromise;
  }

  private logSemanticFallback(error: unknown): void {
    if (this.semanticFallbackLogged) return;
    this.semanticFallbackLogged = true;

    const reason =
      error instanceof EmbeddingModelMissingError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    console.info(`[graphrag] semantic disabled, using keyword fallback: ${reason}`);
  }
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) {
    const bytes = value.map((entry) => Number(entry));
    if (bytes.some((entry) => !Number.isFinite(entry))) return null;
    return Uint8Array.from(bytes);
  }
  return null;
}
