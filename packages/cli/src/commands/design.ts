import { Command } from 'commander';
import chalk from 'chalk';
import { addAiOptions, aiOptionsFromFlags } from '../ai/command-options.js';
import type { AiCommandOptions } from '../ai/types.js';
import { runDesign } from '../core/commands/design.js';

export const designCommand = new Command('design')
  .description('Generate a DESIGN.md from a project description')
  .argument('<description>', 'Project description')
  .option(
    '--interactive',
    'Emit deterministic planning questionnaire from dna/patterns facts (no LLM)',
  );

addAiOptions(designCommand);

designCommand.action(async (description: string, opts: { interactive?: boolean } & AiCommandOptions) => {
    const aiOpts = aiOptionsFromFlags(opts);
    console.log(chalk.blue.bold('\n📐 DARE Framework - Design Phase\n'));

    const result = await runDesign({
      cwd: process.cwd(),
      ai: aiOpts.enabled,
      provider: aiOpts.provider,
      input: {
        description,
        interactive: Boolean(opts.interactive),
      },
    });

    if (result.summary?.length) {
      for (const summaryLine of result.summary) {
        console.log(chalk.cyan(summaryLine));
      }
      console.log('');
    }

    if (aiOpts.enabled && aiOpts.json) {
      console.log(JSON.stringify(result.enrichment ?? null, null, 2));
      if (!result.ok) process.exit(1);
      return;
    }

    if (!result.ok) {
      console.error(chalk.red(`❌ ${result.error ?? 'Failed to generate DESIGN.md'}`));
      process.exit(1);
    }

    console.log(chalk.green('✅ DESIGN.md created at DARE/DESIGN.md'));
    console.log(chalk.cyan('\nNext: dare blueprint\n'));
  });
