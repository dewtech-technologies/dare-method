#!/usr/bin/env node
/**
 * Documentation coverage gate.
 *
 * Fails (exit 1) when a top-level CLI command or a dare.config.json config block
 * exists in the source but is NOT documented under docs-site/. This forces every
 * release that adds a feature to also document it.
 *
 * Same philosophy / output style as scripts/verify-actions-pinned.mjs:
 *   - lists each undocumented item, exits 1; otherwise prints an OK line, exits 0.
 *
 * Enumeration is fully deterministic from source (no hardcoded lists, no LLM):
 *   (1) Top-level commands  — from bin/dare.ts (program.addCommand wiring) resolved
 *       back to each command module's `new Command('<name>')`.
 *   (2) Top-level config blocks — object-valued feature blocks emitted by
 *       utils/project-generator.ts (review/refine/verification/hooks, etc.).
 *   (3) verification.* sub-blocks — from the zod schema in verification/config.ts.
 *
 * Docs matched tolerantly:
 *   - command:        `dare <name>` appearing inside a backtick/heading in cli-reference.md
 *   - config block:   the block name as a backticked key anywhere in configuration.md
 *                     (sub-blocks accepted bare or as `verification.<name>`)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliSrc = path.join(root, 'packages', 'cli', 'src');
const docsDir = path.join(root, 'docs-site');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

// ---------------------------------------------------------------------------
// (1) Top-level CLI commands
// ---------------------------------------------------------------------------
// bin/dare.ts imports each command (`import { fooCommand } from '../commands/foo.js'`
// or '../skills/index.js') and wires the ones it ships via `program.addCommand(x)`.
// We resolve each wired identifier back to its source module, then read the
// canonical `new Command('<name>')` literal from that module.
function enumerateCommands() {
  const binSrc = read(path.join(cliSrc, 'bin', 'dare.ts'));

  // identifier -> relative module path (without extension), e.g. fooCommand -> commands/foo
  const importMap = new Map();
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/([^'"]+)\.js['"]/g;
  let m;
  while ((m = importRe.exec(binSrc)) !== null) {
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const mod = m[2];
    for (const name of names) importMap.set(name, mod);
  }

  // identifiers actually wired into the program
  const wired = new Set();
  const addRe = /program\.addCommand\(\s*([A-Za-z0-9_]+)\s*\)/g;
  while ((m = addRe.exec(binSrc)) !== null) wired.add(m[1]);

  const commands = [];
  for (const ident of wired) {
    const mod = importMap.get(ident);
    if (!mod) continue; // wired but not imported as a module export we can resolve
    const file = path.join(cliSrc, `${mod}.ts`);
    if (!fs.existsSync(file)) continue;
    const src = read(file);
    // Find the `new Command('<name>')` for the exported command identifier.
    // Prefer the one tied to this identifier; fall back to first in the file.
    const tied = new RegExp(
      `${ident}\\s*=\\s*new Command\\(\\s*['"]([\\w:-]+)['"]`,
    ).exec(src);
    const any = /new Command\(\s*['"]([\w:-]+)['"]/.exec(src);
    const name = (tied && tied[1]) || (any && any[1]);
    if (name) commands.push(name);
  }
  return [...new Set(commands)].sort();
}

// ---------------------------------------------------------------------------
// (2) Top-level config blocks (object-valued feature blocks)
// ---------------------------------------------------------------------------
// project-generator.ts builds the dare.config.json object literal. We pick keys
// whose value is an object literal `{` or a `default*Config*(...)` factory call —
// those are the documentable feature blocks. Scalar identity fields
// (name/structure/version/...) are intentionally skipped.
function enumerateConfigBlocks() {
  const src = read(path.join(cliSrc, 'utils', 'project-generator.ts'));
  const start = src.indexOf('const configData');
  if (start === -1) throw new Error('configData literal not found in project-generator.ts');
  const slice = src.slice(start);

  const blocks = [];
  // key: { ...   OR   key: defaultXxxConfigForProject()
  const blockRe = /^\s{4}([A-Za-z][\w]*):\s*(\{|default[A-Za-z]*Config[A-Za-z]*\()/gm;
  let m;
  while ((m = blockRe.exec(slice)) !== null) {
    blocks.push(m[1]);
  }
  return [...new Set(blocks)].sort();
}

// ---------------------------------------------------------------------------
// (3) verification.* sub-blocks (from zod schema)
// ---------------------------------------------------------------------------
// verification/config.ts defines `verificationConfigSchema = z.object({ ... })`.
// Each top-level key inside that object that is itself an object/schema block is
// a documentable sub-block. We read DEFAULTS to enumerate keys robustly.
function enumerateVerificationSubBlocks() {
  const src = read(path.join(cliSrc, 'verification', 'config.ts'));
  const start = src.indexOf('export const DEFAULTS');
  if (start === -1) throw new Error('DEFAULTS not found in verification/config.ts');
  // Capture the object body of DEFAULTS.
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(open + 1, end);
  // Top-level keys at depth 1 only.
  const keys = [];
  let d = 0;
  const keyRe = /([A-Za-z][\w]*)\s*:/g;
  // Walk char-by-char tracking brace depth; record keys seen at depth 0 of body.
  let lastIndex = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '{') d++;
    else if (ch === '}') d--;
    else if (ch === ':' && d === 0) {
      // look back for the key identifier
      const before = body.slice(lastIndex, i);
      const km = /([A-Za-z][\w]*)\s*$/.exec(before);
      if (km) keys.push(km[1]);
      lastIndex = i + 1;
    } else if ((ch === ',' || ch === '\n') && d === 0) {
      lastIndex = i + 1;
    }
  }
  // `enabled` is a scalar flag on verification itself, not a sub-block.
  return [...new Set(keys.filter((k) => k !== 'enabled'))].sort();
}

// ---------------------------------------------------------------------------
// Docs matching
// ---------------------------------------------------------------------------
function commandDocumented(cliDoc, name) {
  // `dare <name>` inside backticks (heading or inline), tolerant to trailing args.
  const re = new RegExp('`dare ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  return re.test(cliDoc);
}

function blockDocumented(cfgDoc, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Accept `name` or `verification.name` as a backticked key, or a heading key.
  const reBacktick = new RegExp('`(?:verification\\.)?' + esc + '\\b');
  return reBacktick.test(cfgDoc);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const commands = enumerateCommands();
const configBlocks = enumerateConfigBlocks();
const verificationSubBlocks = enumerateVerificationSubBlocks();

const cliDoc = read(path.join(docsDir, 'cli-reference.md'));
const cfgDoc = read(path.join(docsDir, 'configuration.md'));

let failed = false;

for (const name of commands) {
  if (!commandDocumented(cliDoc, name)) {
    console.error(`❌ comando não documentado: dare ${name} (docs-site/cli-reference.md)`);
    failed = true;
  }
}

for (const name of configBlocks) {
  if (!blockDocumented(cfgDoc, name)) {
    console.error(`❌ bloco de config não documentado: ${name} (docs-site/configuration.md)`);
    failed = true;
  }
}

for (const name of verificationSubBlocks) {
  if (!blockDocumented(cfgDoc, name)) {
    console.error(
      `❌ sub-bloco de verification não documentado: verification.${name} (docs-site/configuration.md)`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

const totalBlocks = configBlocks.length + verificationSubBlocks.length;
console.log(
  `✅ Docs cobrem todos os ${commands.length} comandos e ${totalBlocks} blocos de config.`,
);
