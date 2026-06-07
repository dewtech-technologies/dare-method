import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs-extra';
import type { KnowledgeGraph } from './knowledge-graph.js';
import type {
  GraphNode, GraphEdge, NodeType, EdgeType,
  SearchResult, GraphStatistics,
  CodeSymbolNode, TraverseOptions, TraverseResult,
  LocateOptions, LocateResult,
} from './types.js';
import { emptyEdgesByType, emptyNodesByType } from './types.js';
import { traverse as traverseFn, locate as locateFn } from './traverse.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
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

export class GraphRAG implements KnowledgeGraph {
  private db!: Database;
  private dbPath: string;
  private SQL!: SqlJsStatic;

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
    this.save();
  }

  private save(): void {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  private run(sql: string, params: (string | number | null)[] = []): void {
    this.db.run(sql, params);
    this.save();
  }

  private query<T>(sql: string, params: (string | number | null)[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }

  private queryOne<T>(sql: string, params: (string | number | null)[] = []): T | null {
    const results = this.query<T>(sql, params);
    return results[0] ?? null;
  }

  // ─── Node Operations ───────────────────────────────────────────────────────

  addNode(node: GraphNode): void {
    const existing = this.queryOne('SELECT id FROM nodes WHERE id = ?', [node.id]);
    if (existing) {
      this.run(
        `UPDATE nodes SET label = ?, description = ?, metadata = ?, updated_at = datetime('now') WHERE id = ?`,
        [node.label, node.description || null, JSON.stringify(node.metadata || {}), node.id]
      );
    } else {
      this.run(
        `INSERT INTO nodes (id, type, label, description, metadata) VALUES (?, ?, ?, ?, ?)`,
        [node.id, node.type, node.label, node.description || null, JSON.stringify(node.metadata || {})]
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
    return {
      id: row['id'] as string,
      type: row['type'] as NodeType,
      label: row['label'] as string,
      description: row['description'] as string | undefined,
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
}
