import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { detectProject, formatDetectionReport } from '../utils/project-detector.js';
import { detectModules } from '../utils/module-detector.js';
import {
  buildFacts,
  renderIdeiaSkeleton,
  renderModuleSpecSkeleton,
  renderArchitectureExcalidraw,
  moduleSpecFilename,
} from '../utils/reverse-facts.js';

interface ReverseOptions {
  dir?: string;
  check?: boolean;
  modules?: string;
  excalidraw?: boolean; // commander sets this false for --no-excalidraw
}

export const reverseCommand = new Command('reverse')
  .description(
    'Reverse-engineer an existing codebase into a Phase-0 IDEIA.md + module specs (brownfield onboarding)',
  )
  .option('-d, --dir <path>', 'Target directory (default: current directory)')
  .option('--check', 'Only show detected modules without writing artifacts')
  .option('--modules <list>', 'Limit to specific modules (comma-separated ids/names)')
  .option('--no-excalidraw', 'Skip generating the editable .excalidraw architecture canvas')
  .action(async (opts: ReverseOptions) => {
    const targetDir = path.resolve(opts.dir ?? process.cwd());

    console.log(chalk.blue.bold('\n🔁 DARE Framework - Reverse Engineering (Phase 0)\n'));
    console.log(chalk.gray(`  Scanning: ${targetDir}\n`));

    const only = opts.modules
      ? opts.modules.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const spinner = ora('Detecting stack and module boundaries...').start();
    const detected = await detectProject(targetDir);
    const graph = await detectModules(targetDir, { only });
    spinner.stop();

    // ── Detection report ──────────────────────────────────────────────────
    console.log(chalk.yellow('Stack detection:\n'));
    console.log(formatDetectionReport(detected));
    console.log('');
    console.log(chalk.yellow(`Module map (strategy: ${graph.strategy}):\n`));
    console.log(formatModuleReport(graph.modules));
    console.log('');

    if (graph.modules.length === 0) {
      console.log(chalk.red('No modules with source code found. Nothing to reverse-engineer.'));
      return;
    }

    if (opts.check) {
      console.log(chalk.cyan('--check: detection only, no files written.'));
      return;
    }

    // ── Write artifacts ───────────────────────────────────────────────────
    const generatedAt = new Date().toISOString();
    const facts = buildFacts(detected, graph, generatedAt);
    const dareDir = path.join(targetDir, 'DARE');
    const reverseDir = path.join(dareDir, 'REVERSE');

    const writeSpinner = ora('Writing IDEIA.md + module specs...').start();
    try {
      await fs.ensureDir(reverseDir);

      await fs.writeJSON(path.join(reverseDir, 'reverse-facts.json'), facts, { spaces: 2 });
      await fs.writeFile(
        path.join(dareDir, 'IDEIA.md'),
        renderIdeiaSkeleton(facts, opts.excalidraw !== false),
      );

      for (let i = 0; i < facts.modules.length; i++) {
        const mod = facts.modules[i];
        await fs.writeFile(
          path.join(reverseDir, moduleSpecFilename(i, mod)),
          renderModuleSpecSkeleton(mod, i, facts.modules.length, generatedAt),
        );
      }

      if (opts.excalidraw !== false) {
        await fs.writeFile(
          path.join(reverseDir, 'architecture.excalidraw'),
          renderArchitectureExcalidraw(facts),
        );
      }

      writeSpinner.succeed(chalk.green('IDEIA.md and module specs generated.'));
    } catch (err) {
      writeSpinner.fail(chalk.red('Failed to write reverse-engineering artifacts'));
      console.error(err);
      process.exit(1);
    }

    // ── Output summary ────────────────────────────────────────────────────
    console.log(chalk.cyan('\n📋 Generated:\n'));
    console.log(`  ${chalk.gray('·')} DARE/IDEIA.md`);
    console.log(`  ${chalk.gray('·')} DARE/REVERSE/reverse-facts.json`);
    console.log(`  ${chalk.gray('·')} DARE/REVERSE/module-*.md (${facts.modules.length})`);
    if (opts.excalidraw !== false) {
      console.log(`  ${chalk.gray('·')} DARE/REVERSE/architecture.excalidraw`);
    }

    console.log(chalk.cyan('\n📋 Next steps:\n'));
    console.log(`  ${chalk.gray('1.')} Run /dare-reverse in your IDE to fill the inferred sections (purpose, flows).`);
    console.log(`  ${chalk.gray('2.')} Review DARE/IDEIA.md and correct any wrong inference.`);
    console.log(`  ${chalk.gray('3.')} Promote to a DESIGN with: dare design "<what this project does>"\n`);
  });

function formatModuleReport(
  modules: { name: string; path: string; size: string; fileCount: number; loc: number; depends_on: string[] }[],
): string {
  if (modules.length === 0) return chalk.gray('  (none)');
  const icon: Record<string, string> = { LOW: '🔵', MED: '🟠', HIGH: '🔴' };
  return modules
    .map((m) => {
      const deps = m.depends_on.length ? ` → ${m.depends_on.join(', ')}` : '';
      return `  ${icon[m.size] ?? '•'} ${chalk.bold(m.name)} ${chalk.gray(`(${m.path})`)} `
        + `${chalk.gray(`· ${m.size} · ${m.fileCount} files · ${m.loc} LOC`)}${chalk.gray(deps)}`;
    })
    .join('\n');
}
