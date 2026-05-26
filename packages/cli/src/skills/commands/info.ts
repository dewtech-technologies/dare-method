/**
 * `dare skill info <name>` — show detailed information about a skill.
 *
 * Usage:
 *   dare skill info dare-ax
 *   dare skill info dare-ax --json
 *
 * Exits with code 1 when the skill is not found.
 *
 * @module skills/commands/info
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { registry } from '../registry.js';
import { ManifestReader } from '../manifest.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InfoOptions {
  json: boolean;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const skillInfoCommand = new Command('info')
  .description('Show detailed information about a skill from the registry')
  .argument('<name>', 'Skill name (e.g. dare-ax)')
  .option('--json', 'Output as JSON (machine-readable)', false)
  .action((name: string, options: InfoOptions) => {
    const skill = registry.findByName(name);

    if (!skill) {
      if (options.json) {
        process.stdout.write(
          JSON.stringify({ error: `Skill "${name}" not found in the registry.` }, null, 2) + '\n',
        );
      } else {
        console.error(chalk.red(`\n  Skill "${name}" not found in the registry.\n`));
        console.error(chalk.gray('  Run `dare skill list` to see available skills.\n'));
      }
      process.exit(1);
    }

    // Check if installed in current project.
    const cwd = process.cwd();
    const reader = new ManifestReader();
    let installedVersion: string | null = null;
    let isEnabled: boolean | null = null;

    if (reader.exists(cwd)) {
      const manifest = reader.read(cwd);
      const entry = manifest.skills.find((s) => s.name === name);
      if (entry) {
        installedVersion = entry.version;
        isEnabled = entry.enabled;
      }
    }

    if (options.json) {
      process.stdout.write(
        JSON.stringify(
          {
            name: skill.name,
            version: skill.version,
            description: skill.description,
            author: skill.author,
            license: skill.license,
            homepage: skill.homepage,
            repository: skill.repository,
            keywords: skill.keywords,
            dependencies: skill.dependencies,
            published_at: skill.published_at,
            size_kb: skill.size_kb,
            installed: installedVersion !== null,
            installed_version: installedVersion,
            enabled: isEnabled,
          },
          null,
          2,
        ) + '\n',
      );
      return;
    }

    // Human-readable output.
    const deps = Object.entries(skill.dependencies);
    const installedBadge =
      installedVersion !== null
        ? chalk.green(`  (installed v${installedVersion}${isEnabled === false ? ', disabled' : ''})`)
        : '';

    console.log('');
    console.log(
      chalk.bold.cyan(`  ${skill.name}`) +
        chalk.gray(` v${skill.version}`) +
        installedBadge,
    );
    console.log(`  ${skill.description}`);
    console.log('');
    console.log(`  ${chalk.bold('Author    :')} ${skill.author}`);
    console.log(`  ${chalk.bold('License   :')} ${skill.license}`);
    console.log(`  ${chalk.bold('Homepage  :')} ${chalk.underline(skill.homepage)}`);
    console.log(`  ${chalk.bold('Published :')} ${skill.published_at}`);
    console.log(`  ${chalk.bold('Size      :')} ${skill.size_kb} KB`);

    if (skill.keywords.length > 0) {
      console.log(`  ${chalk.bold('Keywords  :')} ${skill.keywords.join(', ')}`);
    }

    if (deps.length > 0) {
      console.log('');
      console.log(`  ${chalk.bold('Dependencies:')}`);
      for (const [dep, range] of deps) {
        console.log(`    ${chalk.cyan(dep)}  ${chalk.gray(range)}`);
      }
    } else {
      console.log('');
      console.log(`  ${chalk.bold('Dependencies:')} ${chalk.gray('none')}`);
    }

    console.log('');
  });
