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
import { createHash } from 'node:crypto';
import type { Dag, DagTask } from './run_dag.js';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import { extractSymbolsFromPaths } from '../graphrag/code-index.js';
import { mergeWithExistingMetadata } from '../graphrag/incremental-index.js';

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

  const projectRoot = _opts.cwd ?? process.cwd();
  const files = extractFilePaths(task.output);
  const symbolIdsCreated = new Set<string>();

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

    const symbols = extractSymbolsFromPaths([normalized], projectRoot);
    for (const sym of symbols) {
      const symId = nodeId('code_symbol', sym.qualifiedName);
      symbolIdsCreated.add(symId);
      const symbolText = `${sym.qualifiedName}\n${sym.symbol}\n${sym.kind}\n${sym.line ?? ''}`;
      const contentHash = createHash('sha256').update(symbolText).digest('hex');
      const metadata = mergeWithExistingMetadata(graph, symId, {
        path: sym.path,
        symbol: sym.symbol,
        kind: sym.kind,
        qualifiedName: sym.qualifiedName,
        line: sym.line,
        contentHash,
      });
      graph.addNode({
        id: symId,
        type: 'code_symbol',
        label: sym.symbol,
        description: sym.qualifiedName,
        metadata,
      });
      graph.addEdge({
        id: edgeId('contains', normalized, sym.qualifiedName),
        sourceId: nodeId('file', normalized),
        targetId: symId,
        type: 'contains',
      });
      graph.addEdge({
        id: edgeId('implements', `${task.id}->sym:${sym.qualifiedName}`, sym.qualifiedName),
        sourceId: nodeId('task', task.id),
        targetId: symId,
        type: 'implements',
      });
    }
  }

  const QN_MENTION_RE = /[\w./-]+::\w+/g;
  for (const match of task.output.matchAll(QN_MENTION_RE)) {
    const qn = match[0];
    const symId = nodeId('code_symbol', qn);
    if (!symbolIdsCreated.has(symId) && !graph.getNode(symId)) continue;
    graph.addEdge({
      id: edgeId('implements', `${task.id}->mention:${qn}`, qn),
      sourceId: nodeId('task', task.id),
      targetId: symId,
      type: 'implements',
    });
  }

  // 4) endpoints (HTTP routes detected in the output)
  for (const endpoint of extractEndpoints(task.output)) {
    const id = `${endpoint.method}:${endpoint.path}`;
    graph.addNode({
      id: nodeId('endpoint', id),
      type: 'endpoint',
      label: id,
      description: `${endpoint.method} ${endpoint.path}`,
      metadata: { method: endpoint.method, path: endpoint.path },
    });
    graph.addEdge({
      id: edgeId('implements', task.id, `endpoint:${id}`),
      sourceId: nodeId('task', task.id),
      targetId: nodeId('endpoint', id),
      type: 'implements',
    });
  }

  // 5) schemas (database tables / migrations detected in the output)
  for (const schema of extractSchemas(task.output)) {
    graph.addNode({
      id: nodeId('schema', schema),
      type: 'schema',
      label: schema,
      description: `table: ${schema}`,
      metadata: { tableName: schema },
    });
    graph.addEdge({
      id: edgeId('implements', task.id, `schema:${schema}`),
      sourceId: nodeId('task', task.id),
      targetId: nodeId('schema', schema),
      type: 'implements',
    });
  }

  // 6) components (UI components detected in the output)
  for (const component of extractComponents(task.output)) {
    graph.addNode({
      id: nodeId('component', component),
      type: 'component',
      label: component,
      description: `component: ${component}`,
      metadata: { name: component },
    });
    graph.addEdge({
      id: edgeId('implements', task.id, `component:${component}`),
      sourceId: nodeId('task', task.id),
      targetId: nodeId('component', component),
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

// ─── Endpoints ─────────────────────────────────────────────────────────────

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const ENDPOINT_RE = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[A-Za-z0-9_/:{}.\-]+)/g;

export interface ExtractedEndpoint {
  method: HttpMethod;
  path: string;
}

export function extractEndpoints(text: string): ExtractedEndpoint[] {
  const found = new Map<string, ExtractedEndpoint>();
  ENDPOINT_RE.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = ENDPOINT_RE.exec(text)); ) {
    const method = m[1] as HttpMethod;
    const path = m[2].replace(/[.,;:!?)\]]+$/, '');
    if (path.length < 2) continue;
    const key = `${method} ${path}`;
    if (!found.has(key)) found.set(key, { method, path });
  }
  return [...found.values()];
}

// ─── Schemas (database tables) ─────────────────────────────────────────────

// Captures table names from common migration / SQL phrasing:
//   CREATE TABLE users (...)
//   Schema::create('users', ...)
//   ALTER TABLE refresh_tokens ...
//   Created table: products
const SCHEMA_PATTERNS: RegExp[] = [
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`']?(\w+)["`']?/gi,
  /\bALTER\s+TABLE\s+["`']?(\w+)["`']?/gi,
  /Schema::create\(\s*['"](\w+)['"]/g,
  /(?:Created|Created table|Migration created|table)\s*[:\-]?\s*[`'"]?(\w+)[`'"]?\s+(?:table|migration)/gi,
];

export function extractSchemas(text: string): string[] {
  const found = new Set<string>();
  for (const re of SCHEMA_PATTERNS) {
    re.lastIndex = 0;
    for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
      const name = m[1].toLowerCase();
      if (looksLikeIdentifier(name) && !STOP_WORDS.has(name)) found.add(name);
    }
  }
  return [...found];
}

// ─── Components (UI / class components) ────────────────────────────────────

// Detects PascalCase identifiers in JSX-like usage or class declarations:
//   <UserForm /> or <UserForm>
//   class UserForm extends Component
//   export default function UserForm(...)
//   const UserForm = (...)
const COMPONENT_PATTERNS: RegExp[] = [
  /<([A-Z][A-Za-z0-9]+)(?:\s|\/?>)/g,
  /\bclass\s+([A-Z][A-Za-z0-9]+)\s+extends\s+(?:React\.)?Component\b/g,
  /\bexport\s+default\s+function\s+([A-Z][A-Za-z0-9]+)\s*\(/g,
  /\bfunction\s+([A-Z][A-Za-z0-9]+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*return\s*</g,
];

const COMPONENT_STOP = new Set([
  'React', 'Component', 'Fragment', 'Suspense', 'StrictMode', 'Provider',
  'Router', 'Route', 'Link', 'Outlet', 'NavLink',
]);

export function extractComponents(text: string): string[] {
  const found = new Set<string>();
  for (const re of COMPONENT_PATTERNS) {
    re.lastIndex = 0;
    for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
      const name = m[1];
      if (!COMPONENT_STOP.has(name)) found.add(name);
    }
  }
  return [...found];
}

const STOP_WORDS = new Set([
  'if', 'as', 'on', 'is', 'or', 'do', 'in', 'to', 'a', 'an', 'the',
  'table', 'database', 'index', 'column', 'row', 'sql',
]);

function looksLikeIdentifier(s: string): boolean {
  return /^[a-z_][a-z0-9_]{1,63}$/i.test(s);
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

function nodeId(
  type:
    | 'task'
    | 'file'
    | 'endpoint'
    | 'schema'
    | 'component'
    | 'entity'
    | 'concept'
    | 'code_symbol',
  id: string,
): string {
  return `${type}:${id}`;
}

function edgeId(kind: string, from: string, to: string): string {
  return `${kind}:${from}->${to}`;
}
