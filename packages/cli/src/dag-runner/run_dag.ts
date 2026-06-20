/**
 * DARE DAG Task Runner — orchestration only.
 *
 * The DAG runner is **not** an executor. The agent inside the user's IDE
 * (Cursor / Antigravity / Claude Code) executes each task using its native
 * runtime — the IDE is already authenticated and the user already pays for
 * inference there. This CLI is responsible for:
 *
 *   1. ordering tasks (Kahn's algorithm) and surfacing what to execute next
 *   2. computing the prompt the agent should run, with parent-output context
 *   3. recording status transitions (PENDING → RUNNING → DONE / FAILED / SKIPPED)
 *   4. cascading-skip when a parent fails
 *   5. rendering the live canvas at DARE/.canvas.md
 *   6. (optionally) ingesting finished tasks into the knowledge graph
 *
 * The actual task execution loop lives outside this file: see `dare execute`
 * (`--next` / `--complete` / `--fail`).
 */

import fs from 'fs-extra';
import path from 'path';
import { capOutput } from './utils/cap-output.js';
import { composePrompt } from './utils/stitch-context.js';
import { ingestTask } from './graph-ingest.js';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';

export type Complexity = 'LOW' | 'MED' | 'HIGH';
export type RunnerName = 'cursor' | 'claude' | 'antigravity' | 'codex';
export type TaskStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';

export interface DagTask {
  id: string;
  title: string;
  depends_on: string[];
  /** Runtime-only link for sub-DAG nesting (persisted in `.dare/state.json`). */
  __parentId?: string;
  complexity: Complexity;
  subtask_prompt: string;
  /** Optional path (relative to project root) to a spec file with detailed instructions. */
  spec_file?: string;
  status?: TaskStatus;
  output?: string;
  error?: string;
  tokens?: number;
  duration?: number;
}

export interface DagLimits {
  parent_context_chars: number;
  task_output_chars: number;
  timeout_seconds: number;
}

export type DagModelMap = Record<Complexity, string>;
export type DagModels = Partial<Record<RunnerName, DagModelMap>>;

export interface Dag {
  title: string;
  version: string;
  generated?: string;
  limits?: DagLimits;
  models: DagModels;
  tasks: DagTask[];
}

export const DEFAULT_DAG_LIMITS: DagLimits = {
  parent_context_chars: 2000,
  task_output_chars: 4000,
  timeout_seconds: 600,
};

// ─────────────────────────────────────────────────────────────────────────────
// Topological ranking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute execution ranks for tasks based on dependencies. Tasks in the same
 * rank can run in parallel (logical parallelism: the IDE agent decides
 * whether to literally fan them out or run them back-to-back).
 */
