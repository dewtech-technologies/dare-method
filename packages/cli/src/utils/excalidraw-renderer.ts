/**
 * Excalidraw Renderer for DARE DAG Visualization
 *
 * Converts a DARE DAG (task graph) to an Excalidraw JSON file.
 * - Tasks are rendered as colored rectangles based on complexity
 * - Dependencies are rendered as arrows
 * - Tasks are grouped by rank in swim lanes
 *
 * Design tokens: /docs/DESIGN-TOKENS-EXCALIDRAW.md
 * License: AGPL v3 (part of DARE CLI)
 */

import { Dag, DagTask, TaskStatus, computeRanks } from '../dag-runner/run_dag.js';

/**
 * Excalidraw element types
 */
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

interface ExcalidrawData {
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

/**
 * Color palette based on DARE Design Tokens
 */
const COLOR_BY_COMPLEXITY = {
  LOW: {
    bg: '#e3f2fd',      // Azure blue
    stroke: '#1976d2',  // Dark blue
  },
  MED: {
    bg: '#fff3e0',      // Orange
    stroke: '#e65100',  // Dark orange
  },
  HIGH: {
    bg: '#fce4ec',      // Pink/Magenta
    stroke: '#c2185b',  // Dark pink
  },
};

const COLOR_BY_STATUS: Record<TaskStatus, { bg: string; stroke: string; dashed?: boolean }> = {
  PENDING: {
    bg: '#f5f5f5',      // Light gray
    stroke: '#999999',  // Medium gray
  },
  RUNNING: {
    bg: '#e3f2fd',      // Azure blue
    stroke: '#1976d2',  // Dark blue
    dashed: true,
  },
  DONE: {
    bg: '#e8f5e9',      // Light green
    stroke: '#388e3c',  // Dark green
  },
  FAILED: {
    bg: '#ffebee',      // Light red
    stroke: '#d32f2f',  // Dark red
  },
  SKIPPED: {
    bg: '#e5e7eb',      // Gray
    stroke: '#6b7280',  // Dark gray
  },
};

/**
 * Generate unique ID for Excalidraw elements
 */
function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Get status color, preferring status over complexity
 */
function getTaskColors(
  task: DagTask,
): { bg: string; stroke: string; dashed?: boolean } {
  const status = task.status ?? 'PENDING';
  // Status takes precedence, but if PENDING, use complexity for better visualization
  if (status === 'PENDING' && task.complexity) {
    return COLOR_BY_COMPLEXITY[task.complexity] || COLOR_BY_COMPLEXITY.MED;
  }
  return COLOR_BY_STATUS[status] || COLOR_BY_STATUS.PENDING;
}

/**
 * Create rectangle element for a task
 */
function createTaskElement(
  task: DagTask,
  x: number,
  y: number,
): ExcalidrawElement {
  const colors = getTaskColors(task);
  const complexity = task.complexity || 'MED';

  const text = `${task.id}\n${task.title}\n[${complexity}]`;

  return {
    id: task.id,
    type: 'rectangle',
    x,
    y,
    width: 120,
    height: 60,
    angle: 0,
    strokeColor: colors.stroke,
    backgroundColor: colors.bg,
    fillStyle: 'hachure',
    strokeWidth: 2,
    strokeStyle: colors.dashed ? 'dashed' : 'solid',
    roughness: 0,
    opacity: 100,
    roundness: { type: 2, value: 6 },
    text,
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

/**
 * Create arrow element for a dependency
 */
function createArrowElement(
  fromTaskId: string,
  toTaskId: string,
): ExcalidrawElement {
  return {
    id: generateId(),
    type: 'arrow',
    x: 0, // Will be computed from start/end binding
    y: 0,
    startBinding: { elementId: fromTaskId },
    endBinding: { elementId: toTaskId },
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

/**
 * Render DAG to Excalidraw JSON
 */
export function renderDagExcalidraw(dag: Dag): ExcalidrawData {
  const elements: ExcalidrawElement[] = [];
  const ranks = computeRanks(dag.tasks);

  // Group tasks by rank
  const byRank = new Map<number, DagTask[]>();
  for (const task of dag.tasks) {
    const r = ranks.get(task.id) ?? 1;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(task);
  }

  // Position elements
  const taskPositions = new Map<string, { x: number; y: number }>();

  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);

  for (const rank of sortedRanks) {
    const tasksInRank = byRank.get(rank)!;

    for (let i = 0; i < tasksInRank.length; i++) {
      const task = tasksInRank[i];

      // Position: X based on task index in rank, Y based on rank
      const x = 20 + i * 140;
      const y = 20 + (rank - 1) * 160;

      taskPositions.set(task.id, { x, y });

      // Create rectangle for this task
      const taskElement = createTaskElement(task, x, y);
      elements.push(taskElement);
    }
  }

  // Create arrows for dependencies
  for (const task of dag.tasks) {
    for (const depId of task.depends_on) {
      const arrow = createArrowElement(depId, task.id);
      elements.push(arrow);
    }
  }

  const data: ExcalidrawData = {
    type: 'excalidraw',
    version: 2,
    source: 'dare-dag-viz',
    elements,
    appState: {
      gridMode: 'grid',
      gridSize: 20,
      viewBackgroundColor: '#ffffff',
    },
    files: {},
  };

  return data;
}

/**
 * Serialize Excalidraw data to JSON string
 */
export function serializeExcalidraw(data: ExcalidrawData): string {
  return JSON.stringify(data, null, 2);
}
