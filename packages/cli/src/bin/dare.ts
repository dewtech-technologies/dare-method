#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'module';
import { initCommand } from '../commands/init.js';
import { designCommand } from '../commands/design.js';
import { blueprintCommand } from '../commands/blueprint.js';
import { executeCommand } from '../commands/execute.js';
import { discoverCommand } from '../commands/discover.js';
import { graphCommand } from '../commands/graph.js';
import { dagCommand } from '../commands/dag.js';
import { infoCommand } from '../commands/info.js';
import { validateCommand } from '../commands/validate.js';
import { bootstrapCommand } from '../commands/bootstrap.js';
import { updateCommand } from '../commands/update.js';
import { reviewCommand } from '../commands/review.js';
import { refineCommand } from '../commands/refine.js';
import { skillCommand } from '../skills/index.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

const program = new Command();

program
  .name('dare')
  .description('DARE Framework - Design, Architect, Review, Execute methodology for AI-assisted development')
  .version(version);

program.addCommand(initCommand);
program.addCommand(bootstrapCommand);
program.addCommand(discoverCommand);
program.addCommand(designCommand);
program.addCommand(blueprintCommand);
program.addCommand(executeCommand);
program.addCommand(graphCommand);
program.addCommand(dagCommand);
program.addCommand(validateCommand);
program.addCommand(infoCommand);
program.addCommand(updateCommand);
program.addCommand(reviewCommand);
program.addCommand(refineCommand);
program.addCommand(skillCommand);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
