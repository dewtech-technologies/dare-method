/**
 * `dare skill publish <path>` — publish a local skill to the local or remote registry.
 *
 * Usage:
 *   dare skill publish ./packages/skills/my-skill
 *   dare skill publish ./packages/skills/my-skill --dry-run
 *   dare skill publish ./packages/skills/my-skill --json
 *   dare skill publish ./packages/skills/my-skill --remote --token ghp_abc123
 *
 * Behaviour:
 *   1. Validate that <path>/skill.yml exists and contains required fields.
 *   2. Enforce MIT license (D-001).
 *   3. List all publishable files (excluding node_modules/, dist/, .git/).
 *   4. If --dry-run: report what would be published without writing.
 *   5. If --remote: publish to Vercel registry backend (requires --token).
 *   6. Otherwise: copy files into ~/.dare/registry/<name>/<version>/ and
 *      update index.json.
 *   7. Print the "URL" where the skill is available.
 *
 * @module skills/commands/publish
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { LocalRegistry, type LocalRegistrySkill } from '../registry-local.js';
import { RemoteRegistry } from '../registry-remote.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublishOptions {
  dryRun: boolean;
  json: boolean;
  remote: boolean;
  token?: string;
}

export interface SkillYml {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  dare_version: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  dependencies?: Record<string, string>;
}

export interface PublishResult {
  name: string;
  version: string;
  files: string[];
  published: boolean;
  dryRun: boolean;
  target?: 'local' | 'remote';
  url?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS: Array<keyof SkillYml> = [
  'name',
  'version',
  'description',
  'author',
  'license',
  'dare_version',
];

/**
 * Reads and validates `skill.yml` from the given directory.
 * Returns the parsed metadata or throws a descriptive Error.
 */
