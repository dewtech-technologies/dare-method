#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from '../commands/init.js';
import { designCommand } from '../commands/design.js';
import { blueprintCommand } from '../commands/blueprint.js';
import { executeCommand } from '../commands/execute.js';

const program = new Command();

program
  .name('dare')
  .description('DARE Framework - Design, Architect, Review, Execute methodology for AI-assisted development')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(designCommand);
program.addCommand(blueprintCommand);
program.addCommand(executeCommand);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