export function computeRanks(tasks: DagTask[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  function getRank(taskId: string, visited = new Set<string>()): number {
    if (ranks.has(taskId)) return ranks.get(taskId)!;
    if (visited.has(taskId)) {
      throw new Error(`Circular dependency detected: ${taskId}`);
    }
    visited.add(taskId);
    const task = taskMap.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    if (task.depends_on.length === 0) {
      ranks.set(taskId, 0);
      return 0;
    }
    const maxDepRank = Math.max(
      ...task.depends_on.map((dep) => getRank(dep, new Set(visited))),
    );
    const rank = maxDepRank + 1;
    ranks.set(taskId, rank);
    return rank;
  }

  for (const t of tasks) getRank(t.id);
  return ranks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the next batch of tasks the agent should execute now: PENDING tasks
 * whose every parent is DONE. These can be executed in parallel by the agent.
 *
 * If `currentRankOnly` is true (default), restrict to the lowest rank that
 * still has executable tasks — gives a clean "rank-by-rank" cadence.
 */
export function nextExecutableTasks(dag: Dag, currentRankOnly = true): DagTask[] {
  const byId = new Map(dag.tasks.map((t) => [t.id, t]));
  const ready = dag.tasks.filter((t) => {
    if (t.status === 'DONE' || t.status === 'SKIPPED') return false;
    if (t.status === 'RUNNING') return false; // already picked up
    return t.depends_on.every((d) => byId.get(d)?.status === 'DONE');
  });

  if (!currentRankOnly || ready.length === 0) return ready;

  const ranks = computeRanks(dag.tasks);
  const minRank = Math.min(...ready.map((t) => ranks.get(t.id) ?? 0));
  return ready.filter((t) => (ranks.get(t.id) ?? 0) === minRank);
}

/**
 * Cascade: any PENDING task whose dependency is FAILED/SKIPPED becomes SKIPPED.
 * Returns the list of newly-skipped tasks (caller can ingest them).
 */
export function applyCascadingSkip(dag: Dag): DagTask[] {
  const byId = new Map(dag.tasks.map((t) => [t.id, t]));
  const newlySkipped: DagTask[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of dag.tasks) {
      if (task.status !== 'PENDING') continue;
      const blocked = task.depends_on.some((d) => {
        const parent = byId.get(d);
        return parent?.status === 'FAILED' || parent?.status === 'SKIPPED';
      });
      if (blocked) {
        task.status = 'SKIPPED';
        newlySkipped.push(task);
        changed = true;
      }
    }
  }
  return newlySkipped;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt composition (what the agent should literally execute)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compose the prompt for a given task: the task's `subtask_prompt` plus an
 * "Upstream context" block with capped snippets of each parent's output.
 */
export function buildTaskPrompt(
  dag: Dag,
  task: DagTask,
  opts?: { graphLocate?: string },
): string {
  const limits = dag.limits ?? DEFAULT_DAG_LIMITS;
  const parents = task.depends_on
    .map((id) => dag.tasks.find((t) => t.id === id))
    .filter((t): t is DagTask => Boolean(t));

  return composePrompt({
    task,
    parents,
    parentContextChars: limits.parent_context_chars,
    graphLocate: opts?.graphLocate,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// State transitions (called by `dare execute --complete / --fail`)
// ─────────────────────────────────────────────────────────────────────────────

export interface MarkOptions {
  output?: string;
  error?: string;
  tokens?: number;
  durationMs?: number;
  graph?: KnowledgeGraph;
}

export function markRunning(dag: Dag, taskId: string): DagTask {
  const task = requireTask(dag, taskId);
  task.status = 'RUNNING';
  task.error = undefined;
  return task;
}

export function markDone(dag: Dag, taskId: string, opts: MarkOptions = {}): DagTask {
  const task = requireTask(dag, taskId);
  const limits = dag.limits ?? DEFAULT_DAG_LIMITS;
  task.status = 'DONE';
  task.output = opts.output ? capOutput(opts.output, limits.task_output_chars) : task.output;
  task.tokens = opts.tokens ?? task.tokens;
  task.duration = opts.durationMs ?? task.duration;
  task.error = undefined;
  if (opts.graph) safeIngest(opts.graph, task, dag);
  return task;
}

export function markFailed(dag: Dag, taskId: string, opts: MarkOptions = {}): DagTask {
  const task = requireTask(dag, taskId);
  task.status = 'FAILED';
  task.error = opts.error ?? task.error ?? 'unknown';
  task.duration = opts.durationMs ?? task.duration;
  if (opts.graph) safeIngest(opts.graph, task, dag);
  // Cascade-skip downstream tasks
  const skipped = applyCascadingSkip(dag);
  if (opts.graph) for (const t of skipped) safeIngest(opts.graph, t, dag);
  return task;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas rendering
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<TaskStatus, string> = {
  PENDING: '⏳',
  RUNNING: '🔄',
  DONE: '✅',
  FAILED: '❌',
  SKIPPED: '⏭️',
};

export async function renderCanvas(dag: Dag, canvasPath: string): Promise<void> {
  const lines: string[] = [
    `# DARE DAG Execution — ${dag.title}`,
    ``,
    `**Updated:** ${new Date().toISOString()}`,
    ``,
    `## Tasks`,
    ``,
    `| ID | Title | Status | Duration | Tokens |`,
    `|----|-------|--------|----------|--------|`,
  ];

  for (const task of dag.tasks) {
    const status = task.status ?? 'PENDING';
    const icon = STATUS_ICON[status];
    const duration = task.duration ? `${task.duration}ms` : '-';
    const tokens = task.tokens ? `${task.tokens}` : '-';
    lines.push(
      `| ${task.id} | ${task.title} | ${icon} ${status} | ${duration} | ${tokens} |`,
    );
  }

  const total = dag.tasks.length;
  const done = dag.tasks.filter((t) => t.status === 'DONE').length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const filled = Math.round(pct / 5);

  lines.push('');
  lines.push(`## Progress: ${done}/${total} tasks (${pct}%)`);
  lines.push('');
  lines.push(`${'█'.repeat(filled)}${'░'.repeat(20 - filled)} ${pct}%`);

  await fs.ensureDir(path.dirname(canvasPath));
  await fs.writeFile(canvasPath, lines.join('\n'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function requireTask(dag: Dag, taskId: string): DagTask {
  const task = dag.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task "${taskId}" not found in DAG`);
  return task;
}

function safeIngest(graph: KnowledgeGraph, task: DagTask, dag: Dag): void {
  try {
    ingestTask(graph, task, dag);
  } catch {
    // Best-effort. Ingestion failures must not break the orchestrator.
  }
}
