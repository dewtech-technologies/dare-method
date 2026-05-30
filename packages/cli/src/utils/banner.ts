/**
 * DARE CLI — ASCII art banner
 * Displayed on: dare (no args), dare new, dare --version, dare welcome
 *
 * Suppressed when:
 *   - process.stdout.isTTY is false (pipe/redirect)
 *   - DARE_NO_BANNER=1 env var
 *   - --no-banner global flag
 *
 * License: MIT (D-001)
 */

import figlet, { type FontName } from 'figlet';
import { createRequire } from 'module';

// gradient-string is CommonJS — use createRequire for safe ESM interop
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const gradient = _require('gradient-string') as (
  ...colors: string[]
) => { multiline: (text: string) => string };

const { version } = _require('../../package.json') as { version: string };

// Dewtech official green palette
const DEWTECH_GREEN = gradient('#7FD93A', '#5BCB1B', '#3FA00C');

const FONT_FALLBACKS: FontName[] = [
  'Alligator',
  'Larry 3D',
  'Big',
  'Slant',
  'Standard',
];

/**
 * Render the DARE ASCII art using the best available figlet font.
 * Falls back through FONT_FALLBACKS until a non-empty result is obtained.
 */
export function renderBanner(): string {
  for (const font of FONT_FALLBACKS) {
    try {
      const art = figlet.textSync('DARE', { font, horizontalLayout: 'default' });
      if (art && art.trim().length > 0) return art;
    } catch {
      // try next font
    }
  }
  return 'DARE'; // ultimate plain-text fallback
}

/**
 * Print the DARE ASCII art banner to stdout.
 *
 * Respects suppression rules:
 *   - !process.stdout.isTTY  → silent (unless FORCE_BANNER=1)
 *   - DARE_NO_BANNER=1       → silent
 *   - options.noColor=true   → ANSI green instead of truecolor gradient
 */
export function printBanner(options: { noColor?: boolean } = {}): void {
  // TTY guard: skip in pipes/redirects unless explicitly forced (e.g. dare welcome)
  if (!process.stdout.isTTY && process.env.FORCE_BANNER !== '1') return;

  // Env-var suppression
  if (process.env.DARE_NO_BANNER === '1') return;

  const banner = renderBanner();
  const tagline = '  Design · Architecture · Review · Execute';
  const subtitle = `  by Dewtech · dewtech.tech  v${version}`;

  // Colour detection: use truecolor gradient when COLORTERM is set, else basic ANSI green
  const supportsColor =
    !options.noColor &&
    (process.env.COLORTERM === 'truecolor' || process.env.COLORTERM === '24bit');

  if (supportsColor) {
    console.log(DEWTECH_GREEN.multiline(banner));
  } else {
    // Fallback: basic ANSI green (works in all terminals)
    console.log('\x1b[32m' + banner + '\x1b[0m');
  }

  console.log('\x1b[90m' + tagline + '\x1b[0m'); // dim grey
  console.log('\x1b[90m' + subtitle + '\x1b[0m');
  console.log();
}
