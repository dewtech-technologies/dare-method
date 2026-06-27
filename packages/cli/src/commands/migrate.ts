import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { addAiOptions, aiOptionsFromFlags } from '../ai/command-options.js';
import type { AiCommandOptions } from '../ai/types.js';
import { runMigrate } from '../core/commands/migrate.js';

interface MigrateOptions extends AiCommandOptions {
  dir?: string;
  to?: string;
  check?: boolean;
}

export const migrateCommand = new Command('migrate')
  .description(
    'Plan a safe migration of a legacy project to a target stack, with Gherkin parity scenarios (brownfield Phase 2)',
  )
  .option('-d, --dir <path>', 'Target directory (default: current directory)')
  .option('--to <stack>', 'Target stack (e.g. go-gin, rust-axum, node-nestjs, python-fastapi)')
  .option('--check', 'Show source/target/modules/blocking gaps without writing artifacts');

addAiOptions(migrateCommand);

migrateCommand.action(async (opts: MigrateOptions) => {
  const targetDir = path.resolve(opts.dir ?? process.cwd());

  console.log(chalk.blue.bold('\n🚚 DARE Framework - Migration (Phase 2)\n'));
  console.log(chalk.gray(`  Project: ${targetDir}\n`));

  const aiOpts = aiOptionsFromFlags(opts);
  const result = await runMigrate({
    cwd: targetDir,
    ai: aiOpts.enabled,
    provider: aiOpts.provider,
    input: {
      to: opts.to,
      check: Boolean(opts.check),
    },
  });

  if (result.summary && result.summary.length > 0) {
    console.log(result.summary.join('\n'));
    console.log('');
  }

  if (aiOpts.enabled && aiOpts.json && result.enrichment) {
    console.log(JSON.stringify(result.enrichment, null, 2));
  }

  if (!result.ok) {
    console.error(result.error ?? 'Failed to run migrate command');
    process.exit(1);
  }
});
