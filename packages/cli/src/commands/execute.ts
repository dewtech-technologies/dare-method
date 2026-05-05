import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import {
  applyCascadingSkip,
  buildTaskPrompt,
  computeRanks,
  markDone,
  markFailed,
  markRunning,
  nextExecutableTasks,
  renderCanvas,
  type Dag,
  type DagTask,
  type TaskStatus,
} from '../dag-runner/run_dag.js';
import { convertYamlToDag } from '../utils/dag-converter.js';
import { createGraph, loadGraphConfig } from '../graphrag/index.js';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import {
  DEFAULT_STATE_PATH,
  loadAndApplyState,
  saveState,
} from '../dag-runner/state-store.js';

/**
 * `dare execute` — orchestrate DAG execution.
 *
 * The DARE CLI **does not** invoke any LLM API. Execution happens inside the
 * IDE the user is already authenticated in (Cursor / Antigravity / Claude
 * Code). This command is a coordinator the IDE agent calls into:
 *
 *   dare execute --next                      → print next executable tasks + prompts
 *   dare execute --complete <id> --output …  → mark a task DONE, ingest into graph
 *   dare execute --fail <id> --reason …      → mark a task FAILED + cascade-skip
 *   dare execute --status                    → render canvas + summary
 *   dare execute --reset <id>                → re-open a task (PENDING) for retry
 *
 * No flags = `--status`.
 */

interface ExecuteOptions {
  dag: string;
  next: boolean;
  status: boolean;
  complete?: string;
  fail?: string;
  reset?: string;
  output?: string;
  reason?: string;
  tokens?: string;
  duration?: string;
  noGraph: boolean;
  parallelHint: boolean;
}

export const executeCommand = new Command('execute')
  .description('Orchestrate DAG execution (the IDE agent runs each task)')
  .option('--dag <file>', 'Path to dare-dag.yaml', 'DARE/dare-dag.yaml')
  .option('--next', 'Print the next executable tasks (with composed prompts)', false)
  .option('--status', 'Render canvas and show summary (default action)', false)
  .option('--complete <id>', 'Mark a task DONE (use with --output)')
  .option('--fail <id>', 'Mark a task FAILED (use with --reason)')
  .option('--reset <id>', 'Reset a task back to PENDING')
  .option('--output <text>', 'Captured task output (used with --complete)')
  .option('--reason <text>', 'Failure reason (used with --fail)')
  .option('--tokens <n>', 'Tokens consumed (used with --complete)')
  .option('--duration <ms>', 'Task duration in ms (used with --complete)')
  .option('--no-graph', 'Skip knowledge-graph ingestion for this call', false)
  .option('--parallel-hint', 'When using --next, mark every rank-equal task as RUNNING', false)
  .action(async (options: ExecuteOptions) => {
    const cwd = process.cwd();
    const dagPath = path.resolve(cwd, options.dag);
    const canvasPath = path.resolve(cwd, 'DARE/.canvas.md');

    if (!(await fs.pathExists(dagPath))) {
      console.error(chalk.red(`❌ ${options.dag} not found.`));
      console.log(chalk.yellow('Run: dare blueprint'));
      process.exit(1);
    }

    const stateFile = path.resolve(cwd, DEFAULT_STATE_PATH);
    const dag = await loadDag(dagPath);
    await loadAndApplyState(dag, stateFile);

    const graph = options.noGraph ? undefined : await tryOpenGraph(cwd);

    try {
      if (options.complete) {
        await handleComplete(dag, options, stateFile, canvasPath, graph);
      } else if (options.fail) {
        await handleFail(dag, options, stateFile, canvasPath, graph);
      } else if (options.reset) {
        await handleReset(dag, options.reset, stateFile, canvasPath, graph);
      } else if (options.next) {
        await handleNext(dag, options, stateFile, canvasPath);
      } else {
        // Default: --status
        await handleStatus(dag, canvasPath);
      }
    } finally {
      graph?.close();
    }
  });

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleNext(
  dag: Dag,
  options: ExecuteOptions,
  stateFile: string,
  canvasPath: string,
): Promise<void> {
  const newlySkipped = applyCascadingSkip(dag);
  if (newlySkipped.length > 0) {
    console.log(chalk.gray(`↷ Auto-skipped ${newlySkipped.length} blocked task(s).`));
  }

  const ready = nextExecutableTasks(dag, true);
  if (ready.length === 0) {
    const remaining = dag.tasks.some((t) => t.status === 'PENDING' || t.status === 'RUNNING');
    if (remaining) {
      console.log(chalk.yellow('⏸  No tasks ready right now (waiting on RUNNING tasks to complete).'));
    } else {
      console.log(chalk.green('✅ All tasks resolved. Run `dare execute --status` for the summary.'));
    }
    await persist(dag, stateFile, canvasPath);
    return;
  }

  const ranks = computeRanks(dag.tasks);
  const rank = ranks.get(ready[0].id) ?? 0;
  console.log(
    chalk.blue.bold(`\n📦 Rank ${rank} — ${ready.length} task(s) ready in parallel\n`),
  );

  for (const task of ready) {
    if (options.parallelHint) markRunning(dag, task.id);
    printTaskBriefing(dag, task);
  }

  await persist(dag, stateFile, canvasPath);

  console.log(chalk.cyan('\nNext steps for the IDE agent:'));
  console.log('  1. Execute each task above (parallel or sequential — your choice).');
  console.log('  2. After each task: `dare execute --complete <id> --output "<summary>"`');
  console.log('  3. On failure: `dare execute --fail <id> --reason "<message>"`');
  console.log('  4. When this rank finishes, run `dare execute --next` again.\n');
}

