import { assertRelativeSafe } from '../utils/path-safety.js';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import type { EdgeType, GraphNode, NodeType } from '../graphrag/types.js';

export const GRAPH_PATH_ERROR = 'Error: path must be relative and stay within the project';

export class GraphPathError extends Error {
  constructor(message = GRAPH_PATH_ERROR) {
    super(message);
    this.name = 'GraphPathError';
  }
}

export class TraceFormatError extends Error {
  constructor() {
    super('Invalid requirement/task format');
    this.name = 'TraceFormatError';
  }
}

export class TraceNotFoundError extends Error {
  constructor(req: string) {
    super(`Error: requirement or task '${req}' not found in graph`);
    this.name = 'TraceNotFoundError';
  }
}

const TRACE_REQ_RE = /^(RF-\d+|O-\d+|task-\d+)$/;

export function normalizeGraphPath(targetPath: string): string {
  try {
    assertRelativeSafe(targetPath);
  } catch {
    throw new GraphPathError();
  }
  return targetPath.replace(/\\/g, '/');
}

export function seedsForPath(graph: KnowledgeGraph, targetPath: string): string[] {
  const posix = normalizeGraphPath(targetPath);
  const seeds = new Set<string>();
  const fileId = `file:${posix}`;
  if (graph.getNode(fileId)) seeds.add(fileId);
  for (const n of graph.queryNodes('code_symbol', 10_000)) {
    const p = String(n.metadata?.path ?? '');
    if (p === posix || p.startsWith(`${posix}/`)) seeds.add(n.id);
  }
  return [...seeds].sort();
}

function bfsCollect(
  graph: KnowledgeGraph,
  seedIds: string[],
  opts: {
    direction: 'in' | 'out' | 'both';
    edgeTypes: EdgeType[];
    nodeTypes?: NodeType[];
    maxHops: number;
  },
): GraphNode[] {
  const edgeSet = new Set(opts.edgeTypes);
  const nodeFilter = opts.nodeTypes ? new Set(opts.nodeTypes) : null;
  const visited = new Map<string, GraphNode>();
  for (const id of seedIds) {
    const n = graph.getNode(id);
    if (n) visited.set(id, n);
  }
  let frontier = seedIds.filter((id) => graph.getNode(id));
  for (let depth = 0; depth < opts.maxHops && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      let edges = graph.getEdges(nodeId, opts.direction).filter((e) => edgeSet.has(e.type));
      edges = edges.sort((a, b) => a.id.localeCompare(b.id));
      for (const e of edges) {
        const neighborId = e.sourceId === nodeId ? e.targetId : e.sourceId;
        if (visited.has(neighborId)) continue;
        const node = graph.getNode(neighborId);
        if (!node) continue;
        if (nodeFilter && !nodeFilter.has(node.type)) continue;
        visited.set(neighborId, node);
        next.push(neighborId);
      }
    }
    frontier = next;
  }
  return [...visited.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function collectOwners(
  graph: KnowledgeGraph,
  targetPath: string,
  limit = 20,
): { path: string; owners: Array<{ id: string; type: string; label: string }>; durationMs: number } {
  const posix = normalizeGraphPath(targetPath);
  const start = Date.now();
  const seeds = seedsForPath(graph, posix);
  const reached = bfsCollect(graph, seeds, {
    direction: 'in',
    edgeTypes: ['implements', 'derives_from'],
    nodeTypes: ['task', 'requirement'],
    maxHops: 5,
  });
  const ownerMap = new Map(reached.map((n) => [n.id, n]));
  for (const task of reached.filter((n) => n.type === 'task')) {
    for (const e of graph.getEdges(task.id, 'out').filter((edge) => edge.type === 'depends_on')) {
      const req = graph.getNode(e.targetId);
      if (req?.type === 'requirement') ownerMap.set(req.id, req);
    }
  }
  const owners = [...ownerMap.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => ({ id: n.id, type: n.type, label: n.label }))
    .slice(0, limit);
  return { path: posix, owners, durationMs: Date.now() - start };
}

export function collectImpact(
  graph: KnowledgeGraph,
  targetPath: string,
  hops = 3,
): {
  path: string;
  impacted: { tasks: string[]; requirements: string[] };
  durationMs: number;
} {
  const posix = normalizeGraphPath(targetPath);
  const start = Date.now();
  const maxHops = Math.min(hops, 5);
  const seeds = seedsForPath(graph, posix);
  const reached = bfsCollect(graph, seeds, {
    direction: 'both',
    edgeTypes: ['affects', 'implements', 'depends_on'],
    nodeTypes: ['task', 'requirement'],
    maxHops,
  });
  const tasks: string[] = [];
  const requirements: string[] = [];
  for (const n of reached) {
    if (n.type === 'task') tasks.push(n.id.startsWith('task:') ? n.id.slice(5) : n.id);
    if (n.type === 'requirement') {
      requirements.push(n.id.startsWith('requirement:') ? n.id.slice(12) : n.id);
    }
  }
  return {
    path: posix,
    impacted: {
      tasks: [...new Set(tasks)].sort(),
      requirements: [...new Set(requirements)].sort(),
    },
    durationMs: Date.now() - start,
  };
}

function shortestPathToSymbol(
  graph: KnowledgeGraph,
  startId: string,
  maxHops: number,
): GraphNode[] {
  const edgeTypes: EdgeType[] = ['derives_from', 'depends_on', 'implements'];
  const edgeSet = new Set(edgeTypes);
  const visited = new Set<string>([startId]);
  const parent = new Map<string, string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  let foundId: string | null = null;

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const node = graph.getNode(id);
    if (node?.type === 'code_symbol' && id !== startId) {
      foundId = id;
      break;
    }
    if (depth >= maxHops) continue;

    const edges = graph.getEdges(id, 'both').filter((e) => edgeSet.has(e.type));
    edges.sort((a, b) => a.id.localeCompare(b.id));
    for (const e of edges) {
      const next = e.sourceId === id ? e.targetId : e.sourceId;
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, id);
      queue.push({ id: next, depth: depth + 1 });
    }
  }

  const start = graph.getNode(startId);
  if (!foundId || !start) return start ? [start] : [];

  const ids: string[] = [];
  let cur: string | undefined = foundId;
  while (cur) {
    ids.unshift(cur);
    cur = parent.get(cur);
  }
  return ids.map((id) => graph.getNode(id)!).filter(Boolean);
}

