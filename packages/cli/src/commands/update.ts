import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import {
  buildUpdatePlan,
  getCliVersion,
  loadManifest,
  readProjectConfig,
  resolveProjectVersion,
} from '../utils/UpdateDetector.js';
import { applyPlan } from '../utils/UpdateApplier.js';
import { compareVersions } from '../utils/version-compare.js';
import type { ManifestChange } from '../types/UpdateManifest.types.js';

/**
 * `dare update` — sync the *project on disk* with the templates / commands /
 * skills shipped by the installed CLI version.
 *
 * Crucially, this does NOT bump the CLI itself (use `npm update -g
 * @dewtech/dare-cli` for that). It rewrites the project artifacts that DARE
 * controls — `.cursor/`, `.claude/`, `.agents/`, `DARE/templates/`, etc — so
 * a dev who started on v2.16 can pick up the v2.17 improvements without
 * blowing away their DESIGN.md / BLUEPRINT.md / TASKS.md.
 */
export const updateCommand = new Command('update')
  .description("Atualiza o setup do projeto para a versão atual do DARE CLI")
  .option('--dry-run', 'Mostra o que seria feito, sem escrever nada', false)
  .option('-y, --yes', 'Não pergunta nada — aplica tudo e mantém customizações', false)
  .option('--force', 'Sobrescreve até arquivos customizados (perigoso)', false)
  .option('--target <version>', 'Atualiza para uma versão específica (default: CLI instalado)')
  .action(
    async (options: {
      dryRun: boolean;
      yes: boolean;
      force: boolean;
      target?: string;
    }) => {
      const cwd = process.cwd();
      const cliVersion = getCliVersion();
      const targetVersion = options.target ?? cliVersion;

      console.log(chalk.blue.bold('\n🔄 DARE Update\n'));

      // 1. Read project config -----------------------------------------------
      let cfg;
      try {
        cfg = await readProjectConfig(cwd);
      } catch (err) {
        console.error(chalk.red(`❌ ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }

      const { version: fromVersion, isLegacy } = resolveProjectVersion(cfg);
      const ide = cfg.ide as string | undefined;

      console.log(`  Projeto      : ${chalk.cyan(path.basename(cwd))}`);
      console.log(
        `  Versão atual : ${chalk.cyan(fromVersion)}${isLegacy ? chalk.gray(' (assumida — projeto pré-2.17 sem version DARE)') : ''}`,
      );
      console.log(`  CLI instalado: ${chalk.cyan(cliVersion)}`);
      console.log(`  Alvo         : ${chalk.cyan(targetVersion)}`);
      console.log(`  IDE          : ${chalk.cyan(ide ?? 'desconhecido')}`);

      // 2. Compare versions ---------------------------------------------------
      const cmp = compareVersions(fromVersion, targetVersion);
      if (cmp === 0) {
        console.log(chalk.green('\n✅ Projeto já está na versão atual. Nada a fazer.\n'));
        return;
      }
      if (cmp === 1) {
        console.log(
          chalk.yellow(
            `\n⚠  Projeto está em versão mais nova que o CLI alvo (${fromVersion} > ${targetVersion}).`,
          ),
        );
        console.log(chalk.yellow('   Atualize o CLI primeiro: npm install -g @dewtech/dare-cli@latest\n'));
        process.exit(1);
      }

      // 3. Build plan ---------------------------------------------------------
      const manifest = await loadManifest();
      const plan = buildUpdatePlan(manifest, fromVersion, targetVersion, ide);

      if (plan.pendingReleases.length === 0) {
        console.log(chalk.gray('\n  Nenhuma release no manifest entre essas versões.'));
        console.log(chalk.green(`✅ Marcando projeto como ${targetVersion}.\n`));
        if (!options.dryRun) {
          await applyPlan(plan, { projectRoot: cwd, force: true });
        }
        return;
      }

      // 4. Show changelog -----------------------------------------------------
      console.log(chalk.bold('\n📋 Mudanças que serão aplicadas:\n'));
      for (const { version, release } of plan.pendingReleases) {
        console.log(chalk.cyan.bold(`  v${version}`) + chalk.gray(` (${release.releasedAt})`));
        console.log(`  ${release.summary}`);
        const changelogLines = release.changelog.split('\n');
        for (const line of changelogLines) {
          console.log(chalk.gray(`    ${line}`));
        }
        const ideChanges = release.changes.filter((c) =>
          plan.applicableChanges.includes(c),
        );
        if (ideChanges.length > 0) {
          console.log(chalk.bold('\n    Arquivos:'));
          for (const change of ideChanges) {
            console.log(`      ${formatChange(change)}`);
          }
        }
        if (release.migrations && release.migrations.length > 0) {
          console.log(chalk.bold('\n    Migrações:'));
          for (const mig of release.migrations) {
            console.log(`      • ${chalk.magenta(mig.id)} — ${chalk.gray(mig.description)}`);
          }
        }
        console.log();
      }

      console.log(
        chalk.gray(
          `  ${plan.applicableChanges.length} arquivo(s) afetado(s) para IDE "${ide ?? '?'}".`,
        ),
      );

      if (options.dryRun) {
        console.log(chalk.yellow('\n🧪 Dry-run — nenhuma escrita realizada.\n'));
        return;
      }

      // 5. Confirm ------------------------------------------------------------
      if (!options.yes && !options.force) {
        const { proceed } = (await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: `Aplicar atualização de ${fromVersion} → ${targetVersion}?`,
            default: true,
          },
        ])) as { proceed: boolean };
        if (!proceed) {
          console.log(chalk.gray('\nCancelado.\n'));
          return;
        }
      }

      // 6. Apply --------------------------------------------------------------
      const result = await applyPlan(plan, {
        projectRoot: cwd,
        force: options.force,
        conflictPolicy: options.yes ? 'keep' : options.force ? 'replace' : 'ask',
      });

      // 7. Summary ------------------------------------------------------------
      const wrote = result.outcomes.filter((o) => o.action === 'wrote').length;
      const deleted = result.outcomes.filter((o) => o.action === 'deleted').length;
      const skipped = result.outcomes.filter((o) => o.action === 'skipped').length;
      const kept = result.outcomes.filter((o) => o.action === 'kept-custom').length;

      console.log(chalk.green.bold(`\n✅ Atualizado para ${targetVersion}\n`));
      console.log(`  ${chalk.green(wrote)} arquivo(s) escrito(s)`);
      if (deleted > 0) console.log(`  ${chalk.red(deleted)} arquivo(s) removido(s)`);
      if (kept > 0) console.log(`  ${chalk.yellow(kept)} customização(ões) preservada(s)`);
      if (skipped > 0) console.log(`  ${chalk.gray(skipped)} já estavam atualizados`);
      if (result.migrationsRan.length > 0) {
        console.log(`  ${chalk.magenta(result.migrationsRan.length)} migração(ões) executada(s)`);
      }
      if (result.backupPath && result.backupFilesCount > 0) {
        console.log(
          chalk.gray(
            `\n  💾 Backup: ${result.backupFilesCount} arquivo(s) em ${path.relative(cwd, result.backupPath) || result.backupPath}`,
          ),
        );
      }
      console.log();
    },
  );

function formatChange(change: ManifestChange): string {
  const icon =
    change.type === 'added'
      ? chalk.green('+')
      : change.type === 'removed'
        ? chalk.red('-')
        : change.type === 'renamed'
          ? chalk.yellow('↻')
          : chalk.cyan('~');
  const renamedFrom = change.previousPath ? chalk.gray(` (was ${change.previousPath})`) : '';
  return `${icon} ${change.path}${renamedFrom} ${chalk.gray('— ' + change.description)}`;
}
