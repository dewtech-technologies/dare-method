import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import type {
  GraphNode, GraphEdge, NodeType, EdgeType,
  SearchResult, GraphStatistics
} from './types.js';

const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA cache_size=10000;
PRAGMA synchronous=NORMAL;

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
  metadata TEXT DEFAULT '{}',
  FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  id UNINDEXED,
  label,
  description,
  content='nodes',
  content_rowid='rowid'
);

CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);

CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, id, label, description) VALUES (new.rowid, new.id, new.label, new.description);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, id, label, description) VALUES ('delete', old.rowid, old.id, old.label, old.description);
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, id, label, description) VALUES ('delete', old.rowid, old.id, old.label, old.description);
  INSERT INTO nodes_fts(rowid, id, label, description) VALUES (new.rowid, new.id, new.label, new.description);
END;
`;

export class GraphRAG {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.ensureDirSync(path.dirname(dbPath));
    this.db = new Database(dbPath);
    this.db.exec(SCHEMA_SQL);
  }

  // ─── Node Operations ───────────────────────────────────────────────────────

  addNode(node: GraphNode): void {
    const stmt = this.db.prepare(`
      INSERT INTO nodes (id, type, label, description, metadata, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        description = excluded.description,
        metadata = excluded.metadata,
        updated_at = datetime('now')
    `);
    stmt.run(node.id, node.type, node.label, node.description || null, JSON.stringify(node.metadata || {}));
  }

  getNode(id: string): GraphNode | null {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToNode(row);
  }

  queryNodes(type?: NodeType, limit = 20): GraphNode[] {
    const stmt = type
      ? this.db.prepare('SELECT * FROM nodes WHERE type = ? LIMIT ?')
      : this.db.prepare('SELECT * FROM nodes LIMIT ?');
    const rows = (type ? stmt.all(type, limit) : stmt.all(limit)) as Record<string, unknown>[];
    return rows.map(this.rowToNode);
  }

  searchNodes(query: string, limit = 10): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT n.*, bm25(nodes_fts) AS score
      FROM nodes_fts
      JOIN nodes n ON n.id = nodes_fts.id
      WHERE nodes_fts MATCH ?
      ORDER BY score
      LIMIT ?
    `).all(query, limit) as (Record<string, unknown> & { score: number })[];

    return rows.map((row) => ({
      node: this.rowToNode(row),
      score: Math.abs(row.score as number),
      snippet: (row.description as string)?.substring(0, 150),
    }));
  }

  deleteNode(id: string): void {
    this.db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
  }

  // ─── Edge Operations ───────────────────────────────────────────────────────

  addEdge(edge: GraphEdge): void {
    this.db.prepare(`
      INSERT INTO edges (id, source_id, target_id, type, weight, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        weight = excluded.weight,
        metadata = excluded.metadata
    `).run(edge.id, edge.sourceId, edge.targetId, edge.type, edge.weight ?? 1.0, JSON.stringify(edge.metadata || {}));
  }

  getEdges(nodeId: string, direction: 'out' | 'in' | 'both' = 'both'): GraphEdge[] {
    let sql = '';
    if (direction === 'out') sql = 'SELECT * FROM edges WHERE source_id = ?';
    else if (direction === 'in') sql = 'SELECT * FROM edges WHERE target_id = ?';
    else sql = 'SELECT * FROM edges WHERE source_id = ? OR target_id = ?';

    const rows = (direction === 'both'
      ? this.db.prepare(sql).all(nodeId, nodeId)
      : this.db.prepare(sql).all(nodeId)) as Record<string, unknown>[];

    return rows.map(this.rowToEdge);
  }

  getNodeDependencies(nodeId: string, depth = 3): GraphNode[] {
    const visited = new Set<string>();
    const result: GraphNode[] = [];

    const traverse = (id: string, currentDepth: number) => {
      if (currentDepth === 0 || visited.has(id)) return;
      visited.add(id);

      const edges = this.db.prepare(
        "SELECT * FROM edges WHERE source_id = ? AND type = 'depends_on'"
      ).all(id) as Record<string, unknown>[];

      for (const edge of edges) {
        const targetId = edge.target_id as string;
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

  getStatistics(): GraphStatistics {
    const totalNodes = (this.db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number }).count;
    const totalEdges = (this.db.prepare('SELECT COUNT(*) as count FROM edges').get() as { count: number }).count;

    const nodeRows = this.db.prepare('SELECT type, COUNT(*) as count FROM nodes GROUP BY type').all() as { type: string; count: number }[];
    const edgeRows = this.db.prepare('SELECT type, COUNT(*) as count FROM edges GROUP BY type').all() as { type: string; count: number }[];

    const nodesByType = Object.fromEntries(nodeRows.map((r) => [r.type, r.count])) as Record<NodeType, number>;
    const edgesByType = Object.fromEntries(edgeRows.map((r) => [r.type, r.count])) as Record<EdgeType, number>;

    return { totalNodes, totalEdges, nodesByType, edgesByType };
  }

  exportToJson(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes = (this.db.prepare('SELECT * FROM nodes').all() as Record<string, unknown>[]).map(this.rowToNode);
    const edges = (this.db.prepare('SELECT * FROM edges').all() as Record<string, unknown>[]).map(this.rowToEdge);
    return { nodes, edges };
  }

  importFromJson(data: { nodes: GraphNode[]; edges: GraphEdge[] }): void {
    const tx = this.db.transaction(() => {
      data.nodes.forEach((n) => this.addNode(n));
      data.edges.forEach((e) => this.addEdge(e));
    });
    tx();
  }

  close(): void {
    this.db.close();
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private rowToNode(row: Record<string, unknown>): GraphNode {
    return {
      id: row.id as string,
      type: row.type as NodeType,
      label: row.label as string,
      description: row.description as string | undefined,
      metadata: JSON.parse((row.metadata as string) || '{}'),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private rowToEdge(row: Record<string, unknown>): GraphEdge {
    return {
      id: row.id as string,
      sourceId: row.source_id as string,
      targetId: row.target_id as string,
      type: row.type as EdgeType,
      weight: row.weight as number,
      metadata: JSON.parse((row.metadata as string) || '{}'),
    };
  }
}
