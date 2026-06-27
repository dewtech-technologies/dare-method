import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import {
  assertRelativeSafe,
  resolveSafePath,
  PathEscapeError,
} from '../utils/path-safety.js';
import { addAiOptions, aiOptionsFromFlags } from '../ai/command-options.js';
import type { AiCommandOptions } from '../ai/types.js';
import { runPatterns, DIR_ESCAPE_MSG } from '../core/commands/patterns.js';

interface PatternsOptions extends AiCommandOptions {
  dir?: string;
  check?: boolean;
  modules?: string;
  inject?: boolean;
  ast?: boolean;
}

function resolveTargetDir(opts: PatternsOptions): string {
  const cwd = process.cwd();
  if (!opts.dir) return path.resolve(cwd);
  try {
    assertRelativeSafe(opts.dir);
    return resolveSafePath(cwd, opts.dir);
  } catch {
    throw new PathEscapeError(DIR_ESCAPE_MSG);
  }
}

export const patternsCommand = new Command('patterns')
  .description(
    'Discover recurring codebase patterns into DARE/PATTERNS.md (deterministic, no LLM)',
  )
  .option('-d, --dir <path>', 'Target directory (default: current directory)')
  .option('--check', 'Only show detected patterns without writing artifacts')
  .option('--modules <list>', 'Limit to specific modules (comma-separated ids/names)')
  .option('--inject', 'Confirm PATTERNS.md as steering base (idempotent, preserves user steering)')
  .option('--ast', 'Use tree-sitter AST for pattern mining');

addAiOptions(patternsCommand);

patternsCommand.action(async (opts: PatternsOptions) => {
  let targetDir: string;
  try {
    targetDir = resolveTargetDir(opts);
  } catch {
    console.error(DIR_ESCAPE_MSG);
    process.exit(1);
  }

  console.log(chalk.blue.bold('\n🔍 DARE Framework - Pattern Discovery\n'));
  console.log(chalk.gray(`  Scanning: ${targetDir}\n`));

  const aiOpts = aiOptionsFromFlags(opts);
  const result = await runPatterns({
    cwd: targetDir,
    ai: aiOpts.enabled,
    provider: aiOpts.provider,
    input: {
      check: Boolean(opts.check),
      modules: opts.modules,
      inject: Boolean(opts.inject),
      ast: Boolean(opts.ast),
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
    console.error(result.error ?? 'Failed to run patterns command');
    process.exit(1);
  }
});
