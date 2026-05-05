/**
 * DARE Framework — DAG Task Runner
 *
 * Executes tasks in parallel based on a dependency graph (Kahn's ranks),
 * delegating actual execution to a per-runner adapter (Claude / Cursor /
 * Antigravity). Adapted from the Cursor Cookbook DAG Task Runner pattern.
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { getAdapter, MissingApiKeyError, type RunnerAdapter } from './adapters/index.js';
import { capOutput } from './utils/cap-output.js';
import { composePrompt } from './utils/stitch-context.js';
import {
  TaskAbortedError,
  TaskTimeoutError,
  withTimeout,
} from './utils/timeout.js';

export type Complexity = 'LOW' | 'MED' | 'HIGH';
export type RunnerName = 'cursor' | 'claude' | 'antigravity';
export type TaskStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';

export interface DagTask {
  id: string;
  title: string;
  depends_on: string[];
  complexity: Complexity;
  subtask_prompt: string;
  /** Optional path (relative to project root) to a spec file with detailed instructions. */
  spec_file?: string;
  status?: TaskStatus;
  output?: string;
  /** Last error message when status is FAILED. */
  error?: string;
  tokens?: number;
  duration?: number;
}

/** Hard limits applied per task during execution. */
export interface DagLimits {
  /** Snippet (in chars) of each parent's output injected into a child's context. */
  parent_context_chars: number;
  /** Cap (in chars) on the captured output of a single task. */
  task_output_chars: number;
  /** Per-task timeout, used by AbortController. */
  timeout_seconds: number;
}

/** complexity → model mapping. */
export type DagModelMap = Record<Complexity, string>;

/**
 * Per-runner model mapping. Legacy flat schema is normalized into this form
 * by the YAML parser.
 */
export type DagModels = Partial<Record<RunnerName, DagModelMap>>;

export interface Dag {
  title: string;
  version: string;
  generated?: string;
  limits?: DagLimits;
  models: DagModels;
  tasks: DagTask[];
}

/** Defaults used when a YAML omits the `limits` block. */
export const DEFAULT_DAG_LIMITS: DagLimits = {
  parent_context_chars: 2000,
  task_output_chars: 4000,
  timeout_seconds: 600,
};

