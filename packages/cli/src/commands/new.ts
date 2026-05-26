/**
 * DARE v3.0 — `dare new` command
 *
 * Creates a new project from a DARE stack scaffold.
 * Currently supported stacks:
 *   - rails   → ruby-rails-8 (Rails 8 + Layered Design + OpenAPI + LLM + Action Cable)
 *
 * Usage:
 *   dare new myapp --stack rails
 *   dare new myapp --stack rails --llm openai --skip-examples
 *
 * License: MIT (D-001)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';

const SUPPORTED_STACKS = ['rails'] as const;
type SupportedStack = (typeof SUPPORTED_STACKS)[number];

export const newCommand = new Command('new')
  .description('Create a new DARE project from a stack scaffold')
  .argument('<app-name>', 'Application name (snake_case recommended for Rails)')
  .requiredOption(
    '--stack <stack>',
    `Stack to use. Supported: ${SUPPORTED_STACKS.join(', ')}`,
  )
  .option(
    '--output-dir <dir>',
    'Directory to generate the project in (default: ./<app-name>)',
  )
  .option(
    '--llm <provider>',
    'Default LLM provider: openai | dummy (default: dummy)',
    'dummy',
  )
  .option(
    '--skip-examples',
    'Skip generating example resources (User handler/service/etc.)',
    false,
  )
  .option(
    '--skip-llm',
    'Skip generating LLM integration layer (app/llm/)',
    false,
  )
  .option(
    '--skip-channels',
    'Skip generating Action Cable channels',
    false,
  )
  .option(
    '--json',
    'Output result as JSON (M-03: CLI --json support)',
    false,
  )
  .action(async (appName: string, options: {
    stack: string;
    outputDir?: string;
    llm: string;
    skipExamples: boolean;
    skipLlm: boolean;
    skipChannels: boolean;
    json: boolean;
    noBanner: boolean;
  }) => {
    // Show banner unless suppressed (--no-banner / DARE_NO_BANNER=1 / non-TTY)
    if (!options.noBanner) {
      const { printBanner } = await import('../utils/banner.js');
      printBanner();
    }

    // Validate stack
    if (!SUPPORTED_STACKS.includes(options.stack as SupportedStack)) {
      const msg = `Unknown stack: "${options.stack}". Supported: ${SUPPORTED_STACKS.join(', ')}`;
      if (options.json) {
        console.log(JSON.stringify({ error: msg, supported_stacks: SUPPORTED_STACKS }));
      } else {
        console.error(chalk.red(`\nError: ${msg}\n`));
      }
      process.exit(1);
    }

    const outputDir = options.outputDir
      ? path.resolve(options.outputDir)
      : path.resolve(process.cwd(), appName);

    if (!options.json) {
      console.log(chalk.blue.bold(`\nDARE v3.0 — Creating ${options.stack} project: ${chalk.cyan(appName)}\n`));
    }

    const spinner = options.json ? null : ora(`Generating ${options.stack} scaffold...`).start();

    try {
      let result;

      if (options.stack === 'rails') {
        const { RailsScaffold } = await import('@dewtech/dare-stack-ruby-rails-8');
        const scaffold = new RailsScaffold();

        result = await scaffold.generate(appName, {
          outputDir,
          llmProvider:  options.llm === 'openai' ? 'openai' : 'dummy',
          skipExamples: options.skipExamples,
          skipLlm:      options.skipLlm,
          skipChannels: options.skipChannels,
          verbose:      !options.json,
        });
      }

      spinner?.succeed(chalk.green(`Project ${chalk.bold(appName)} created successfully!`));

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          app_name: appName,
          stack: options.stack,
          output_dir: outputDir,
          files_created: result?.filesCreated?.length ?? 0,
          directories_created: result?.directoriesCreated?.length ?? 0,
        }, null, 2));
        return;
      }

      console.log(chalk.cyan('\nNext steps:\n'));
      console.log(`  ${chalk.gray('1.')} cd ${appName}`);
      console.log(`  ${chalk.gray('2.')} rails new . --database=postgresql  ${chalk.gray('(if not done yet)')}`);
      console.log(`  ${chalk.gray('3.')} bundle install`);
      console.log(`  ${chalk.gray('4.')} bin/rails db:create db:migrate`);
      console.log(`  ${chalk.gray('5.')} bundle exec rspec`);
      console.log(`  ${chalk.gray('6.')} bundle exec rake dare:metrics\n`);

      console.log(chalk.gray(`DARE artifacts:`));
      console.log(chalk.gray(`  llms.txt          — AI agent context`));
      console.log(chalk.gray(`  config/dare.yml   — DARE configuration`));
      console.log(chalk.gray(`  lib/tasks/dare.rake — rake dare:metrics`));
      console.log(chalk.gray(`  .dare/skills.yml  — installed skills manifest\n`));

    } catch (err) {
      spinner?.fail(chalk.red('Failed to create project'));
      if (options.json) {
        console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      } else {
        console.error(chalk.red(`\n${err instanceof Error ? err.message : String(err)}\n`));
      }
      process.exit(1);
    }
  });
