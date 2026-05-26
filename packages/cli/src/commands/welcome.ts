/**
 * DARE CLI — `dare welcome` command
 *
 * Opt-in command that shows the ASCII art banner and a quick-start guide.
 * Explicitly forces the banner even in non-TTY environments (FORCE_BANNER=1).
 *
 * Usage:
 *   dare welcome
 *
 * License: MIT (D-001)
 */

import { Command } from 'commander';
import { printBanner } from '../utils/banner.js';

export const welcomeCommand = new Command('welcome')
  .description('Show the DARE welcome banner and quick-start guide')
  .action(() => {
    // Override TTY check for the explicit welcome command
    process.env.FORCE_BANNER = '1';
    printBanner();

    console.log('Quick start:');
    console.log('  dare new myapp --stack rails');
    console.log('  dare skill list');
    console.log('  dare skill add dare-ax');
    console.log();
    console.log('Docs:   https://docs.dare.dewtech.tech');
    console.log('GitHub: https://github.com/dewtech-technologies/dare-method');
    console.log();
  });