export interface RunDagOptions {
  parallel: boolean;
  runner: RunnerName | string;
  canvasPath: string;
  /** When true, only PENDING/FAILED tasks run (DONE/SKIPPED are kept). */
  resume?: boolean;
  /** Restrict execution to a single task id. */
  onlyTaskId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute the DAG. Tasks are statefully mutated in place: status, output,
 * error, tokens and duration get filled in as execution progresses.
 */
export async function runDag(dag: Dag, options: RunDagOptions): Promise<void> {
  const { parallel, runner, canvasPath, resume = false, onlyTaskId } = options;

  if (!isKnownRunner(runner)) {
    throw new Error(
      `Unknown runner "${runner}". Expected one of: cursor | claude | antigravity.`,
    );
  }

  const adapter = await getAdapter(runner);
  const limits = dag.limits ?? DEFAULT_DAG_LIMITS;
  const models = dag.models[runner];
  if (!models) {
    throw new Error(
      `dare-dag.yaml has no \`models.${runner}\` block. Define HIGH/MED/LOW for the chosen runner.`,
    );
  }

  // Reset status only for tasks we plan to execute.
  for (const task of dag.tasks) {
    if (resume && (task.status === 'DONE' || task.status === 'SKIPPED')) continue;
    task.status = 'PENDING';
    task.error = undefined;
  }

  // Honor SIGINT / SIGTERM — abort all in-flight tasks.
  const cancellation = new AbortController();
  const onSignal = (sig: NodeJS.Signals): void => {
    console.log(chalk.yellow(`\n  ⚠  Received ${sig}. Cancelling in-flight tasks…`));
    cancellation.abort('signal');
  };
  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));

  await renderCanvas(dag, canvasPath);

  try {
    if (onlyTaskId) {
      const task = dag.tasks.find((t) => t.id === onlyTaskId);
      if (!task) throw new Error(`Task "${onlyTaskId}" not found in DAG.`);
      await executeOne(task, dag, adapter, models, limits, cancellation.signal, canvasPath);
    } else if (parallel) {
      await executeParallel(dag, adapter, models, limits, cancellation.signal, canvasPath);
    } else {
      await executeSequential(dag, adapter, models, limits, cancellation.signal, canvasPath);
    }
  } finally {
    await renderCanvas(dag, canvasPath);
    printSummary(dag, canvasPath);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution strategies
// ─────────────────────────────────────────────────────────────────────────────

async function executeSequential(
  dag: Dag,
  adapter: RunnerAdapter,
  models: DagModelMap,
  limits: DagLimits,
  externalSignal: AbortSignal,
  canvasPath: string,
): Promise<void> {
  for (const task of dag.tasks) {
    if (task.status === 'DONE' || task.status === 'SKIPPED') continue;
    await executeOne(task, dag, adapter, models, limits, externalSignal, canvasPath);
  }
}

async function executeParallel(
  dag: Dag,
  adapter: RunnerAdapter,
  models: DagModelMap,
  limits: DagLimits,
  externalSignal: AbortSignal,
  canvasPath: string,
): Promise<void> {
  const ranks = computeRanks(dag.tasks);
  const maxRank = Math.max(0, ...ranks.values());

  for (let rank = 0; rank <= maxRank; rank++) {
    const rankTasks = dag.tasks.filter(
      (t) => ranks.get(t.id) === rank && t.status === 'PENDING',
    );
    if (rankTasks.length === 0) continue;

    console.log(
      chalk.yellow(`\n  📦 Rank ${rank}: ${rankTasks.length} task(s) in parallel`),
    );

    // Skip tasks whose dependencies failed/skipped — cascading skip.
    const skippable = rankTasks.filter((t) =>
      t.depends_on.some((dep) => {
        const parent = dag.tasks.find((d) => d.id === dep);
        return parent?.status === 'FAILED' || parent?.status === 'SKIPPED';
      }),
    );
    for (const t of skippable) {
      t.status = 'SKIPPED';
      console.log(chalk.gray(`  ⏭️  Skipping ${t.id} (dependency failed)`));
    }

    const executable = rankTasks.filter((t) => t.status === 'PENDING');
    if (executable.length === 0) {
      await renderCanvas(dag, canvasPath);
      continue;
    }

    await Promise.all(
      executable.map((task) =>
        executeOne(task, dag, adapter, models, limits, externalSignal, canvasPath),
      ),
    );
  }
}

async function executeOne(
  task: DagTask,
  dag: Dag,
  adapter: RunnerAdapter,
  models: DagModelMap,
  limits: DagLimits,
  externalSignal: AbortSignal,
  canvasPath: string,
): Promise<void> {
  const start = Date.now();
  task.status = 'RUNNING';
  task.error = undefined;
  await renderCanvas(dag, canvasPath);

  console.log(chalk.cyan(`    🔄 ${task.id}: ${task.title}`));

  const parents = task.depends_on
    .map((id) => dag.tasks.find((t) => t.id === id))
    .filter((t): t is DagTask => Boolean(t));

  const prompt = composePrompt({
    task,
    parents,
    parentContextChars: limits.parent_context_chars,
  });

  try {
    const { output, tokens } = await withTimeout(
      ({ signal }) =>
        adapter.call({
          prompt,
          complexity: task.complexity,
          models,
          signal,
        }),
      { timeoutSeconds: limits.timeout_seconds, externalSignal },
    );

    task.output = capOutput(output, limits.task_output_chars);
    task.tokens = tokens;
    task.duration = Date.now() - start;
    task.status = 'DONE';

    console.log(
      chalk.green(
        `    ✅ ${task.id} done (${task.duration}ms${tokens ? `, ${tokens} tokens` : ''})`,
      ),
    );
  } catch (err) {
    task.duration = Date.now() - start;
    task.status = 'FAILED';
    task.error = formatError(err);
    if (err instanceof MissingApiKeyError) {
      console.log(chalk.red(`    ❌ ${task.id} failed: ${err.message}`));
    } else if (err instanceof TaskTimeoutError) {
      console.log(
        chalk.red(`    ❌ ${task.id} timed out after ${err.timeoutSeconds}s`),
      );
    } else if (err instanceof TaskAbortedError) {
      console.log(chalk.yellow(`    ⚠  ${task.id} aborted: ${err.message}`));
    } else {
      console.log(chalk.red(`    ❌ ${task.id} failed: ${task.error}`));
    }
  } finally {
    await renderCanvas(dag, canvasPath);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas + helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<TaskStatus, string> = {
  PENDING: '⏳',
  RUNNING: '🔄',
  DONE: '✅',
  FAILED: '❌',
  SKIPPED: '⏭️',
};

async function renderCanvas(dag: Dag, canvasPath: string): Promise<void> {
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

function printSummary(dag: Dag, canvasPath: string): void {
  const done = dag.tasks.filter((t) => t.status === 'DONE').length;
  const failed = dag.tasks.filter((t) => t.status === 'FAILED').length;
  const skipped = dag.tasks.filter((t) => t.status === 'SKIPPED').length;
  console.log(
    chalk.bold(`\n  📊 Summary: ${done} done, ${failed} failed, ${skipped} skipped`),
  );
  console.log(chalk.cyan(`  📄 Canvas: ${canvasPath}\n`));
}

/**
 * Compute execution ranks for tasks based on dependencies.
 * Tasks in the same rank can run in parallel (Kahn's algorithm).
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

function isKnownRunner(runner: string): runner is RunnerName {
  return runner === 'cursor' || runner === 'claude' || runner === 'antigravity';
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
