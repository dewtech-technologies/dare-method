/**
 * `dare skill update <name[@version]>` — update an installed skill.
 *
 * Usage:
 *   dare skill update dare-ax             # update to latest
 *   dare skill update dare-ax@1.1.0       # update to specific version
 *   dare skill update dare-ax --dry-run   # show diff without changing
 *   dare skill update dare-ax --json
 *
 * Behaviour:
 *   1. Parse `name@version` (defaults to registry version if no version given).
 *   2. Verify skill is installed (read manifest).
 *   3. Compare installed version vs. target version.
 *   4. If equal → "already up to date", exit 0.
 *   5. If different → remove old entry, install new entry in manifest.
 *
 * @module skills/commands/update
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { registry } from '../registry.js';
import { LocalRegistry } from '../registry-local.js';
import { ManifestReader, ManifestWriter, type SkillEntry } from '../manifest.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UpdateOptions {
  dryRun: boolean;
  json: boolean;
}

export interface UpdateResult {
  name: string;
  from: string | null;
  to: string;
  updated: boolean;
  alreadyUpToDate: boolean;
  notInstalled: boolean;
  dryRun: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parses `name[@version]` into { name, version }.
 * Version defaults to `null` (meaning "use registry latest").
 */
function parsePackageSpec(spec: string): { name: string; version: string | null } {
  const atIdx = spec.lastIndexOf('@');
  if (atIdx > 0) {
    return { name: spec.slice(0, atIdx), version: spec.slice(atIdx + 1) || null };
  }
  return { name: spec, version: null };
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const skillUpdateCommand = new Command('update')
  .description('Update an installed skill to a newer version')
  .argument('<name>', 'Skill name with optional version (e.g. dare-ax or dare-ax@1.1.0)')
  .option('--dry-run', 'Show version diff without making changes', false)
  .option('--json', 'Output as JSON (machine-readable)', false)
  .action(async (spec: string, options: UpdateOptions) => {
    const cwd = process.cwd();
    const { name, version: requestedVersion } = parsePackageSpec(spec);

    const result: UpdateResult = {
      name,
      from: null,
      to: '',
      updated: false,
      alreadyUpToDate: false,
      notInstalled: false,
      dryRun: options.dryRun,
    };

    // ── 1. Verify skill exists in registry (mock or local) ───────────────────

    const mockSkill = registry.findByName(name);
    const localRegistry = new LocalRegistry();
    const localSkill = localRegistry.find(name);
    const registrySkill = mockSkill ?? (localSkill ? { ...localSkill, dependencies: {} as Record<string, string>, published_at: localSkill.published_at ?? new Date().toISOString(), size_kb: localSkill.size_kb ?? 0 } : undefined);

    if (!registrySkill) {
      result.error = `Skill "${name}" not found in the registry.`;
      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ${result.error}`));
        console.error(chalk.gray('  Run `dare skill list` to see available skills.\n'));
      }
      process.exit(1);
    }

    const targetVersion = requestedVersion ?? registrySkill.version;
    result.to = targetVersion;

    // ── 2. Verify skill is installed ─────────────────────────────────────────

    const reader = new ManifestReader();
    const manifest = reader.readOrEmpty(cwd);
    const installed = manifest.skills.find((s) => s.name === name);

    if (!installed) {
      result.notInstalled = true;
      result.error = `Skill "${name}" is not installed. Run \`dare skill add ${name}\` first.`;

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ${result.error}\n`));
      }
      process.exit(1);
    }

    result.from = installed.version;

    // ── 3. Compare versions ──────────────────────────────────────────────────

    if (installed.version === targetVersion) {
      result.alreadyUpToDate = true;

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.log(
          chalk.gray(
            `\n  ${chalk.cyan(name)} is already at v${targetVersion} — nothing to do.\n`,
          ),
        );
      }
      return;
    }

    // ── 4. Dry run ───────────────────────────────────────────────────────────

    if (options.dryRun) {
      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.log(chalk.bold.yellow('\n  Dry run — no changes will be made.\n'));
        console.log(
          `  Would update ${chalk.cyan(name)}: ` +
            `${chalk.gray('v' + installed.version)} → ${chalk.green('v' + targetVersion)}\n`,
        );
      }
      return;
    }

    // ── 5. Perform update ────────────────────────────────────────────────────

    const writer = new ManifestWriter();

    const newEntry: SkillEntry = {
      name,
      version: targetVersion,
      enabled: installed.enabled,
      dependsOn: installed.dependsOn,
    };

    writer.addSkill(cwd, newEntry); // addSkill does upsert by name
    result.updated = true;

    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      console.log(
        chalk.green(
          `\n  Updated ${chalk.bold(name)}: v${installed.version} → v${targetVersion}\n`,
        ),
      );
    }
  });
