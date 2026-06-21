/**
 * `dare skill add <name[@version]>` — install a skill into the current project.
 *
 * Usage:
 *   dare skill add dare-ax
 *   dare skill add dare-ax@1.0.0
 *   dare skill add dare-ax --dry-run
 *   dare skill add dare-ax --json
 *
 * Behaviour:
 *   1. Parse `name@version` (defaults to registry version if no version given).
 *   2. Verify skill exists in registry.
 *   3. Check if already installed (skip or update).
 *   4. Resolve transitive dependencies.
 *   5. Install bundled/local skill files when available and update `.dare/skills.yml`.
 *
 * @module skills/commands/add
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { registry, type RegistrySkill } from '../registry.js';
import { LocalRegistry } from '../registry-local.js';
import { ManifestReader, ManifestWriter, type SkillEntry } from '../manifest.js';
import { installBundledSkill } from '../bundled.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddOptions {
  dryRun: boolean;
  json: boolean;
}

interface InstallPlan {
  skill: RegistrySkill;
  requestedVersion: string;
  alreadyInstalled: boolean;
}

interface AddResult {
  installed: string[];
  skipped: string[];
  errors: string[];
  dryRun: boolean;
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

  // '@' at position 0 is a scope prefix, not a version separator
  if (atIdx > 0) {
    return {
      name: spec.slice(0, atIdx),
      version: spec.slice(atIdx + 1) || null,
    };
  }

  return { name: spec, version: null };
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const skillAddCommand = new Command('add')
  .description('Install a skill into this project')
  .argument('<name>', 'Skill name with optional version (e.g. dare-ax or dare-ax@1.0.0)')
  .option('--dry-run', 'Show what would be installed without making changes', false)
  .option('--json', 'Output as JSON (machine-readable)', false)
  .action(async (spec: string, options: AddOptions) => {
    const cwd = process.cwd();
    const result: AddResult = {
      installed: [],
      skipped: [],
      errors: [],
      dryRun: options.dryRun,
    };

    // ── 1. Parse spec ────────────────────────────────────────────────────────

    const { name, version: requestedVersion } = parsePackageSpec(spec);

    // ── 2. Look up in registry (mock first, then local fallback) ─────────────

    const mockSkillMeta = registry.findByName(name);

    // Fallback: check local registry when mock doesn't know the skill.
    let skillMeta: RegistrySkill | undefined = mockSkillMeta;
    if (!skillMeta) {
      const localRegistry = new LocalRegistry();
      const localSkill = requestedVersion
        ? localRegistry.find(name, requestedVersion)
        : localRegistry.find(name);
      if (localSkill) {
        // Adapt LocalRegistrySkill to RegistrySkill shape.
        skillMeta = {
          name: localSkill.name,
          version: localSkill.version,
          description: localSkill.description,
          author: localSkill.author,
          license: localSkill.license,
          homepage: localSkill.homepage ?? '',
          repository: localSkill.repository ?? '',
          keywords: localSkill.keywords ?? [],
          dependencies: {},
          published_at: localSkill.published_at ?? new Date().toISOString(),
          size_kb: localSkill.size_kb ?? 0,
        };
      }
    }

    if (!skillMeta) {
      const msg = `Skill "${name}" not found in the registry.`;
      result.errors.push(msg);

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ${msg}`));
        console.error(chalk.gray('  Run `dare skill list` to see available skills.\n'));
      }
      process.exit(1);
    }

    // Resolve the effective version (requested or registry default).
    const effectiveVersion = requestedVersion ?? skillMeta.version;

    // ── 3. Read manifest (may not exist yet) ─────────────────────────────────

    const reader = new ManifestReader();
    const manifest = reader.readOrEmpty(cwd);

    // ── 4. Resolve dependencies ──────────────────────────────────────────────

    let deps: RegistrySkill[];
    try {
      deps = registry.resolveDependencies(name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(msg);

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  Dependency resolution failed: ${msg}\n`));
      }
      process.exit(1);
    }

    // Build install plan: dependencies first (topological order), then target.
    const plan: InstallPlan[] = [
      ...deps.map((dep) => {
        const existing = manifest.skills.find((s) => s.name === dep.name);
        return {
          skill: dep,
          requestedVersion: dep.version,
          alreadyInstalled: existing !== undefined,
        };
      }),
      {
        skill: skillMeta,
        requestedVersion: effectiveVersion,
        alreadyInstalled: manifest.skills.some((s) => s.name === name),
      },
    ];

    // ── 5. Dry run: report without writing ───────────────────────────────────

    if (options.dryRun) {
      const toInstall = plan.filter((p) => !p.alreadyInstalled);
      const toSkip = plan.filter((p) => p.alreadyInstalled);

      result.installed = toInstall.map((p) => `${p.skill.name}@${p.requestedVersion}`);
      result.skipped = toSkip.map((p) => `${p.skill.name}@${p.requestedVersion}`);

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        return;
      }

      console.log(chalk.bold.yellow('\n  Dry run — no changes will be made.\n'));

      if (toInstall.length === 0) {
        console.log(chalk.gray('  Nothing to install.\n'));
        return;
      }

      console.log(chalk.bold('  Would install:'));
      for (const item of toInstall) {
        const tag =
          item.skill.name === name ? '' : chalk.gray(' (dependency)');
        console.log(`    ${chalk.cyan(item.skill.name)}@${item.requestedVersion}${tag}`);
      }

      if (toSkip.length > 0) {
        console.log(chalk.bold('\n  Already installed (skip):'));
        for (const item of toSkip) {
          console.log(`    ${chalk.gray(item.skill.name)}@${item.requestedVersion}`);
        }
      }

      console.log('');
      return;
    }

    // ── 6. Real install ──────────────────────────────────────────────────────

    const spinner = options.json
      ? null
      : ora(`Installing ${chalk.cyan(name)}@${effectiveVersion}...`).start();

    const writer = new ManifestWriter();
    const localRegistry = new LocalRegistry();

    for (const item of plan) {
      if (item.alreadyInstalled) {
        result.skipped.push(`${item.skill.name}@${item.requestedVersion}`);
        continue;
      }

      const installedFromBundle = installBundledSkill(item.skill.name, cwd);
      if (!installedFromBundle) {
        try {
          localRegistry.install(item.skill.name, item.requestedVersion, cwd);
        } catch (err) {
          if (item.skill.name === name && !registry.findByName(item.skill.name)) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(msg);
            if (spinner) spinner.fail(chalk.red(msg));
            if (options.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
            process.exit(1);
          }
        }
      }

      const entry: SkillEntry = {
        name: item.skill.name,
        version: item.requestedVersion,
        enabled: true,
        dependsOn:
          Object.keys(item.skill.dependencies).length > 0
            ? Object.keys(item.skill.dependencies)
            : undefined,
      };

      writer.addSkill(cwd, entry);
      result.installed.push(`${item.skill.name}@${item.requestedVersion}`);
    }

    if (spinner) {
      if (result.installed.length > 0) {
        spinner.succeed(
          chalk.green(
            `Installed ${result.installed.length} skill(s): ${result.installed.join(', ')}`,
          ),
        );
      } else {
        spinner.info(
          chalk.gray(
            `${chalk.cyan(name)}@${effectiveVersion} is already installed — nothing to do.`,
          ),
        );
      }
    }

    if (!options.json && result.skipped.length > 0 && result.installed.length > 0) {
      console.log(chalk.gray(`  (skipped already-installed: ${result.skipped.join(', ')})`));
    }

    if (!options.json) {
      console.log('');
    }

    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  });
