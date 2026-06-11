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
  /** Optional parent task id used to group nested sub-DAG nodes. */
  parentId?: string;
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

function buildNestedGroups(nodes: GraphNode[]): {
  nodeById: Map<string, GraphNode>;
  childrenByParent: Map<string, GraphNode[]>;
  roots: GraphNode[];
} {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    const parentId = node.parentId;
    if (!parentId || !nodeById.has(parentId)) continue;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId)!.push(node);
  }

  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.id.localeCompare(b.id));
  }

  const roots = nodes
    .filter((node) => !node.parentId || !nodeById.has(node.parentId))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { nodeById, childrenByParent, roots };
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

  const hasNested = nodes.some((node) => Boolean(node.parentId));

  if (hasNested) {
    const { nodeById, childrenByParent, roots } = buildNestedGroups(nodes);
    const emitted = new Set<string>();

    const emitNodeTree = (nodeId: string, indent: string, ancestry: Set<string>): void => {
      if (emitted.has(nodeId)) return;
      const node = nodeById.get(nodeId);
      if (!node) return;

      emitted.add(nodeId);
      const id = sanitizeId(node.id);
      const label = node.labelLines.map(escapeMermaid).join('\\n');
      lines.push(`${indent}${id}["${label}"]`);

      const children = childrenByParent.get(node.id) ?? [];
      if (children.length === 0 || ancestry.has(node.id)) return;

      lines.push(
        `${indent}subgraph subdag_${sanitizeId(node.id)} ["Sub-DAG: ${escapeMermaid(node.id)}"]`,
      );
      lines.push(`${indent}  direction TB`);
      const nextAncestry = new Set(ancestry);
      nextAncestry.add(node.id);
      for (const child of children) {
        emitNodeTree(child.id, `${indent}  `, nextAncestry);
      }
      lines.push(`${indent}end`);
    };

    for (const root of roots) {
      emitNodeTree(root.id, '  ', new Set());
    }
    for (const node of nodes) {
      emitNodeTree(node.id, '  ', new Set());
    }
  } else {
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

  const hasNested = nodes.some((node) => Boolean(node.parentId));

  const renderDotNode = (node: GraphNode, indent = '  '): void => {
    const id = JSON.stringify(node.id);
    const label = JSON.stringify(node.labelLines.join('\n'));
    lines.push(
      `${indent}${id} [label=${label} fillcolor="${node.bg}" color="${node.stroke}"];`,
    );
  };

  if (hasNested) {
    const { nodeById, childrenByParent, roots } = buildNestedGroups(nodes);
    const emitted = new Set<string>();

    const emitCluster = (parentId: string, indent: string, ancestry: Set<string>): void => {
      const children = childrenByParent.get(parentId) ?? [];
      if (children.length === 0 || ancestry.has(parentId)) return;

      lines.push(`${indent}subgraph cluster_${sanitizeId(parentId)} {`);
      lines.push(`${indent}  label=${JSON.stringify(`Sub-DAG: ${parentId}`)};`);
      lines.push(`${indent}  color="#94a3b8";`);

      const nextAncestry = new Set(ancestry);
      nextAncestry.add(parentId);
      for (const child of children) {
        if (!emitted.has(child.id)) {
          renderDotNode(child, `${indent}  `);
          emitted.add(child.id);
        }
        emitCluster(child.id, `${indent}  `, nextAncestry);
      }
      lines.push(`${indent}}`);
    };

    for (const root of roots) {
      if (!emitted.has(root.id)) {
        renderDotNode(root);
        emitted.add(root.id);
      }
      emitCluster(root.id, '  ', new Set());
    }

    for (const node of nodeById.values()) {
      if (emitted.has(node.id)) continue;
      renderDotNode(node);
      emitted.add(node.id);
      emitCluster(node.id, '  ', new Set());
    }
  } else {
    for (const node of nodes) {
      renderDotNode(node);
    }
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

function createGroupRect(
  id: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ExcalidrawElement {
  return {
    id,
    type: 'rectangle',
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: '#94a3b8',
    backgroundColor: '#f8fafc',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'dashed',
    roughness: 0,
    opacity: 100,
    roundness: { type: 2, value: 8 },
    text: label,
    fontSize: 11,
    fontFamily: 1,
    textAlign: 'left',
    verticalAlign: 'top',
    boundElements: [],
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
  const nodeElements: ExcalidrawElement[] = [];
  const edgeElements: ExcalidrawElement[] = [];
  const nodeBounds = new Map<string, { x: number; y: number; width: number; height: number }>();
  const ranks = computeRanks(nodes);
  const byRank = groupByRank(nodes, ranks);
  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);

  for (const rank of sortedRanks) {
    const inRank = byRank.get(rank)!;
    for (let i = 0; i < inRank.length; i++) {
      const x = 20 + i * 140;
      const y = 20 + rank * 160;
      const node = inRank[i];
      nodeElements.push(createNodeRect(node, x, y));
      nodeBounds.set(node.id, { x, y, width: 120, height: 60 });
    }
  }

  for (const node of nodes) {
    for (const dep of node.depends_on) {
      edgeElements.push(createEdgeArrow(dep, node.id));
    }
  }

  const groupElements: Array<ExcalidrawElement & { __area: number }> = [];
  const { childrenByParent } = buildNestedGroups(nodes);

  const collectDescendants = (parentId: string, acc: Set<string>, ancestry: Set<string>): void => {
    if (ancestry.has(parentId)) return;
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(parentId);

    for (const child of childrenByParent.get(parentId) ?? []) {
      if (!acc.has(child.id)) acc.add(child.id);
      collectDescendants(child.id, acc, nextAncestry);
    }
  };

  for (const parentId of childrenByParent.keys()) {
    const descendants = new Set<string>();
    collectDescendants(parentId, descendants, new Set());
    if (descendants.size === 0) continue;

    const bounds = [...descendants]
      .map((id) => nodeBounds.get(id))
      .filter((item): item is { x: number; y: number; width: number; height: number } => Boolean(item));
    if (bounds.length === 0) continue;

    const minX = Math.min(...bounds.map((item) => item.x));
    const minY = Math.min(...bounds.map((item) => item.y));
    const maxRight = Math.max(...bounds.map((item) => item.x + item.width));
    const maxBottom = Math.max(...bounds.map((item) => item.y + item.height));
    const padding = 24;
    const titlePad = 28;
    const x = minX - padding;
    const y = minY - titlePad;
    const width = maxRight - minX + padding * 2;
    const height = maxBottom - minY + padding + titlePad;
    const area = width * height;

    groupElements.push({
      ...createGroupRect(
        `__group_${sanitizeId(parentId)}`,
        `Sub-DAG: ${parentId}`,
        x,
        y,
        width,
        height,
      ),
      __area: area,
    });
  }

  const elements: ExcalidrawElement[] = [
    ...groupElements.sort((a, b) => b.__area - a.__area),
    ...nodeElements,
    ...edgeElements,
  ];

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
