/**
 * `dare skill` — skill package management for DARE projects.
 *
 * Subcommands:
 *   list [--installed] [--json]          list registry or installed skills
 *   info <name> [--json]                 show skill details
 *   add <name[@version]> [--dry-run] [--json]   install a skill
 *   remove <name> [--force] [--json]     uninstall a skill
 *
 * @module skills
 */

import { Command } from 'commander';
import { skillListCommand } from './commands/list.js';
import { skillInfoCommand } from './commands/info.js';
import { skillAddCommand } from './commands/add.js';
import { skillRemoveCommand } from './commands/remove.js';

export const skillCommand = new Command('skill')
  .description('Manage DARE skills for this project (add, remove, list, info)')
  .addCommand(skillListCommand)
  .addCommand(skillInfoCommand)
  .addCommand(skillAddCommand)
  .addCommand(skillRemoveCommand);

// Re-export lower-level utilities so other modules can import from 'skills/index'.
export { ManifestReader, ManifestWriter } from './manifest.js';
export type { Manifest, SkillEntry } from './manifest.js';
export { Registry, registry } from './registry.js';
export type { RegistrySkill } from './registry.js';
