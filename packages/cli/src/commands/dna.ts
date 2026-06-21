import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { detectDna, type DnaFacts } from '../utils/dna-detector.js';
import { renderDnaSkeleton } from '../utils/dna-facts.js';
import { ensureDareSkills } from '../utils/project-generator.js';
import { addAiOptions, aiOptionsFromFlags } from '../ai/command-options.js';
import type { AiCommandOptions } from '../ai/types.js';
import { maybeRunAiEnrichment } from '../ai/pipeline.js';

interface DnaOptions extends AiCommandOptions {
  dir?: string;
  check?: boolean;
}

export const dnaCommand = new Command('dna')
  .description(
    'Extract a legacy codebase\'s conventions into DARE/PROJECT-DNA.md (brownfield house-style ruleset)',
  )
  .option('-d, --dir <path>', 'Target directory (default: current directory)')
  .option('--check', 'Only show detected conventions without writing artifacts');

addAiOptions(dnaCommand);

dnaCommand.action(async (opts: DnaOptions) => {
    const targetDir = path.resolve(opts.dir ?? process.cwd());

    console.log(chalk.blue.bold('\n🧬 DARE Framework - Project DNA (conventions)\n'));
    console.log(chalk.gray(`  Scanning: ${targetDir}\n`));

    // --check is read-only detection; don't install skills then.
    if (!opts.check) await ensureDareSkills(targetDir);

    const spinner = ora('Extracting conventions...').start();
    const generatedAt = new Date().toISOString();
    const facts = await detectDna(targetDir, generatedAt);
    spinner.stop();

    console.log(formatDnaReport(facts));
    console.log('');

    if (opts.check) {
      console.log(chalk.cyan('--check: detection only, no files written.'));
      return;
    }

    const dareDir = path.join(targetDir, 'DARE');
    const writeSpinner = ora('Writing PROJECT-DNA.md...').start();
    try {
      await fs.ensureDir(dareDir);
      await fs.writeJSON(path.join(dareDir, 'dna-facts.json'), facts, { spaces: 2 });
      await fs.writeFile(path.join(dareDir, 'PROJECT-DNA.md'), renderDnaSkeleton(facts));
      writeSpinner.succeed(chalk.green('PROJECT-DNA.md generated.'));

      const aiOpts = aiOptionsFromFlags(opts);
      await maybeRunAiEnrichment({
        enabled: aiOpts.enabled,
        provider: aiOpts.provider,
        command: 'dna',
        cwd: targetDir,
        facts,
      });
    } catch (err) {
      writeSpinner.fail(chalk.red('Failed to write DNA artifacts'));
      console.error(err);
      process.exit(1);
    }

    console.log(chalk.cyan('\n📋 Generated:\n'));
    console.log(`  ${chalk.gray('·')} DARE/PROJECT-DNA.md`);
    console.log(`  ${chalk.gray('·')} DARE/dna-facts.json`);
    if (aiOptionsFromFlags(opts).enabled) {
      console.log(`  ${chalk.gray('·')} DARE/dna-semantic.json`);
    }
    console.log(chalk.cyan('\n📋 Next steps:\n'));
    if (aiOptionsFromFlags(opts).enabled) {
      console.log(`  ${chalk.gray('1.')} Review DARE/PROJECT-DNA.md — heuristics + AI merged.`);
    } else {
      console.log(`  ${chalk.gray('1.')} Run \`dare dna --ai\` or /dare-dna to turn facts into actionable rules.`);
    }
    console.log(`  ${chalk.gray('2.')} Review DARE/PROJECT-DNA.md — legacy conventions are often inconsistent.`);
    console.log(`  ${chalk.gray('3.')} Future features follow this DNA to respect the existing codebase.\n`);
  });

function formatDnaReport(facts: DnaFacts): string {
  const lines: string[] = [];
  const linters = facts.tooling.linters.map((l) => l.name).join(', ') || '—';
  const formatters = facts.tooling.formatters.map((f) => f.name).join(', ') || '—';
  lines.push(chalk.yellow('Conventions detected:\n'));
  lines.push(`  ${chalk.bold('Linters:')}     ${linters}`);
  lines.push(`  ${chalk.bold('Formatters:')}  ${formatters}`);
  lines.push(`  ${chalk.bold('Architecture:')} ${facts.architecture.guess}`);
  if (facts.architecture.detectedLayers.length) {
    lines.push(`  ${chalk.gray('layers: ' + facts.architecture.detectedLayers.join(', '))}`);
  }
  const t = facts.testing;
  lines.push(`  ${chalk.bold('Testing:')}     ${t.framework ?? 'unknown'} (${t.testFiles} test / ${t.prodFiles} prod, ratio ${t.ratio})`);
  const libs = Object.entries(facts.libraries).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ') || '—';
  lines.push(`  ${chalk.bold('Libraries:')}   ${libs}`);
  if (facts.commits) {
    lines.push(`  ${chalk.bold('Commits:')}     ${facts.commits.conventional ? 'Conventional Commits' : 'free-form'} (${facts.commits.sampled} sampled)`);
  }
  const naming = facts.naming.map((n) => `${n.extension}:${n.dominant}`).join(', ') || '—';
  lines.push(`  ${chalk.bold('Naming:')}      ${naming}`);
  return lines.join('\n');
}