async function handleComplete(
  dag: Dag,
  options: ExecuteOptions,
  stateFile: string,
  canvasPath: string,
  graph?: KnowledgeGraph,
): Promise<void> {
  const taskId = options.complete!;
  const tokens = options.tokens ? parseInt(options.tokens, 10) : undefined;
  const duration = options.duration ? parseInt(options.duration, 10) : undefined;

  const task = markDone(dag, taskId, {
    output: options.output,
    tokens,
    durationMs: duration,
    graph,
  });

  console.log(chalk.green(`✅ ${task.id} marked as DONE.`));
  if (task.tokens) console.log(chalk.gray(`   tokens: ${task.tokens}`));
  if (task.duration) console.log(chalk.gray(`   duration: ${task.duration}ms`));

  await persist(dag, stateFile, canvasPath);
}

async function handleFail(
  dag: Dag,
  options: ExecuteOptions,
  stateFile: string,
  canvasPath: string,
  graph?: KnowledgeGraph,
): Promise<void> {
  const taskId = options.fail!;
  const duration = options.duration ? parseInt(options.duration, 10) : undefined;

  const task = markFailed(dag, taskId, {
    error: options.reason ?? 'unspecified',
    durationMs: duration,
    graph,
  });

  console.log(chalk.red(`❌ ${task.id} marked as FAILED: ${task.error}`));
  const skipped = dag.tasks.filter((t) => t.status === 'SKIPPED');
  if (skipped.length > 0) {
    console.log(chalk.gray(`   Cascading-skipped: ${skipped.map((t) => t.id).join(', ')}`));
  }

  await persist(dag, stateFile, canvasPath);
}

async function handleReset(
  dag: Dag,
  taskId: string,
  stateFile: string,
  canvasPath: string,
  graph?: KnowledgeGraph,
): Promise<void> {
  const task = dag.tasks.find((t) => t.id === taskId);
  if (!task) {
    console.error(chalk.red(`❌ Task "${taskId}" not found.`));
    process.exit(1);
  }
  task.status = 'PENDING';
  task.error = undefined;
  task.output = undefined;
  task.duration = undefined;
  task.tokens = undefined;

  // Drop the stale graph node (and its outgoing edges) so the next DONE/FAILED
  // recreates it with fresh metadata. Best-effort.
  if (graph) {
    try {
      graph.deleteNode(`task:${taskId}`);
    } catch {
      // ignore — graph cleanup is non-critical
    }
  }

  console.log(chalk.cyan(`↺ ${task.id} reset to PENDING.`));
  await persist(dag, stateFile, canvasPath);
}

async function handleStatus(dag: Dag, canvasPath: string): Promise<void> {
  await renderCanvas(dag, canvasPath);

  const counts: Record<TaskStatus, number> = {
    PENDING: 0,
    RUNNING: 0,
    DONE: 0,
    FAILED: 0,
    SKIPPED: 0,
  };
  for (const t of dag.tasks) counts[t.status ?? 'PENDING']++;

  console.log(chalk.blue.bold(`\n📊 ${dag.title}\n`));
  console.log(`  ✅ DONE     : ${counts.DONE}`);
  console.log(`  🔄 RUNNING  : ${counts.RUNNING}`);
  console.log(`  ⏳ PENDING  : ${counts.PENDING}`);
  console.log(`  ❌ FAILED   : ${counts.FAILED}`);
  console.log(`  ⏭️  SKIPPED  : ${counts.SKIPPED}`);
  console.log(chalk.cyan(`\n  📄 Canvas: ${canvasPath}\n`));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadDag(dagPath: string): Promise<Dag> {
  const yaml = await fs.readFile(dagPath, 'utf-8');
  return convertYamlToDag(yaml);
}

async function persist(dag: Dag, stateFile: string, canvasPath: string): Promise<void> {
  await saveState(dag, stateFile);
  await renderCanvas(dag, canvasPath);
}

async function tryOpenGraph(cwd: string): Promise<KnowledgeGraph | undefined> {
  try {
    const config = await loadGraphConfig({ cwd });
    return await createGraph(config, { cwd });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.gray(`(graph disabled: ${msg})`));
    return undefined;
  }
}

function printTaskBriefing(dag: Dag, task: DagTask): void {
  console.log(chalk.bold(`▸ ${task.id} — ${task.title}`));
  console.log(chalk.gray(`  complexity: ${task.complexity}`));
  if (task.spec_file) console.log(chalk.gray(`  spec_file:  ${task.spec_file}`));
  console.log(chalk.gray('  prompt:'));
  const prompt = buildTaskPrompt(dag, task);
  for (const line of prompt.split('\n')) console.log(`    ${line}`);
  console.log();
}
