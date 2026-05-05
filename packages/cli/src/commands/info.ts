import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { createRequire } from 'module';
import { convertYamlToDag } from '../utils/dag-converter.js';
import { loadAndApplyState, DEFAULT_STATE_PATH } from '../dag-runner/state-store.js';
import { loadGraphConfig } from '../graphrag/index.js';
import type { TaskStatus } from '../dag-runner/run_dag.js';

const require = createRequire(import.meta.url);

/**
 * `dare info` — print version, paths and project integrity.
 *
 * Read-only and side-effect free. Useful for diagnostics ("is the project
 * properly set up?", "where does the graph live?", "how many tasks pending?").
 */
export const infoCommand = new Command('info')
  .description("Show version, paths and the current project's DARE integrity")
  .action(async () => {
    const cwd = process.cwd();
    const cliPkg = require('../../package.json') as { version: string; name: string };

    console.log(chalk.blue.bold('\n📖 DARE Framework\n'));
    console.log(`  Package    : ${chalk.cyan(cliPkg.name)}@${chalk.cyan(cliPkg.version)}`);
    console.log(`  Node       : ${process.version}`);
    console.log(`  Platform   : ${process.platform} ${process.arch}`);
    console.log(`  CWD        : ${cwd}`);

    // Project artifacts
    const artifacts: Array<[string, string]> = [
      ['dare.config.json', 'dare.config.json'],
      ['DARE/DESIGN.md', path.join('DARE', 'DESIGN.md')],
      ['DARE/BLUEPRINT.md', path.join('DARE', 'BLUEPRINT.md')],
      ['DARE/dare-dag.yaml', path.join('DARE', 'dare-dag.yaml')],
      ['DARE/TASKS.md', path.join('DARE', 'TASKS.md')],
      ['DARE/.canvas.md', path.join('DARE', '.canvas.md')],
      ['dare-graph.yml', 'dare-graph.yml'],
      ['.dare/state.json', DEFAULT_STATE_PATH],
    ];

    console.log(chalk.bold('\n  Artifacts:'));
    for (const [label, rel] of artifacts) {
      const abs = path.resolve(cwd, rel);
      const exists = await fs.pathExists(abs);
      const icon = exists ? chalk.green('✓') : chalk.gray('—');
      console.log(`    ${icon} ${label.padEnd(22)} ${exists ? chalk.gray(rel) : chalk.gray('(absent)')}`);
    }

    // Graph backend
    try {
      const graphConfig = await loadGraphConfig({ cwd });
      const graphPath = graphConfig.path
        ? path.resolve(cwd, graphConfig.path)
        : '(default)';
      const graphExists =
        graphConfig.backend !== 'neo4j' && (await fs.pathExists(graphPath));
      console.log(chalk.bold('\n  Knowledge graph:'));
      console.log(`    backend    : ${chalk.cyan(graphConfig.backend)}`);
      console.log(`    path       : ${graphPath}`);
      console.log(`    persisted  : ${graphExists ? chalk.green('yes') : chalk.gray('not yet')}`);
    } catch (err) {
      console.log(
        chalk.yellow(
          `\n  Knowledge graph: error reading config — ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    // Task summary (best-effort — only when DAG exists)
    const dagPath = path.resolve(cwd, 'DARE/dare-dag.yaml');
    if (await fs.pathExists(dagPath)) {
      const yaml = await fs.readFile(dagPath, 'utf-8');
      try {
        const dag = convertYamlToDag(yaml);
        await loadAndApplyState(dag, path.resolve(cwd, DEFAULT_STATE_PATH));
        const counts = countByStatus(dag.tasks.map((t) => t.status ?? 'PENDING'));
        const total = dag.tasks.length;
        console.log(chalk.bold('\n  Task progress:'));
        console.log(`    total      : ${total}`);
        console.log(`    ✅ DONE    : ${counts.DONE}`);
        console.log(`    🔄 RUNNING : ${counts.RUNNING}`);
        console.log(`    ⏳ PENDING : ${counts.PENDING}`);
        console.log(`    ❌ FAILED  : ${counts.FAILED}`);
        console.log(`    ⏭️  SKIPPED : ${counts.SKIPPED}`);
      } catch (err) {
        console.log(
          chalk.yellow(
            `\n  Task progress: dare-dag.yaml parse error — ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    }

    console.log();
  });

function countByStatus(statuses: TaskStatus[]): Record<TaskStatus, number> {
  const out: Record<TaskStatus, number> = {
    PENDING: 0,
    RUNNING: 0,
    DONE: 0,
    FAILED: 0,
    SKIPPED: 0,
  };
  for (const s of statuses) out[s]++;
  return out;
}
