/**
 * Excalidraw Renderer for DARE DAG Visualization.
 *
 * Maps a DARE DAG (task graph) onto the generic graph renderer
 * (`graph-renderer.ts`) so the task DAG and `dare reverse`'s module graph
 * share one rendering engine:
 *   - Tasks → rectangles colored by status (complexity as fallback when PENDING)
 *   - Dependencies → arrows
 *   - Tasks grouped by rank in swim lanes
 *
 * Design tokens: /docs/DESIGN-TOKENS-EXCALIDRAW.md
 * License: MIT (D-001 — part of DARE CLI)
 */

import { Dag, DagTask, TaskStatus } from '../dag-runner/run_dag.js';
import {
  renderGraphExcalidraw,
  serializeExcalidraw,
  type ExcalidrawData,
  type GraphNode,
} from './graph-renderer.js';

export { serializeExcalidraw, type ExcalidrawData };

/** Color palette based on DARE Design Tokens. */
const COLOR_BY_COMPLEXITY = {
  LOW: { bg: '#e3f2fd', stroke: '#1976d2' }, // Azure blue
  MED: { bg: '#fff3e0', stroke: '#e65100' }, // Orange
  HIGH: { bg: '#fce4ec', stroke: '#c2185b' }, // Pink/Magenta
};

const COLOR_BY_STATUS: Record<TaskStatus, { bg: string; stroke: string; dashed?: boolean }> = {
  PENDING: { bg: '#f5f5f5', stroke: '#999999' },
  RUNNING: { bg: '#e3f2fd', stroke: '#1976d2', dashed: true },
  DONE: { bg: '#e8f5e9', stroke: '#388e3c' },
  FAILED: { bg: '#ffebee', stroke: '#d32f2f' },
  SKIPPED: { bg: '#e5e7eb', stroke: '#6b7280' },
};

/** Status takes precedence; PENDING falls back to complexity for richer color. */
function getTaskColors(task: DagTask): { bg: string; stroke: string; dashed?: boolean } {
  const status = task.status ?? 'PENDING';
  if (status === 'PENDING' && task.complexity) {
    return COLOR_BY_COMPLEXITY[task.complexity] || COLOR_BY_COMPLEXITY.MED;
  }
  return COLOR_BY_STATUS[status] || COLOR_BY_STATUS.PENDING;
}

function taskToGraphNode(task: DagTask): GraphNode {
  const colors = getTaskColors(task);
  const complexity = task.complexity || 'MED';
  return {
    id: task.id,
    depends_on: task.depends_on,
    labelLines: [task.id, task.title, `[${complexity}]`],
    bg: colors.bg,
    stroke: colors.stroke,
    dashed: colors.dashed,
  };
}

/** Render a task DAG to Excalidraw JSON via the generic graph renderer. */
export function renderDagExcalidraw(dag: Dag): ExcalidrawData {
  return renderGraphExcalidraw(dag.tasks.map(taskToGraphNode), {
    source: 'dare-dag-viz',
  });
}
