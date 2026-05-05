import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { runDag, type RunnerName } from '../dag-runner/run_dag.js';
import { convertYamlToDag } from '../utils/dag-converter.js';

interface ExecuteOptions {
  parallel: boolean;
  runner: string;
  dag: string;
  resume: boolean;
  task?: string;
}

export const executeCommand = new Command('execute')
  .description('Execute tasks using the DAG Task Runner (real SDK adapters)')
  .option('--parallel', 'Execute independent tasks in parallel by rank', false)
  .option('--runner <runner>', 'Runner: cursor | claude | antigravity', 'cursor')
  .option('--dag <file>', 'Path to dare-dag.yaml', 'DARE/dare-dag.yaml')
  .option('--resume', 'Skip tasks already DONE/SKIPPED', false)
  .option('--task <id>', 'Execute only the task with the given id')
  .action(async (options: ExecuteOptions) => {
    console.log(chalk.blue.bold('\n⚡ DARE Framework - Execute Phase\n'));

    const dagPath = path.resolve(process.cwd(), options.dag);
    if (!(await fs.pathExists(dagPath))) {
      console.error(chalk.red(`❌ dare-dag.yaml not found at ${dagPath}`));
      console.log(chalk.yellow('Run: dare blueprint'));
      process.exit(1);
    }

    if (!isKnownRunner(options.runner)) {
      console.error(
        chalk.red(`❌ Unknown runner "${options.runner}". Use: cursor | claude | antigravity.`),
      );
      process.exit(1);
    }

    const dagContent = await fs.readFile(dagPath, 'utf-8');
    const dag = convertYamlToDag(dagContent);

    if (options.task) {
      const task = dag.tasks.find((t) => t.id === options.task);
      if (!task) {
        console.error(chalk.red(`❌ Task "${options.task}" not found in DAG`));
        process.exit(1);
      }
      console.log(chalk.cyan(`🎯 Executing single task: ${task.id} — ${task.title}`));
    } else {
      const remaining = dag.tasks.filter(
        (t) => !options.resume || (t.status !== 'DONE' && t.status !== 'SKIPPED'),
      );
      console.log(chalk.cyan(`📋 Tasks to execute: ${remaining.length} of ${dag.tasks.length}`));
      console.log(chalk.cyan(`🔀 Mode: ${options.parallel ? 'Parallel (by rank)' : 'Sequential'}`));
      console.log(chalk.cyan(`🖥️  Runner: ${options.runner}`));
      if (options.resume) console.log(chalk.cyan('🔁 Resume: skipping DONE/SKIPPED'));
      console.log();
    }

    try {
      await runDag(dag, {
        parallel: options.parallel,
        runner: options.runner,
        canvasPath: path.resolve(process.cwd(), 'DARE/.canvas.md'),
        resume: options.resume,
        onlyTaskId: options.task,
      });
    } catch (err) {
      console.error(chalk.red(`\n❌ Run failed: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }

    const failed = dag.tasks.filter((t) => t.status === 'FAILED').length;
    if (failed > 0) {
      console.log(chalk.yellow(`⚠  ${failed} task(s) FAILED. Re-run with --resume after fixing.`));
      process.exit(1);
    }

    console.log(chalk.green.bold('✅ Execution complete!\n'));
  });

function isKnownRunner(runner: string): runner is RunnerName {
  return runner === 'cursor' || runner === 'claude' || runner === 'antigravity';
}
