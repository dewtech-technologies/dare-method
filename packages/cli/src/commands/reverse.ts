import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { addAiOptions, aiOptionsFromFlags } from '../ai/command-options.js';
import type { AiCommandOptions } from '../ai/types.js';
import { runReverse } from '../core/commands/reverse.js';

interface ReverseOptions extends AiCommandOptions {
  dir?: string;
  check?: boolean;
  modules?: string;
  excalidraw?: boolean;
  report?: boolean;
  deep?: boolean;
  ast?: boolean;
}

export const reverseCommand = new Command('reverse')
  .description(
    'Reverse-engineer an existing codebase into a Phase-0 IDEIA.md + module specs (brownfield onboarding)',
  )
  .option('-d, --dir <path>', 'Target directory (default: current directory)')
  .option('--check', 'Only show detected modules without writing artifacts')
  .option('--modules <list>', 'Limit to specific modules (comma-separated ids/names)')
  .option('--no-excalidraw', 'Skip generating the editable .excalidraw architecture canvas')
  .option('--report', 'Compute the confidence report + code-spec matrix from already-marked specs')
  .option('--deep', 'Also extract ERD + API surface (deterministic) and scaffold domain-rules / state-machines / permissions / C4')
  .option('--ast', 'Use tree-sitter AST extraction (requires --deep for full effect)');

addAiOptions(reverseCommand);

reverseCommand.action(async (opts: ReverseOptions) => {
  const targetDir = path.resolve(opts.dir ?? process.cwd());
  const aiOpts = aiOptionsFromFlags(opts);

  console.log(chalk.blue.bold('\n🔁 DARE Framework - Reverse Engineering (Phase 0)\n'));
  console.log(chalk.gray(`  Scanning: ${targetDir}\n`));

  const spinner = ora('Running reverse orchestration...').start();
  const result = await runReverse({
    cwd: targetDir,
    ai: aiOpts.enabled,
    provider: aiOpts.provider,
    deep: opts.deep,
    input: {
      check: opts.check,
      modules: opts.modules,
      excalidraw: opts.excalidraw,
      report: opts.report,
      ast: opts.ast,
      deep: opts.deep,
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
    console.error(chalk.red(result.error ?? 'Reverse execution failed'));
    process.exit(1);
  }
});
