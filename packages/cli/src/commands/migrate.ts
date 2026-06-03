import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import {
  loadReverseArtifacts,
  buildMigrationFacts,
  renderMigrationDoc,
  renderParityFeature,
  parityFeatureFilename,
  reverseFactsPath,
  KNOWN_TARGETS,
  type MigrationFacts,
} from '../utils/migration.js';
import { ensureDareSkills } from '../utils/project-generator.js';

interface MigrateOptions {
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
  .option('--check', 'Show source/target/modules/blocking gaps without writing artifacts')
  .action(async (opts: MigrateOptions) => {
    const targetDir = path.resolve(opts.dir ?? process.cwd());

    console.log(chalk.blue.bold('\n🚚 DARE Framework - Migration (Phase 2)\n'));
    console.log(chalk.gray(`  Project: ${targetDir}\n`));

    // --check is read-only; don't install skills then.
    if (!opts.check) await ensureDareSkills(targetDir);

    // ── Require reverse first ─────────────────────────────────────────────
    const artifacts = await loadReverseArtifacts(targetDir);
    if (!artifacts) {
      console.log(chalk.red('Missing DARE/REVERSE/reverse-facts.json.'));
      console.log(chalk.yellow('Run `dare reverse` (and /dare-reverse) first to understand the legacy before migrating.'));
      console.log(chalk.gray(`  Expected: ${reverseFactsPath(targetDir)}\n`));
      process.exit(1);
    }

    // ── Resolve target stack (flag or interactive) ────────────────────────
    let target = opts.to?.trim();
    if (!target) {
      if (opts.check) {
        console.log(chalk.yellow('No --to provided. Re-run with --to <stack> to plan, or pick one below.\n'));
      }
      const { picked } = await inquirer.prompt([
        {
          type: 'list',
          name: 'picked',
          message: 'Target stack for the migration:',
          choices: [...KNOWN_TARGETS.map((t) => ({ name: t.label, value: t.value })), { name: '✏️  Other (type it)', value: '__other__' }],
        },
      ]);
      if (picked === '__other__') {
        const { custom } = await inquirer.prompt([
          { type: 'input', name: 'custom', message: 'Target stack:', validate: (s: string) => !!s.trim() || 'Required' },
        ]);
        target = custom.trim();
      } else {
        target = picked;
      }
    }

    const generatedAt = new Date().toISOString();
    const facts = buildMigrationFacts(artifacts, target!, generatedAt);

    console.log(formatMigrationReport(facts));
    console.log('');

    if (opts.check) {
      console.log(chalk.cyan('--check: detection only, no files written.'));
      return;
    }

    // ── Write artifacts ───────────────────────────────────────────────────
    const migrationDir = path.join(targetDir, 'DARE', 'MIGRATION');
    const parityDir = path.join(migrationDir, 'parity');
    const spinner = ora('Writing migration plan + parity features...').start();
    try {
      await fs.ensureDir(parityDir);
      await fs.writeJSON(path.join(migrationDir, 'migration-facts.json'), facts, { spaces: 2 });
      await fs.writeFile(path.join(migrationDir, 'MIGRATION.md'), renderMigrationDoc(facts));
      for (const mod of facts.modules) {
        await fs.writeFile(path.join(parityDir, parityFeatureFilename(mod)), renderParityFeature(mod));
      }
      spinner.succeed(chalk.green('Migration plan generated.'));
    } catch (err) {
      spinner.fail(chalk.red('Failed to write migration artifacts'));
      console.error(err);
      process.exit(1);
    }

    console.log(chalk.cyan('\n📋 Generated:\n'));
    console.log(`  ${chalk.gray('·')} DARE/MIGRATION/MIGRATION.md`);
    console.log(`  ${chalk.gray('·')} DARE/MIGRATION/migration-facts.json`);
    console.log(`  ${chalk.gray('·')} DARE/MIGRATION/parity/*.feature (${facts.modules.length})`);
    console.log(chalk.cyan('\n📋 Next steps:\n'));
    console.log(`  ${chalk.gray('1.')} Run /dare-migrate in your IDE to fill strategy, risks, target arch + real Gherkin.`);
    console.log(`  ${chalk.gray('2.')} Resolve the ${facts.blockingGaps.total} blocking gap(s) with a human.`);
    console.log(`  ${chalk.gray('3.')} Reimplement on ${facts.target.stack} with dare design/blueprint/execute, using the .feature files as acceptance.\n`);
  });

function formatMigrationReport(facts: MigrationFacts): string {
  const lines: string[] = [];
  lines.push(chalk.yellow('Migration plan:\n'));
  lines.push(`  ${chalk.bold('Source:')} ${facts.source.stack} ${chalk.gray(`(${facts.source.structure})`)}`);
  lines.push(`  ${chalk.bold('Target:')} ${chalk.cyan(facts.target.stack)}`);
  lines.push(`  ${chalk.bold('Modules:')} ${facts.modules.length}`);
  if (facts.conventions.architecture) lines.push(`  ${chalk.bold('Architecture (DNA):')} ${facts.conventions.architecture}`);
  const gapColor = facts.blockingGaps.total > 0 ? chalk.red : chalk.green;
  lines.push(`  ${chalk.bold('Blocking gaps (🔴):')} ${gapColor(String(facts.blockingGaps.total))}`);
  if (facts.blockingGaps.perSpec.length) {
    for (const g of facts.blockingGaps.perSpec) {
      lines.push(chalk.gray(`    · ${g.spec}: ${g.gaps}`));
    }
  }
  return lines.join('\n');
}
