/**
 * Generic graph renderer — the shared core behind `dare dag viz` (the task
 * DAG) and `dare reverse` (the module-dependency graph).
 *
 * Callers map their domain objects (DagTask, Module, …) to `GraphNode`,
 * resolving colors / labels / styling, and this module owns the layout
 * (rank grouping via the same Kahn-style traversal the DAG uses) and the
 * serialization to Mermaid, Graphviz DOT, and Excalidraw JSON.
 *
 * Two styling strategies for Mermaid:
 *   - `'class'`  → emits `class <id> <cls>;` + shared `classDef` lines.
 *                  Used by the DAG (status-driven palette).
 *   - `'inline'` → emits `style <id> fill:…,stroke:…;` per node.
 *                  Used by `reverse` (arbitrary per-node colors, e.g. size).
 *
 * License: MIT (part of DARE CLI).
 */

// ─── Public model ──────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  depends_on: string[];
  /** Lines composing the node label (joined with the renderer's separator). */
  labelLines: string[];
  /** Background fill (Excalidraw, Mermaid inline, DOT fillcolor). */
  bg: string;
  /** Stroke / border color. */
  stroke: string;
  /** Dashed border (Excalidraw / inline). */
  dashed?: boolean;
  /** Mermaid class name when using class-based styling (e.g. `st_done`). */
  mermaidClass?: string;
}

export interface MermaidOptions {
  /** Goes into `%% <headerComment>` at the top (caller pre-escapes). */
  headerComment: string;
  direction?: 'LR' | 'TB';
  styling: 'class' | 'inline';
  /** Emitted (indented) when `styling === 'class'`. */
  classDefs?: string[];
}

export interface DotOptions {
  /** `digraph <name> { … }`. */
  name: string;
}

export interface ExcalidrawOptions {
  /** Stamped into the Excalidraw `source` field. */
  source: string;
}

// ─── Rank computation (Kahn-style, mirrors run_dag.computeRanks) ─────────────

/**
 * Compute layout ranks for a set of nodes from their `depends_on` edges.
 * Nodes with no dependencies are rank 0; otherwise rank = max(parent) + 1.
 * Throws on circular dependencies (same contract as the DAG runner).
 */
export function computeRanks(nodes: GraphNode[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  function getRank(id: string, visited = new Set<string>()): number {
    if (ranks.has(id)) return ranks.get(id)!;
    if (visited.has(id)) {
      throw new Error(`Circular dependency detected: ${id}`);
    }
    visited.add(id);
    const node = byId.get(id);
    // Unknown dependency targets are treated as rank-0 anchors so a missing
    // edge never crashes a best-effort reverse-engineering render.
    if (!node || node.depends_on.length === 0) {
      ranks.set(id, 0);
      return 0;
    }
    const maxDep = Math.max(
      ...node.depends_on.map((dep) => getRank(dep, new Set(visited))),
    );
    const rank = maxDep + 1;
    ranks.set(id, rank);
    return rank;
  }

  for (const n of nodes) getRank(n.id);
  return ranks;
}

function groupByRank(
  nodes: GraphNode[],
  ranks: Map<string, number>,
): Map<number, GraphNode[]> {
  const byRank = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const r = ranks.get(node.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(node);
  }
  return byRank;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

export function escapeMermaid(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/[\r\n]+/g, ' ');
}

// ─── Mermaid ──────────────────────────────────────────────────────────────────

export function renderGraphMermaid(
  nodes: GraphNode[],
  opts: MermaidOptions,
): string {
  const dir = opts.direction ?? 'LR';
  const lines: string[] = [
    `%% ${opts.headerComment}`,
    `%% Generated: ${new Date().toISOString()}`,
    `graph ${dir}`,
  ];

  const ranks = computeRanks(nodes);
  const byRank = groupByRank(nodes, ranks);
  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);

  for (const r of sortedRanks) {
    lines.push(`  subgraph rank_${r} ["Rank ${r}"]`);
    lines.push(`    direction TB`);
    for (const node of byRank.get(r)!) {
      const id = sanitizeId(node.id);
      const label = node.labelLines.map(escapeMermaid).join('\\n');
      lines.push(`    ${id}["${label}"]`);
    }
    lines.push('  end');
  }

  for (const node of nodes) {
    for (const dep of node.depends_on) {
      lines.push(`  ${sanitizeId(dep)} --> ${sanitizeId(node.id)}`);
    }
  }

  if (opts.styling === 'class') {
    for (const node of nodes) {
      lines.push(`  class ${sanitizeId(node.id)} ${node.mermaidClass};`);
    }
    for (const cls of opts.classDefs ?? []) lines.push(`  ${cls}`);
  } else {
    for (const node of nodes) {
      lines.push(
        `  style ${sanitizeId(node.id)} fill:${node.bg},stroke:${node.stroke};`,
      );
    }
  }

  return lines.join('\n');
}

