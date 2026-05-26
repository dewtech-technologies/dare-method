/**
 * `dare skill remove <name>` — uninstall a skill from the current project.
 *
 * Usage:
 *   dare skill remove dare-ax
 *   dare skill remove dare-ax --force   # remove even if other skills depend on it
 *   dare skill remove dare-ax --json
 *
 * Behaviour:
 *   1. Verify skill is installed.
 *   2. Check for reverse dependencies (other installed skills that depend on this one).
 *   3. Refuse unless --force is passed.
 *   4. Remove from .dare/skills.yml.
 *
 * @module skills/commands/remove
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ManifestReader, ManifestWriter } from '../manifest.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RemoveOptions {
  force: boolean;
  json: boolean;
}

interface RemoveResult {
  removed: string | null;
  skipped: boolean;
  reason?: string;
  reverseDependencies: string[];
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const skillRemoveCommand = new Command('remove')
  .description('Remove an installed skill from this project')
  .argument('<name>', 'Skill name to remove (e.g. dare-ax)')
  .option('--force', 'Remove even if other installed skills depend on this one', false)
  .option('--json', 'Output as JSON (machine-readable)', false)
  .action((name: string, options: RemoveOptions) => {
    const cwd = process.cwd();
    const result: RemoveResult = {
      removed: null,
      skipped: false,
      reverseDependencies: [],
    };

    // ── 1. Check manifest ────────────────────────────────────────────────────

    const reader = new ManifestReader();

    if (!reader.exists(cwd)) {
      const reason = 'No .dare/skills.yml found. Nothing to remove.';
      result.skipped = true;
      result.reason = reason;

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.log(chalk.yellow(`\n  ${reason}\n`));
      }
      return;
    }

    const manifest = reader.read(cwd);
    const target = manifest.skills.find((s) => s.name === name);

    if (!target) {
      const reason = `Skill "${name}" is not installed in this project.`;
      result.skipped = true;
      result.reason = reason;

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.log(chalk.yellow(`\n  ${reason}\n`));
        console.log(chalk.gray('  Run `dare skill list --installed` to see installed skills.\n'));
      }
      return;
    }

    // ── 2. Reverse dependency check ──────────────────────────────────────────

    const reverseDeps = manifest.skills.filter(
      (s) => s.name !== name && s.dependsOn?.includes(name),
    );
    result.reverseDependencies = reverseDeps.map((s) => s.name);

    if (reverseDeps.length > 0 && !options.force) {
      const reason =
        `Cannot remove "${name}": other installed skills depend on it — ` +
        `${reverseDeps.map((s) => s.name).join(', ')}. ` +
        'Use --force to remove anyway.';
      result.skipped = true;
      result.reason = reason;

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ${reason}\n`));
      }
      process.exit(1);
    }

    // ── 3. Remove ────────────────────────────────────────────────────────────

    const writer = new ManifestWriter();
    writer.removeSkill(cwd, name);
    result.removed = name;

    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }

    console.log(chalk.green(`\n  Removed ${chalk.bold(name)} from .dare/skills.yml.`));

    if (reverseDeps.length > 0) {
      console.log(
        chalk.yellow(
          `  Warning: ${reverseDeps.map((s) => s.name).join(', ')} ` +
            `still depend on "${name}" (removed with --force).`,
        ),
      );
    }

    console.log('');
  });
