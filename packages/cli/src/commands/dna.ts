import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { addAiOptions, aiOptionsFromFlags } from '../ai/command-options.js';
import type { AiCommandOptions } from '../ai/types.js';
import { runDna } from '../core/commands/dna.js';

interface DnaOptions extends AiCommandOptions {
  dir?: string;
  check?: boolean;
  ast?: boolean;
}

export const dnaCommand = new Command('dna')
  .description(
    'Extract a legacy codebase\'s conventions into DARE/PROJECT-DNA.md (brownfield house-style ruleset)',
  )
  .option('-d, --dir <path>', 'Target directory (default: current directory)')
  .option('--check', 'Only show detected conventions without writing artifacts')
  .option('--ast', 'Use tree-sitter AST for convention extraction');

addAiOptions(dnaCommand);

dnaCommand.action(async (opts: DnaOptions) => {
  const targetDir = path.resolve(opts.dir ?? process.cwd());
  const aiOpts = aiOptionsFromFlags(opts);

  console.log(chalk.blue.bold('\n🧬 DARE Framework - Project DNA (conventions)\n'));
  console.log(chalk.gray(`  Scanning: ${targetDir}\n`));

  const spinner = ora('Running DNA extraction...').start();
  const result = await runDna({
    cwd: targetDir,
    ai: aiOpts.enabled,
    provider: aiOpts.provider,
    input: {
      check: opts.check,
      ast: opts.ast,
    },
  });
  spinner.stop();

  if (result.summary?.length) {
    for (const line of result.summary) {
      console.log(line);
      console.log('');
    }
  }

  if (aiOpts.json && aiOpts.enabled) {
    console.log(JSON.stringify(result.enrichment ?? { ok: result.ok, error: result.error }, null, 2));
  }

  if (!result.ok) {
    console.error(chalk.red(result.error ?? 'DNA execution failed'));
    process.exit(1);
  }
});
