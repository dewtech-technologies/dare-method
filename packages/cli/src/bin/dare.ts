#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'module';
import { initCommand } from '../commands/init.js';
import { designCommand } from '../commands/design.js';
import { blueprintCommand } from '../commands/blueprint.js';
import { executeCommand } from '../commands/execute.js';
import { discoverCommand } from '../commands/discover.js';
import { reverseCommand } from '../commands/reverse.js';
import { dnaCommand } from '../commands/dna.js';
import { migrateCommand } from '../commands/migrate.js';
import { graphCommand } from '../commands/graph.js';
import { dagCommand } from '../commands/dag.js';
import { infoCommand } from '../commands/info.js';
import { validateCommand } from '../commands/validate.js';
import { bootstrapCommand } from '../commands/bootstrap.js';
import { updateCommand } from '../commands/update.js';
import { reviewCommand } from '../commands/review.js';
import { refineCommand } from '../commands/refine.js';
import { benchCommand } from '../commands/bench.js';
import { steeringCommand } from '../commands/steering.js';
import { hooksCommand } from '../commands/hooks.js';
import { patternsCommand } from '../commands/patterns.js';
import { guardCommand } from '../commands/guard.js';
import { dashboardCommand } from '../commands/dashboard.js';
import { skillCommand } from '../skills/index.js';
import { welcomeCommand } from '../commands/welcome.js';
import { aiCommand } from '../commands/ai.js';
import { printBanner } from '../utils/banner.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

const program = new Command();

program
  .name('dare')
  .description('DARE Framework - Design · Architecture · Review · Execute methodology for AI-assisted development')
  .version(version)
  .option('--no-banner', 'Suppress ASCII art banner');

program.addCommand(initCommand);
program.addCommand(bootstrapCommand);
program.addCommand(discoverCommand);
program.addCommand(reverseCommand);
program.addCommand(dnaCommand);
program.addCommand(migrateCommand);
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
program.addCommand(benchCommand);
program.addCommand(steeringCommand);
program.addCommand(hooksCommand);
program.addCommand(patternsCommand);
program.addCommand(guardCommand);
program.addCommand(dashboardCommand);
program.addCommand(skillCommand);
program.addCommand(aiCommand);
program.addCommand(welcomeCommand);

// Show banner + help when invoked with no subcommand
if (!process.argv.slice(2).length) {
  printBanner();
  program.parse(process.argv);
  program.outputHelp();
} else {
  // Check for --no-banner early before Commander strips it
  const noBanner = process.argv.includes('--no-banner');
  if (!noBanner) {
    // Show banner only for banner-eligible commands
    const BANNER_COMMANDS = ['init', '--version', '-V'];
    const firstArg = process.argv[2] ?? '';
    if (BANNER_COMMANDS.includes(firstArg)) {
      printBanner();
    }
  }
  program.parse(process.argv);
}