// ─── Graphviz DOT ──────────────────────────────────────────────────────────────

export function renderGraphDot(nodes: GraphNode[], opts: DotOptions): string {
  const lines: string[] = [
    `digraph ${opts.name} {`,
    '  rankdir=LR;',
    '  node [shape=box style=filled fontname=Helvetica];',
  ];

  for (const node of nodes) {
    const id = JSON.stringify(node.id);
    const label = JSON.stringify(node.labelLines.join('\n'));
    lines.push(
      `  ${id} [label=${label} fillcolor="${node.bg}" color="${node.stroke}"];`,
    );
  }

  for (const node of nodes) {
    for (const dep of node.depends_on) {
      lines.push(`  ${JSON.stringify(dep)} -> ${JSON.stringify(node.id)};`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

// ─── Excalidraw ────────────────────────────────────────────────────────────────

interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  roundness?: { type: number; value: number };
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  startBinding?: { elementId: string };
  endBinding?: { elementId: string };
  startArrowType?: string;
  endArrowType?: string;
  boundElements?: Array<{ id: string; type: string }>;
  updated?: number;
  link?: null;
  locked?: boolean;
  seed?: number;
  versionNonce?: number;
}

export interface ExcalidrawData {
  type: string;
  version: number;
  source: string;
  elements: ExcalidrawElement[];
  appState: {
    gridMode: string;
    gridSize: number;
    viewBackgroundColor?: string;
  };
  files: Record<string, unknown>;
}

function randomId(): string {
  return Math.random().toString(36).substr(2, 9);
}

function createNodeRect(
  node: GraphNode,
  x: number,
  y: number,
): ExcalidrawElement {
  return {
    id: node.id,
    type: 'rectangle',
    x,
    y,
    width: 120,
    height: 60,
    angle: 0,
    strokeColor: node.stroke,
    backgroundColor: node.bg,
    fillStyle: 'hachure',
    strokeWidth: 2,
    strokeStyle: node.dashed ? 'dashed' : 'solid',
    roughness: 0,
    opacity: 100,
    roundness: { type: 2, value: 6 },
    text: node.labelLines.join('\n'),
    fontSize: 12,
    fontFamily: 1, // Virgil (default Excalidraw font)
    textAlign: 'center',
    verticalAlign: 'middle',
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
    seed: Math.floor(Math.random() * 2147483647),
    versionNonce: Math.floor(Math.random() * 2147483647),
  };
}

function createEdgeArrow(fromId: string, toId: string): ExcalidrawElement {
  return {
    id: randomId(),
    type: 'arrow',
    x: 0, // computed from start/end binding by Excalidraw
    y: 0,
    startBinding: { elementId: fromId },
    endBinding: { elementId: toId },
    startArrowType: 'dot',
    endArrowType: 'arrow',
    strokeColor: '#999999',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    updated: Date.now(),
    link: null,
    locked: false,
    seed: Math.floor(Math.random() * 2147483647),
    versionNonce: Math.floor(Math.random() * 2147483647),
  };
}

export function renderGraphExcalidraw(
  nodes: GraphNode[],
  opts: ExcalidrawOptions,
): ExcalidrawData {
  const elements: ExcalidrawElement[] = [];
  const ranks = computeRanks(nodes);
  const byRank = groupByRank(nodes, ranks);
  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);

  for (const rank of sortedRanks) {
    const inRank = byRank.get(rank)!;
    for (let i = 0; i < inRank.length; i++) {
      const x = 20 + i * 140;
      const y = 20 + rank * 160;
      elements.push(createNodeRect(inRank[i], x, y));
    }
  }

  for (const node of nodes) {
    for (const dep of node.depends_on) {
      elements.push(createEdgeArrow(dep, node.id));
    }
  }

  return {
    type: 'excalidraw',
    version: 2,
    source: opts.source,
    elements,
    appState: {
      gridMode: 'grid',
      gridSize: 20,
      viewBackgroundColor: '#ffffff',
    },
    files: {},
  };
}

export function serializeExcalidraw(data: ExcalidrawData): string {
  return JSON.stringify(data, null, 2);
}
