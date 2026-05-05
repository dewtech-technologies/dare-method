import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { convertYamlToDag } from '../utils/dag-converter.js';
import { computeRanks, type Dag } from '../dag-runner/run_dag.js';

/**
 * `dare validate` — static checks on `dare-dag.yaml`. Designed for use in
 * pre-commit hooks and CI.
 *
 * Exit codes:
 *   0 → no errors (warnings are tolerated unless `--strict`)
 *   1 → at least one error
 *
 * Checks:
 *   - file exists and parses as YAML
 *   - task ids are unique and kebab-case
 *   - depends_on points to existing ids
 *   - no cycles (Kahn's traversal)
 *   - subtask_prompt is non-empty
 *   - WARNING: only one task at rank 0 (no real parallelism)
 */
export const validateCommand = new Command('validate')
  .description('Validate dare-dag.yaml integrity (suitable for pre-commit hooks and CI)')
  .option('--dag <file>', 'Path to dare-dag.yaml', 'DARE/dare-dag.yaml')
  .option('--strict', 'Treat warnings as errors', false)
  .action(async (options: { dag: string; strict: boolean }) => {
    const cwd = process.cwd();
    const dagPath = path.resolve(cwd, options.dag);

    if (!(await fs.pathExists(dagPath))) {
      console.error(chalk.red(`❌ ${options.dag} not found.`));
      process.exit(1);
    }

    const yaml = await fs.readFile(dagPath, 'utf-8');
    let dag: Dag;
    try {
      dag = convertYamlToDag(yaml);
    } catch (err) {
      console.error(chalk.red(`❌ Failed to parse ${options.dag}: ${formatError(err)}`));
      process.exit(1);
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Unique ids
    const seen = new Set<string>();
    for (const task of dag.tasks) {
      if (seen.has(task.id)) errors.push(`Duplicate task id: ${task.id}`);
      seen.add(task.id);
    }

    // 2. kebab-case ids
    const KEBAB_RE = /^[a-z][a-z0-9-]*$/;
    for (const task of dag.tasks) {
      if (!KEBAB_RE.test(task.id)) {
        errors.push(`Invalid id "${task.id}" — use kebab-case (a-z, 0-9, -).`);
      }
    }

    // 3. depends_on references existing ids
    for (const task of dag.tasks) {
      for (const dep of task.depends_on) {
        if (!seen.has(dep)) {
          errors.push(`Task "${task.id}" depends on unknown task "${dep}".`);
        }
        if (dep === task.id) {
          errors.push(`Task "${task.id}" depends on itself.`);
        }
      }
    }

    // 4. No cycles (computeRanks throws on cycles)
    if (errors.length === 0) {
      try {
        computeRanks(dag.tasks);
      } catch (err) {
        errors.push(formatError(err));
      }
    }

    // 5. Non-empty prompts
    for (const task of dag.tasks) {
      if (!task.subtask_prompt || task.subtask_prompt.trim().length === 0) {
        warnings.push(`Task "${task.id}" has empty subtask_prompt.`);
      }
    }

    // 6. Parallelism warning
    if (errors.length === 0) {
      const ranks = computeRanks(dag.tasks);
      const rank0 = [...ranks.values()].filter((r) => r === 0).length;
      if (rank0 < 2) {
        warnings.push(
          `Only ${rank0} task(s) at rank 0 — DAG has no real parallelism. Consider relaxing some depends_on.`,
        );
      }
    }

    // Report
    if (errors.length === 0 && warnings.length === 0) {
      console.log(
        chalk.green(`✅ ${options.dag}: ${dag.tasks.length} tasks — valid.`),
      );
      return;
    }

    for (const e of errors) console.log(chalk.red(`  ❌ ${e}`));
    for (const w of warnings) console.log(chalk.yellow(`  ⚠  ${w}`));

    const failOnWarnings = options.strict && warnings.length > 0;
    if (errors.length > 0 || failOnWarnings) {
      console.log(
        chalk.red(
          `\n  ${errors.length} error(s), ${warnings.length} warning(s).${failOnWarnings ? ' (--strict)' : ''}`,
        ),
      );
      process.exit(1);
    }

    console.log(
      chalk.yellow(`\n  0 errors, ${warnings.length} warning(s). Pass --strict to fail on warnings.`),
    );
  });

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
