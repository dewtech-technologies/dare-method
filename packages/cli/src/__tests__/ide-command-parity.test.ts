// SPDX-License-Identifier: MIT
//
// Trava o contrato: TODO comando do `dare` CLI precisa estar disponível na IDE
// como `/dare-<cmd>` nas três IDEs suportadas (Claude, Cursor, Antigravity).
//
// Fonte da verdade dos arquivos de IDE: implementations/ (sincronizado para
// packages/cli/templates/ide/ no build). Se um comando novo for adicionado ao
// CLI sem o skill/command correspondente, este teste falha.
import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const IMPL = path.join(REPO, 'implementations');
const BIN = path.resolve(__dirname, '..', 'bin', 'dare.ts');

// Cada comando registrado no CLI → o slug /dare-<cmd> esperado na IDE.
// Mantenha em sincronia com packages/cli/src/bin/dare.ts (program.addCommand).
const CLI_COMMANDS: Record<string, string> = {
  init: 'dare-init',
  bootstrap: 'dare-bootstrap',
  discover: 'dare-discover',
  reverse: 'dare-reverse',
  dna: 'dare-dna',
  migrate: 'dare-migrate',
  design: 'dare-design',
  blueprint: 'dare-blueprint',
  execute: 'dare-execute',
  graph: 'dare-graph',
  dag: 'dare-dag',
  validate: 'dare-validate',
  info: 'dare-info',
  update: 'dare-update',
  review: 'dare-review',
  refine: 'dare-refine',
  bench: 'dare-bench',
  steering: 'dare-steering',
  hooks: 'dare-hooks',
  skill: 'dare-skill',
  welcome: 'dare-welcome',
};

const slugs = Object.values(CLI_COMMANDS);

describe('IDE command parity — every `dare <cmd>` exists as /dare-<cmd>', () => {
  it('CLI_COMMANDS matches the number of commands registered in bin/dare.ts', async () => {
    const src = await fs.readFile(BIN, 'utf8');
    const registered = (src.match(/program\.addCommand\(/g) || []).length;
    // Se este teste falhar: um comando foi adicionado/removido no CLI sem
    // atualizar o mapa CLI_COMMANDS acima E criar o skill nas 3 IDEs.
    expect(registered).toBe(Object.keys(CLI_COMMANDS).length);
  });

  it.each(slugs)('Claude Code expõe /%s', async (slug) => {
    expect(await fs.pathExists(path.join(IMPL, 'claude', '.claude', 'commands', `${slug}.md`))).toBe(true);
  });

  it.each(slugs)('Cursor expõe /%s', async (slug) => {
    expect(await fs.pathExists(path.join(IMPL, 'cursor', '.cursor', 'commands', `${slug}.md`))).toBe(true);
  });

  it.each(slugs)('Antigravity expõe /%s', async (slug) => {
    expect(await fs.pathExists(path.join(IMPL, 'antigravity', '.agents', 'skills', slug, 'SKILL.md'))).toBe(true);
  });
});
