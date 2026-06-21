import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { loadAiConfig, normalizeProviderName } from '../ai/config.js';
import { buildEnrichmentPrompt } from '../ai/prompts.js';
import { runCommandEnrichment } from '../ai/pipeline.js';
import { probeAllProviders, resolveProvider, listProviderNames } from '../ai/registry.js';
import { jsonSchemaForCommand } from '../ai/schemas.js';
import type { AiCommandName } from '../ai/types.js';

interface AiRunOptions {
  provider?: string;
  prompt?: string;
  promptFile?: string;
  facts?: string;
  command?: string;
  cwd?: string;
  json?: boolean;
}

export const aiCommand = new Command('ai')
  .description('Terminal-first AI providers for DARE command enrichment');

aiCommand
  .command('doctor')
  .description('Probe configured AI providers (codex, claude-code, cursor-cli, antigravity-cli)')
  .option('-d, --dir <path>', 'Project directory (default: cwd)')
  .option('--json', 'Machine-readable output', false)
  .action(async (opts: { dir?: string; json?: boolean }) => {
    const cwd = path.resolve(opts.dir ?? process.cwd());
    const config = await loadAiConfig(cwd);
    const statuses = await probeAllProviders(config);

    if (opts.json) {
      console.log(JSON.stringify({ defaultProvider: config.defaultProvider, providers: statuses }, null, 2));
      return;
    }

    console.log(chalk.blue.bold('\n🩺 DARE AI — provider doctor\n'));
    console.log(chalk.gray(`  Default: ${config.defaultProvider}\n`));
    for (const status of statuses) {
      const icon = status.availability === 'available' ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${icon} ${chalk.bold(status.name)} (${status.command})`);
      console.log(chalk.gray(`      ${status.detail}\n`));
    }
  });

aiCommand
  .command('providers')
  .description('List supported AI provider names')
  .option('--json', 'Machine-readable output', false)
  .action((opts: { json?: boolean }) => {
    const names = listProviderNames();
    if (opts.json) {
      console.log(JSON.stringify({ providers: names }, null, 2));
      return;
    }
    console.log(chalk.blue.bold('\n🤖 DARE AI providers\n'));
    for (const name of names) {
      console.log(`  · ${name}`);
    }
    console.log('');
  });

aiCommand
  .command('run')
  .description('Run a one-off AI request with JSON output validation')
  .option('--provider <name>', 'Provider name (default from dare.config.json ai.defaultProvider)')
  .option('--prompt <text>', 'Prompt text')
  .option('--prompt-file <path>', 'Read prompt from file')
  .option('--facts <path>', 'JSON facts file merged into enrichment prompt')
  .option('--command <name>', 'DARE command schema (reverse, dna, migrate, design, patterns, …)')
  .option('-d, --dir <path>', 'Working directory (default: cwd)')
  .option('--json', 'Print structured JSON result', false)
  .action(async (opts: AiRunOptions) => {
    const cwd = path.resolve(opts.cwd ?? process.cwd());
    const config = await loadAiConfig(cwd);
    const providerName = normalizeProviderName(opts.provider) ?? config.defaultProvider;

    if (opts.command) {
      const command = opts.command as AiCommandName;
      let facts: unknown = {};
      if (opts.facts) {
        facts = await fs.readJSON(path.resolve(cwd, opts.facts));
      }
      const result = await runCommandEnrichment({
        command,
        cwd,
        facts,
        provider: providerName,
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.ok) {
        console.log(chalk.green(`OK (${result.provider}) → ${result.artifactPath}`));
      } else {
        console.error(chalk.red(`FAIL (${result.provider}): ${result.error}`));
        process.exit(1);
      }
      return;
    }

    const prompt =
      opts.prompt ??
      (opts.promptFile ? await fs.readFile(path.resolve(cwd, opts.promptFile), 'utf-8') : '');
    if (!prompt.trim()) {
      console.error(chalk.red('Error: --prompt or --prompt-file is required when --command is omitted'));
      process.exit(1);
    }

    let factsBlock = '';
    if (opts.facts) {
      const facts = await fs.readJSON(path.resolve(cwd, opts.facts));
      factsBlock = `\n\nFacts:\n${JSON.stringify(facts, null, 2)}`;
    }

    const schema = opts.command ? jsonSchemaForCommand(opts.command as AiCommandName) : undefined;
    const { provider } = resolveProvider(config, providerName);
    const result = await provider.run({
      prompt: prompt + factsBlock,
      cwd,
      schema,
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
      return;
    }

    if (result.ok) {
      console.log(chalk.green(`OK (${result.provider})`));
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.error(chalk.red(`FAIL (${result.provider}): ${result.error}`));
      process.exit(1);
    }
  });

// Hidden helper: print prompt for debugging
aiCommand
  .command('prompt')
  .description('Render the enrichment prompt for a DARE command (debug)')
  .argument('<command>', 'DARE command name')
  .option('--facts <path>', 'JSON facts file')
  .option('-d, --dir <path>', 'Working directory')
  .action(async (command: string, opts: { facts?: string; dir?: string }) => {
    const cwd = path.resolve(opts.dir ?? process.cwd());
    const facts = opts.facts
      ? await fs.readJSON(path.resolve(cwd, opts.facts))
      : {};
    const prompt = buildEnrichmentPrompt(command as AiCommandName, facts);
    console.log(prompt);
  });
