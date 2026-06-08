import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'node:path';
import { detectPatterns } from '../utils/pattern-detector.js';
import { renderPatternsSkeleton } from '../utils/pattern-facts.js';
import type { DnaFacts } from '../utils/dna-detector.js';
import {
  assertRelativeSafe,
  resolveSafePath,
  PathEscapeError,
} from '../utils/path-safety.js';
import { ensureDareSkills } from '../utils/project-generator.js';
import { createGraph, loadGraphConfig } from '../graphrag/index.js';
import { ingestPatterns } from '../graphrag/pattern-ingest.js';

const DIR_ESCAPE_MSG =
  "Error: --dir must stay within the project (no '..' or absolute escape)";

interface PatternsOptions {
  dir?: string;
  check?: boolean;
  modules?: string;
  inject?: boolean;
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

function parseModulesList(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('..') || path.isAbsolute(part)) {
      throw new PathEscapeError(DIR_ESCAPE_MSG);
    }
  }
  return parts;
}

function formatPatternsReport(
  facts: Awaited<ReturnType<typeof detectPatterns>>,
): string {
  const byKind = new Map<string, number>();
  for (const p of facts.patterns) {
    byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + p.frequency);
  }
  const lines: string[] = [chalk.yellow('Patterns detected:\n')];
  if (byKind.size === 0) {
    lines.push('  (none above frequency threshold)');
  } else {
    for (const [kind, freq] of [...byKind.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`  ${chalk.bold(kind)}: ${freq} occurrence(s)`);
    }
  }
  lines.push(`  ${chalk.gray(`inventory: ${facts.fileInventorySource}`)}`);
  return lines.join('\n');
}

async function ingestPatternsBestEffort(
  targetDir: string,
  facts: Awaited<ReturnType<typeof detectPatterns>>,
): Promise<void> {
  try {
    const config = await loadGraphConfig({ cwd: targetDir });
    const graph = await createGraph(config, { cwd: targetDir });
    try {
      const { nodes, edges } = ingestPatterns(graph, facts, targetDir);
      console.log(chalk.dim(`  graph: +${nodes} pattern node(s), +${edges} edge(s)`));
    } finally {
      await Promise.resolve(graph.close());
    }
  } catch {
    // best-effort: grafo ausente/erro não falha dare patterns
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
  .action(async (opts: PatternsOptions) => {
    let targetDir: string;
    try {
      targetDir = resolveTargetDir(opts);
      parseModulesList(opts.modules);
    } catch {
      console.error(DIR_ESCAPE_MSG);
      process.exit(1);
    }

    const modulesOnly = parseModulesList(opts.modules);

    console.log(chalk.blue.bold('\n🔍 DARE Framework - Pattern Discovery\n'));
    console.log(chalk.gray(`  Scanning: ${targetDir}\n`));

    if (!opts.check) await ensureDareSkills(targetDir);

    const dnaPath = path.join(targetDir, 'DARE', 'dna-facts.json');
    const dna: DnaFacts | null = (await fs.pathExists(dnaPath))
      ? ((await fs.readJson(dnaPath)) as DnaFacts)
      : null;

    const spinner = ora('Detecting patterns...').start();
    const facts = await detectPatterns(targetDir, dna, { modulesOnly });
    spinner.stop();

    console.log(formatPatternsReport(facts));
    console.log('');

    if (opts.check) {
      console.log(chalk.cyan('--check: detection only, no files written.'));
      return;
    }

    const dareDir = path.join(targetDir, 'DARE');
    const writeSpinner = ora('Writing PATTERNS.md...').start();
    try {
      await fs.ensureDir(dareDir);
      await fs.writeJSON(path.join(dareDir, 'patterns-facts.json'), facts, { spaces: 2 });
      await fs.writeFile(path.join(dareDir, 'PATTERNS.md'), renderPatternsSkeleton(facts));
      writeSpinner.succeed(chalk.green('PATTERNS.md generated.'));
    } catch (err) {
      writeSpinner.fail(chalk.red('Failed to write pattern artifacts'));
      console.error(err);
      process.exit(1);
    }

    await ingestPatternsBestEffort(targetDir, facts);

    if (opts.inject) {
      console.log(
        chalk.cyan(
          '  --inject: DARE/PATTERNS.md registered as steering base (loader picks it up; user .dare/steering untouched).',
        ),
      );
    }

    console.log(chalk.cyan('\n📋 Generated:\n'));
    console.log(`  ${chalk.gray('·')} DARE/PATTERNS.md`);
    console.log(`  ${chalk.gray('·')} DARE/patterns-facts.json\n`);
  });
