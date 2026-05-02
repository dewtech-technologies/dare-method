/**
 * DARE Framework - DAG Task Runner
 * Adapted from Cursor Cookbook DAG Task Runner pattern
 * Executes tasks in parallel based on dependency graph
 */

import fs from 'fs-extra';
import chalk from 'chalk';

export interface DagTask {
  id: string;
  title: string;
  depends_on: string[];
  complexity: 'LOW' | 'MED' | 'HIGH';
  subtask_prompt: string;
  status?: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
  output?: string;
  tokens?: number;
  duration?: number;
}

export interface Dag {
  title: string;
  version: string;
  models: Record<string, string>;
  tasks: DagTask[];
}

export interface RunDagOptions {
  parallel: boolean;
  runner: string;
  canvasPath: string;
}

/**
 * Compute execution ranks for tasks based on dependencies.
 * Tasks in the same rank can run in parallel.
 */
function computeRanks(tasks: DagTask[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  function getRank(taskId: string, visited = new Set<string>()): number {
    if (ranks.has(taskId)) return ranks.get(taskId)!;
    if (visited.has(taskId)) throw new Error(`Circular dependency detected: ${taskId}`);

    visited.add(taskId);
    const task = taskMap.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    if (task.depends_on.length === 0) {
      ranks.set(taskId, 0);
      return 0;
    }

    const maxDepRank = Math.max(...task.depends_on.map((dep) => getRank(dep, new Set(visited))));
    const rank = maxDepRank + 1;
    ranks.set(taskId, rank);
    return rank;
  }

  tasks.forEach((t) => getRank(t.id));
  return ranks;
}

/**
 * Render real-time canvas with task status
 */
async function renderCanvas(dag: Dag, canvasPath: string): Promise<void> {
  const statusIcon: Record<string, string> = {
    PENDING: '⏳',
    RUNNING: '🔄',
    DONE: '✅',
    FAILED: '❌',
    SKIPPED: '⏭️',
  };

  const lines = [
    `# DARE DAG Execution - ${dag.title}`,
    ``,
    `**Updated:** ${new Date().toISOString()}`,
    ``,
    `## Tasks`,
    ``,
    `| ID | Title | Status | Duration | Tokens |`,
    `|----|-------|--------|----------|--------|`,
  ];

  for (const task of dag.tasks) {
    const icon = statusIcon[task.status || 'PENDING'];
    const duration = task.duration ? `${task.duration}ms` : '-';
    const tokens = task.tokens ? `${task.tokens}` : '-';
    lines.push(`| ${task.id} | ${task.title} | ${icon} ${task.status || 'PENDING'} | ${duration} | ${tokens} |`);
  }

  const done = dag.tasks.filter((t) => t.status === 'DONE').length;
  const total = dag.tasks.length;
  const pct = Math.round((done / total) * 100);

  lines.push('');
  lines.push(`## Progress: ${done}/${total} tasks (${pct}%)`);
  lines.push('');
  lines.push(`${'█'.repeat(Math.round(pct / 5))}${'░'.repeat(20 - Math.round(pct / 5))} ${pct}%`);

  await fs.ensureDir(canvasPath.replace(/\/[^/]+$/, ''));
  await fs.writeFile(canvasPath, lines.join('\n'));
}

/**
 * Execute a single task (placeholder - AI agent executes in real use)
 */
async function executeTask(task: DagTask, context: string, runner: string): Promise<{ output: string; tokens: number }> {
  // In real usage, this calls the AI agent (Cursor/Antigravity) with the task prompt
  // For now, we simulate execution
  const delay = task.complexity === 'HIGH' ? 2000 : task.complexity === 'MED' ? 1000 : 500;
  await new Promise((resolve) => setTimeout(resolve, delay));

  return {
    output: `Task ${task.id} completed by ${runner}`,
    tokens: Math.floor(Math.random() * 2000) + 500,
  };
}

/**
 * Main DAG runner - executes tasks in parallel based on dependency ranks
 */
export async function runDag(dag: Dag, options: RunDagOptions): Promise<void> {
  const { parallel, runner, canvasPath } = options;

  // Initialize all tasks as PENDING
  dag.tasks.forEach((t) => (t.status = 'PENDING'));
  await renderCanvas(dag, canvasPath);

  if (!parallel) {
    // Sequential execution
    for (const task of dag.tasks) {
      task.status = 'RUNNING';
      await renderCanvas(dag, canvasPath);
      console.log(chalk.cyan(`  🔄 Running ${task.id}: ${task.title}`));

      const start = Date.now();
      const result = await executeTask(task, '', runner);
      task.status = 'DONE';
      task.output = result.output;
      task.tokens = result.tokens;
      task.duration = Date.now() - start;

      console.log(chalk.green(`  ✅ ${task.id} done (${task.duration}ms, ${task.tokens} tokens)`));
      await renderCanvas(dag, canvasPath);
    }
    return;
  }

  // Parallel execution using ranks
  const ranks = computeRanks(dag.tasks);
  const maxRank = Math.max(...ranks.values());

  for (let rank = 0; rank <= maxRank; rank++) {
    const rankTasks = dag.tasks.filter((t) => ranks.get(t.id) === rank && t.status === 'PENDING');

    if (rankTasks.length === 0) continue;

    console.log(chalk.yellow(`\n  📦 Rank ${rank}: Executing ${rankTasks.length} task(s) in parallel`));

    // Check if any dependency failed
    const failedDeps = rankTasks.filter((t) =>
      t.depends_on.some((dep) => dag.tasks.find((d) => d.id === dep)?.status === 'FAILED')
    );

    failedDeps.forEach((t) => {
      t.status = 'SKIPPED';
      console.log(chalk.gray(`  ⏭️  Skipping ${t.id} (dependency failed)`));
    });

    const executableTasks = rankTasks.filter((t) => t.status === 'PENDING');

    // Build context from parent outputs
    const parentOutputs = executableTasks.map((t) =>
      t.depends_on
        .map((dep) => dag.tasks.find((d) => d.id === dep)?.output || '')
        .filter(Boolean)
        .join('\n')
    );

    // Mark all as RUNNING
    executableTasks.forEach((t) => (t.status = 'RUNNING'));
    await renderCanvas(dag, canvasPath);

    // Execute in parallel
    await Promise.all(
      executableTasks.map(async (task, i) => {
        const start = Date.now();
        console.log(chalk.cyan(`    🔄 ${task.id}: ${task.title}`));

        try {
          const result = await executeTask(task, parentOutputs[i], runner);
          task.status = 'DONE';
          task.output = result.output;
          task.tokens = result.tokens;
          task.duration = Date.now() - start;
          console.log(chalk.green(`    ✅ ${task.id} done (${task.duration}ms, ${task.tokens} tokens)`));
        } catch (err) {
          task.status = 'FAILED';
          task.duration = Date.now() - start;
          console.log(chalk.red(`    ❌ ${task.id} failed: ${err}`));
        }

        await renderCanvas(dag, canvasPath);
      })
    );
  }

  const done = dag.tasks.filter((t) => t.status === 'DONE').length;
  const failed = dag.tasks.filter((t) => t.status === 'FAILED').length;
  const skipped = dag.tasks.filter((t) => t.status === 'SKIPPED').length;

  console.log(chalk.bold(`\n  📊 Summary: ${done} done, ${failed} failed, ${skipped} skipped`));
  console.log(chalk.cyan(`  📄 Canvas: ${canvasPath}\n`));
}
