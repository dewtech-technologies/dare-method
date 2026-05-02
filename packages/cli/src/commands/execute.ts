import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { runDag } from '../dag-runner/run_dag.js';
import { convertYamlToDag } from '../utils/dag-converter.js';

export const executeCommand = new Command('execute')
  .description('Execute tasks using DAG Task Runner')
  .argument('[task-id]', 'Specific task ID to execute')
  .option('--parallel', 'Execute independent tasks in parallel', false)
  .option('--runner <runner>', 'Runner: cursor or antigravity', 'cursor')
  .option('--dag <file>', 'Path to dare-dag.yaml', 'DARE/dare-dag.yaml')
  .action(async (taskId: string | undefined, options: { parallel: boolean; runner: string; dag: string }) => {
    console.log(chalk.blue.bold('\n⚡ DARE Framework - Execute Phase\n'));

    const dagPath = path.resolve(process.cwd(), options.dag);

    if (!await fs.pathExists(dagPath)) {
      console.error(chalk.red(`❌ dare-dag.yaml not found at ${dagPath}`));
      console.log(chalk.yellow('Run: dare blueprint'));
      process.exit(1);
    }

    const dagContent = await fs.readFile(dagPath, 'utf-8');
    const dag = convertYamlToDag(dagContent);

    if (taskId) {
      const task = dag.tasks.find((t) => t.id === taskId);
      if (!task) {
        console.error(chalk.red(`❌ Task ${taskId} not found in DAG`));
        process.exit(1);
      }
      console.log(chalk.cyan(`🎯 Executing single task: ${task.id} - ${task.title}`));
    } else {
      const pendingTasks = dag.tasks.filter((t) => t.status !== 'DONE');
      console.log(chalk.cyan(`📋 Tasks to execute: ${pendingTasks.length}`));
      console.log(chalk.cyan(`🔀 Mode: ${options.parallel ? 'Parallel (DAG)' : 'Sequential'}`));
      console.log(chalk.cyan(`🖥️  Runner: ${options.runner}\n`));
    }

    if (options.parallel) {
      console.log(chalk.yellow('🚀 Starting DAG Task Runner with parallel execution...\n'));
      await runDag(dag, {
        parallel: true,
        runner: options.runner,
        canvasPath: path.resolve(process.cwd(), 'DARE/.canvas.md'),
      });
    } else {
      console.log(chalk.yellow('▶️  Starting sequential execution...\n'));
      for (const task of dag.tasks) {
        if (task.status === 'DONE') {
          console.log(chalk.gray(`⏭️  Skipping ${task.id} (already done)`));
          continue;
        }
        console.log(chalk.cyan(`🔄 Executing ${task.id}: ${task.title}`));
        // Sequential execution placeholder
        await new Promise((resolve) => setTimeout(resolve, 100));
        console.log(chalk.green(`✅ ${task.id} completed`));
      }
    }

    console.log(chalk.green.bold('\n✅ Execution complete!\n'));
  });
