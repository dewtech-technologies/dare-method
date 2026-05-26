/**
 * `dare skill list` — list skills available in the registry or installed in the project.
 *
 * Usage:
 *   dare skill list                  # all skills in the registry (mock)
 *   dare skill list --installed      # only installed skills (reads .dare/skills.yml)
 *   dare skill list --json           # JSON output (dare-ax M-03)
 *   dare skill list --installed --json
 *
 * @module skills/commands/list
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { registry, type RegistrySkill } from '../registry.js';
import { ManifestReader, type SkillEntry } from '../manifest.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ListOptions {
  installed: boolean;
  json: boolean;
}

interface SkillRow {
  name: string;
  version: string;
  description: string;
  author?: string;
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const skillListCommand = new Command('list')
  .description('List available skills (registry) or installed skills in this project')
  .option('--installed', 'Show only installed skills from .dare/skills.yml', false)
  .option('--json', 'Output as JSON (machine-readable)', false)
  .action((options: ListOptions) => {
    const cwd = process.cwd();

    if (options.installed) {
      listInstalled(cwd, options);
    } else {
      listRegistry(options);
    }
  });

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

function listRegistry(options: ListOptions): void {
  const skills = registry.loadAll();

  if (skills.length === 0) {
    if (options.json) {
      process.stdout.write(JSON.stringify({ skills: [] }, null, 2) + '\n');
    } else {
      console.log(chalk.yellow('No skills found in the registry.'));
    }
    return;
  }

  const rows: SkillRow[] = skills.map((s: RegistrySkill) => ({
    name: s.name,
    version: s.version,
    description: s.description,
    author: s.author,
  }));

  if (options.json) {
    process.stdout.write(JSON.stringify({ skills: rows }, null, 2) + '\n');
    return;
  }

  printTable(rows, false);
}

function listInstalled(projectPath: string, options: ListOptions): void {
  const reader = new ManifestReader();

  if (!reader.exists(projectPath)) {
    if (options.json) {
      process.stdout.write(JSON.stringify({ skills: [] }, null, 2) + '\n');
    } else {
      console.log(
        chalk.yellow(
          'No .dare/skills.yml found in this project. Run `dare skill add <name>` to install a skill.',
        ),
      );
    }
    return;
  }

  const manifest = reader.read(projectPath);
  const skills = manifest.skills;

  if (skills.length === 0) {
    if (options.json) {
      process.stdout.write(JSON.stringify({ skills: [] }, null, 2) + '\n');
    } else {
      console.log(chalk.yellow('No skills installed in this project.'));
    }
    return;
  }

  // Enrich with registry description where available.
  const rows: SkillRow[] = skills.map((entry: SkillEntry) => {
    const regEntry = registry.findByName(entry.name);
    return {
      name: entry.name,
      version: entry.version,
      description: regEntry?.description ?? '(no description)',
      author: regEntry?.author,
      enabled: entry.enabled,
    };
  });

  if (options.json) {
    process.stdout.write(JSON.stringify({ skills: rows }, null, 2) + '\n');
    return;
  }

  printTable(rows, true);
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function printTable(rows: SkillRow[], showEnabled: boolean): void {
  const nameW = Math.max(4, ...rows.map((r) => r.name.length));
  const versionW = Math.max(7, ...rows.map((r) => r.version.length));
  const descW = Math.max(11, ...rows.map((r) => r.description.length));

  const header = [
    'Name'.padEnd(nameW),
    'Version'.padEnd(versionW),
    'Description'.padEnd(descW),
    ...(showEnabled ? ['Status'] : ['Author']),
  ].join('  ');

  const separator = '─'.repeat(header.length);

  console.log('\n' + chalk.bold(header));
  console.log(chalk.gray(separator));

  for (const row of rows) {
    const namePart = chalk.cyan(row.name.padEnd(nameW));
    const versionPart = chalk.white(row.version.padEnd(versionW));
    const descPart = row.description.padEnd(descW);

    let lastCol: string;
    if (showEnabled) {
      lastCol =
        row.enabled === false
          ? chalk.yellow('disabled')
          : chalk.green('enabled');
    } else {
      lastCol = chalk.gray(row.author ?? '');
    }

    console.log(`${namePart}  ${versionPart}  ${descPart}  ${lastCol}`);
  }

  console.log('');
}
