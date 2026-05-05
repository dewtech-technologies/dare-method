/**
 * `createGraph()` — read `dare-graph.yml` (or take an explicit config) and
 * return the matching backend instance.
 *
 * Supported backends:
 *  - `sqlite`  → `GraphRAG` (sql.js)
 *  - `json`    → `JsonGraph` (single JSON file, no native deps)
 *  - `neo4j`   → not yet implemented (throws with guidance)
 */
import path from 'path';
import fs from 'fs-extra';
import { parse as parseYaml } from 'yaml';
import { GraphRAG } from './graph-rag.js';
import { JsonGraph } from './json-graph.js';
import type { KnowledgeGraph } from './knowledge-graph.js';

export type GraphBackend = 'sqlite' | 'json' | 'neo4j';

export interface GraphConfig {
  backend: GraphBackend;
  /** Path to the persistence target, relative to the project root. */
  path?: string;
}

const DEFAULTS: Record<GraphBackend, string | undefined> = {
  sqlite: '.dare/graph.db',
  json: '.dare/graph.json',
  neo4j: undefined,
};

/**
 * Resolve graph config:
 *   - if `explicit` is given, use it;
 *   - otherwise read `dare-graph.yml` from cwd (or `cwd` if provided);
 *   - if no file exists, fall back to sqlite at `.dare/graph.db`.
 */
export async function loadGraphConfig(opts: {
  cwd?: string;
  explicit?: GraphConfig;
} = {}): Promise<GraphConfig> {
  if (opts.explicit) {
    return normalize(opts.explicit);
  }

  const cwd = opts.cwd ?? process.cwd();
  const ymlPath = path.join(cwd, 'dare-graph.yml');

  if (!(await fs.pathExists(ymlPath))) {
    return { backend: 'sqlite', path: DEFAULTS.sqlite };
  }

  const raw = (await fs.readFile(ymlPath, 'utf-8')).toString();
  const parsed = (parseYaml(raw) ?? {}) as Record<string, unknown>;
  const backend = (parsed.backend as GraphBackend) ?? 'sqlite';
  const subBlock = (parsed[backend] as Record<string, unknown> | undefined) ?? {};
  const filePath =
    typeof subBlock.path === 'string' ? subBlock.path : DEFAULTS[backend];

  return normalize({ backend, path: filePath });
}

/**
 * Build the backend instance and call `init()`. Caller owns the lifecycle and
 * must call `.close()` when done.
 */
export async function createGraph(
  config: GraphConfig,
  opts: { cwd?: string } = {},
): Promise<KnowledgeGraph> {
  const cwd = opts.cwd ?? process.cwd();
  const cfg = normalize(config);

  if (cfg.backend === 'neo4j') {
    throw new Error(
      'Neo4j backend is not yet implemented in @dewtech/dare-cli. Use `backend: sqlite` or `backend: json` in dare-graph.yml. (PRs welcome.)',
    );
  }

  if (!cfg.path) {
    throw new Error(`dare-graph.yml is missing the storage path for backend=${cfg.backend}.`);
  }

  const absPath = path.isAbsolute(cfg.path) ? cfg.path : path.resolve(cwd, cfg.path);

  const graph: KnowledgeGraph =
    cfg.backend === 'sqlite' ? new GraphRAG(absPath) : new JsonGraph(absPath);

  await graph.init();
  return graph;
}

function normalize(cfg: GraphConfig): GraphConfig {
  return {
    backend: cfg.backend,
    path: cfg.path ?? DEFAULTS[cfg.backend],
  };
}
