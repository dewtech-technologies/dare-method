#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'module';
import { initCommand } from '../commands/init.js';
import { designCommand } from '../commands/design.js';
import { blueprintCommand } from '../commands/blueprint.js';
import { executeCommand } from '../commands/execute.js';
import { discoverCommand } from '../commands/discover.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

const program = new Command();

program
  .name('dare')
  .description('DARE Framework - Design, Architect, Review, Execute methodology for AI-assisted development')
  .version(version);

program.addCommand(initCommand);
program.addCommand(discoverCommand);
program.addCommand(designCommand);
program.addCommand(blueprintCommand);
program.addCommand(executeCommand);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
