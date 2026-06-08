import { Command } from 'commander';
import chalk from 'chalk';
import { loadSteeringFiles } from '../steering/loader.js';
import {
  resolveSteeringForFile,
  sortSteeringByPrecedence,
} from '../steering/resolver.js';
import { PathEscapeError } from '../utils/path-safety.js';
import type { SteeringFile } from '../steering/types.js';

function formatFileRow(f: SteeringFile): string {
  const scope = f.isBase ? 'base' : f.frontMatter.scope;
  const glob = f.frontMatter.glob ?? '—';
  const priority = f.frontMatter.priority ?? 0;
  return `${f.path.padEnd(32)} ${scope.padEnd(8)} ${String(glob).padEnd(16)} ${priority}`;
}

function fileToJson(f: SteeringFile) {
  return {
    path: f.path,
    scope: f.isBase ? 'base' : f.frontMatter.scope,
    glob: f.frontMatter.glob ?? null,
    priority: f.frontMatter.priority ?? 0,
    isBase: f.isBase,
  };
}

export const steeringCommand = new Command('steering')
  .description('Inspect resolved steering files (deterministic, no LLM)');

steeringCommand
  .command('list')
  .description('List discovered steering files and their precedence order')
  .option('--json', 'Emit JSON')
  .action((options: { json?: boolean }) => {
    const files = sortSteeringByPrecedence(loadSteeringFiles(process.cwd()));

    if (options.json) {
      console.log(JSON.stringify({ files: files.map(fileToJson) }));
      return;
    }

    console.log(chalk.blue.bold('\n📋 Steering files (precedence order)\n'));
    console.log(
      `${'path'.padEnd(32)} ${'scope'.padEnd(8)} ${'glob'.padEnd(16)} priority`,
    );
    for (const f of files) {
      console.log(formatFileRow(f));
    }
    console.log();
  });

steeringCommand
  .command('show <file>')
  .description('Resolve and print the steering applicable to <file>, in precedence order')
  .option('--json', 'Emit JSON')
  .action((file: string, options: { json?: boolean }) => {
    try {
      const allFiles = loadSteeringFiles(process.cwd());
      const resolution = resolveSteeringForFile(allFiles, file);

      if (options.json) {
        console.log(JSON.stringify(resolution));
        return;
      }

      console.log(chalk.blue.bold(`\n🧭 Steering for ${resolution.file}\n`));
      for (const block of resolution.blocks) {
        const label = block.isBase
          ? chalk.cyan('base')
          : `${block.frontMatter.scope}${block.frontMatter.glob ? ` (${block.frontMatter.glob})` : ''}`;
        console.log(chalk.bold(`${block.path}`) + chalk.gray(` — ${label}`));
        console.log(block.body.trimEnd());
        console.log();
      }
    } catch (err) {
      if (err instanceof PathEscapeError) {
        console.error('Error: path must be relative and stay within the project');
        process.exit(1);
      }
      throw err;
    }
  });