export function traceRequirement(
  graph: KnowledgeGraph,
  req: string,
): {
  req: string;
  path: Array<{ id: string; type: string }>;
  symbols: string[];
} {
  if (!TRACE_REQ_RE.test(req)) throw new TraceFormatError();
  const seedId = req.startsWith('task-') ? `task:${req}` : `requirement:${req}`;
  if (!graph.getNode(seedId)) throw new TraceNotFoundError(req);

  const walked = graph.traverse({
    seedNodeIds: [seedId],
    maxHops: 3,
    edgeTypes: ['derives_from', 'depends_on', 'implements'],
    direction: 'both',
  });

  const symbols = walked.nodes
    .filter((n) => n.type === 'code_symbol')
    .map((n) => String(n.metadata?.qualifiedName ?? ''))
    .filter(Boolean)
    .sort();

  const pathNodes = shortestPathToSymbol(graph, seedId, 3);
  return {
    req,
    path: pathNodes.map((n) => ({ id: n.id, type: n.type })),
    symbols,
  };
}

export function formatLocateJson(
  seed: string,
  result: ReturnType<KnowledgeGraph['locate']>,
): {
  seed: string;
  candidates: Array<{
    id: string;
    score: number;
    kind: string;
    qualifiedName?: string;
  }>;
} {
  return {
    seed,
    candidates: result.candidates.map((c) => ({
      id: c.node.id,
      score: c.score,
      kind: c.node.type,
      qualifiedName:
        c.node.type === 'code_symbol'
          ? String(c.node.metadata?.qualifiedName ?? '')
          : undefined,
    })),
  };
}