export function readAndValidateSkillYml(skillPath: string): SkillYml {
  const ymlPath = path.join(skillPath, 'skill.yml');

  if (!fs.pathExistsSync(ymlPath)) {
    throw new Error(`Missing skill.yml at ${ymlPath}`);
  }

  const raw = fs.readFileSync(ymlPath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse skill.yml: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('skill.yml must be a YAML object');
  }

  const obj = parsed as Record<string, unknown>;

  // Validate required fields.
  for (const field of REQUIRED_FIELDS) {
    if (typeof obj[field] !== 'string' || !(obj[field] as string).trim()) {
      throw new Error(
        `skill.yml is missing required field "${field}" (must be a non-empty string)`,
      );
    }
  }

  const meta = parsed as SkillYml;

  // D-001: only MIT license allowed.
  if (meta.license.trim().toUpperCase() !== 'MIT') {
    throw new Error(
      `License "${meta.license}" is not allowed. Only MIT is accepted (D-001). ` +
        'Update skill.yml to set license: MIT.',
    );
  }

  return meta;
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git']);

/**
 * Recursively lists all files under `dir`, excluding `EXCLUDED_DIRS`.
 * Returns paths relative to `dir`.
 */
export function collectFiles(dir: string, base: string = dir): string[] {
  const result: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);

    if (entry.isDirectory()) {
      result.push(...collectFiles(full, base));
    } else {
      result.push(rel);
    }
  }

  return result.sort();
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const skillPublishCommand = new Command('publish')
  .description('Publish a local skill to the registry (local by default, or remote with --remote)')
  .argument('<path>', 'Path to the skill directory containing skill.yml')
  .option('--dry-run', 'Validate and list files without publishing', false)
  .option('--json', 'Output as JSON (machine-readable)', false)
  .option('--remote', 'Publish to the remote Vercel registry backend', false)
  .option('--token <github-token>', 'GitHub Bearer token (required with --remote)')
  .action(async (skillPathArg: string, options: PublishOptions) => {
    const skillPath = path.resolve(process.cwd(), skillPathArg);

    const result: PublishResult = {
      name: '',
      version: '',
      files: [],
      published: false,
      dryRun: options.dryRun,
    };

    // ── 0. Validate --remote requirements ────────────────────────────────────

    if (options.remote && !options.token) {
      result.error = '--token <github-token> is required when using --remote';
      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  Error: ${result.error}\n`));
      }
      process.exit(1);
    }

    // ── 1. Validate skill.yml ─────────────────────────────────────────────────

    let meta: SkillYml;
    try {
      meta = readAndValidateSkillYml(skillPath);
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ${result.error}\n`));
      }
      process.exit(1);
    }

    result.name = meta.name;
    result.version = meta.version;

    // ── 2. Collect files ──────────────────────────────────────────────────────

    let files: string[];
    try {
      files = collectFiles(skillPath);
    } catch (err) {
      result.error = `Cannot read skill directory: ${err instanceof Error ? err.message : String(err)}`;
      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ${result.error}\n`));
      }
      process.exit(1);
    }

    result.files = files;

    // ── 3. Dry run ─────────────────────────────────────────────────────────────

    if (options.dryRun) {
      const target = options.remote ? 'remote' : 'local';
      if (options.json) {
        process.stdout.write(JSON.stringify({ ...result, target }, null, 2) + '\n');
      } else {
        console.log(chalk.bold.yellow('\n  Dry run — nothing will be published.\n'));
        console.log(`  Skill  : ${chalk.cyan(meta.name)}@${meta.version}`);
        console.log(`  Author : ${meta.author}`);
        console.log(`  License: ${meta.license}`);
        console.log(`  Target : ${target}`);
        console.log(`\n  Files (${files.length}):`);
        for (const f of files) {
          console.log(`    ${chalk.gray(f)}`);
        }
        console.log('');
      }
      return;
    }

    // ── 4a. Remote publish ──────────────────────────────────────────────────────

    if (options.remote && options.token) {
      result.target = 'remote';
      const remote = new RemoteRegistry();

      try {
        await remote.publish(
          meta.name,
          {
            version: meta.version,
            description: meta.description,
            author: meta.author,
            license: meta.license,
            dare_version: meta.dare_version,
            dependencies: meta.dependencies ?? {},
            keywords: meta.keywords ?? [],
            homepage: meta.homepage,
          },
          options.token,
        );
      } catch (err) {
        result.error = `Remote publish failed: ${err instanceof Error ? err.message : String(err)}`;
        if (options.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else {
          console.error(chalk.red(`\n  ${result.error}\n`));
        }
        process.exit(1);
      }

      result.published = true;
      result.url = `https://dare-registry.vercel.app/api/skills/${meta.name}`;

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.log(
          chalk.green(`\n  Published ${chalk.bold(meta.name)}@${meta.version} to remote registry.`),
        );
        console.log(chalk.gray(`  URL: ${result.url}`));
        console.log('');
      }
      return;
    }

    // ── 4b. Local publish ──────────────────────────────────────────────────────

    result.target = 'local';
    const localRegistry = new LocalRegistry();

    const registryMeta: LocalRegistrySkill = {
      name: meta.name,
      version: meta.version,
      description: meta.description,
      author: meta.author,
      license: meta.license,
      homepage: meta.homepage,
      repository: meta.repository,
      keywords: meta.keywords ?? [],
      dare_version: meta.dare_version,
      published_at: new Date().toISOString(),
      size_kb: Math.ceil(
        files.reduce((acc, f) => {
          try {
            return acc + fs.statSync(path.join(skillPath, f)).size;
          } catch {
            return acc;
          }
        }, 0) / 1024,
      ),
      source: 'local',
    };

    try {
      localRegistry.publish(skillPath, registryMeta);
    } catch (err) {
      result.error = `Failed to publish: ${err instanceof Error ? err.message : String(err)}`;
      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ${result.error}\n`));
      }
      process.exit(1);
    }

    result.published = true;
    result.url = localRegistry['_root']
      ? `file://${path.join(localRegistry['_root'], meta.name, meta.version)}`
      : `local://${meta.name}@${meta.version}`;

    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      console.log(
        chalk.green(`\n  Published ${chalk.bold(meta.name)}@${meta.version} to local registry.`),
      );
      console.log(chalk.gray(`  URL: ${result.url}`));
      console.log(chalk.gray(`  Files: ${files.length}`));
      console.log('');
    }
  });
