/**
 * Ingest a finished DAG task into the knowledge graph.
 *
 * For each task we add:
 *   - one `task` node with status / duration / tokens metadata
 *   - one `depends_on` edge per parent task in the DAG
 *   - one `file` node + `implements` edge for each file the task touched
 *
 * "Files touched" are inferred heuristically from the task's captured output:
 *   - explicit markers ("Created: …", "Modified: …", "File: …", "wrote …")
 *   - bare path-like tokens with extensions (e.g. `src/auth.ts`, `tests/x.py`)
 *
 * The heuristic is intentionally simple — false positives are tolerated;
 * the graph is meant to power discovery, not be a build-system source of truth.
 */
import path from 'path';
import type { Dag, DagTask } from './run_dag.js';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';

export interface IngestOptions {
  /** Project root used to resolve relative file paths. Defaults to cwd. */
  cwd?: string;
}

/**
 * Ingest a single task. Idempotent — re-running upserts by id.
 */
export function ingestTask(
  graph: KnowledgeGraph,
  task: DagTask,
  dag: Dag,
  _opts: IngestOptions = {},
): void {
  if (!task.status || task.status === 'PENDING' || task.status === 'RUNNING') return;

  // 1) task node
  graph.addNode({
    id: nodeId('task', task.id),
    type: 'task',
    label: task.title,
    description: task.subtask_prompt.slice(0, 500),
    metadata: {
      status: task.status,
      complexity: task.complexity,
      tokens: task.tokens,
      duration_ms: task.duration,
      error: task.error,
    },
  });

  // 2) depends_on edges (mirror DAG)
  for (const parentId of task.depends_on) {
    graph.addEdge({
      id: edgeId('depends_on', task.id, parentId),
      sourceId: nodeId('task', task.id),
      targetId: nodeId('task', parentId),
      type: 'depends_on',
    });
  }

  // 3) file nodes + implements edges (only for DONE tasks)
  if (task.status !== 'DONE' || !task.output) return;
  const files = extractFilePaths(task.output);
  for (const filePath of files) {
    const normalized = filePath.replace(/\\/g, '/');
    graph.addNode({
      id: nodeId('file', normalized),
      type: 'file',
      label: path.basename(normalized),
      description: normalized,
      metadata: { path: normalized, language: detectLanguage(normalized) },
    });
    graph.addEdge({
      id: edgeId('implements', task.id, normalized),
      sourceId: nodeId('task', task.id),
      targetId: nodeId('file', normalized),
      type: 'implements',
    });
  }
}

/**
 * Ingest every task of a DAG. Useful for `dare graph ingest` after an
 * execution finishes (re-syncs the graph from in-memory DAG state).
 */
export function ingestDag(graph: KnowledgeGraph, dag: Dag, opts: IngestOptions = {}): void {
  for (const task of dag.tasks) ingestTask(graph, task, dag, opts);
}

// ─── Heuristics ─────────────────────────────────────────────────────────────

// Find any token that contains a '/' and ends with .ext — explicit anchors and
// punctuation-trimming is handled in `looksLikePath` after extraction.
const FILE_PATH_REGEX = /[./\w-]+\/[./\w-]+/g;
const EXPLICIT_MARKERS = [
  /(?:created|modified|wrote|updated|added|new file)[:\s]+([^\s`'"]+)/gi,
  /(?:^|\n)\s*[-*]\s+([^\s`'"]+\.[a-zA-Z]{1,8})\s*$/gm,
];

const COMMON_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rs', 'go', 'java', 'kt', 'swift',
  'php', 'rb', 'cs', 'cpp', 'c', 'h', 'hpp',
  'json', 'yaml', 'yml', 'toml', 'xml', 'html',
  'css', 'scss', 'less', 'vue', 'svelte',
  'md', 'mdx', 'sql', 'sh', 'bash', 'env', 'lock', 'gitignore',
]);

export function extractFilePaths(text: string): string[] {
  // Strip http/https URLs first so the path heuristic doesn't pick up
  // tokens like "example.com/a.ts".
  const sanitized = text.replace(/https?:\/\/\S+/g, ' ');
  const found = new Set<string>();

  for (const re of EXPLICIT_MARKERS) {
    re.lastIndex = 0;
    for (let m: RegExpExecArray | null; (m = re.exec(sanitized)); ) {
      const cleaned = stripWrappers(m[1]);
      if (looksLikePath(cleaned)) found.add(cleaned);
    }
  }

  FILE_PATH_REGEX.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = FILE_PATH_REGEX.exec(sanitized)); ) {
    const cleaned = stripWrappers(m[0]);
    if (looksLikePath(cleaned)) found.add(cleaned);
  }

  return [...found];
}

function looksLikePath(p: string): boolean {
  if (p.length === 0 || p.length > 200) return false;
  if (p.startsWith('http://') || p.startsWith('https://')) return false;
  const dot = p.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = p.slice(dot + 1).toLowerCase();
  return COMMON_EXTENSIONS.has(ext);
}

function stripWrappers(s: string): string {
  return s.replace(/^[`'"(\[]+|[`'")\],.;:!?]+$/g, '').trim();
}

function detectLanguage(filePath: string): string | undefined {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    php: 'php',
    rb: 'ruby',
    vue: 'vue',
    svelte: 'svelte',
    sql: 'sql',
  };
  return map[ext];
}

function nodeId(type: 'task' | 'file', id: string): string {
  return `${type}:${id}`;
}

function edgeId(kind: string, from: string, to: string): string {
  return `${kind}:${from}->${to}`;
}
