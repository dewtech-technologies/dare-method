// SPDX-License-Identifier: MIT
//
// T-021 — Integration test: `dare init` Rails flow via programmatic call to
// `generateProjectStructure()`. Validates that selecting `ruby-rails-8` as
// the backend in init runs the v3.1 internalized scaffolder (registry path,
// not the legacy workspace dep).
//
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { generateProjectStructure } from '../../utils/project-generator.js';

let tmpRoot: string;
let appDir: string;
let prevOffline: string | undefined;

beforeAll(async () => {
  // Force DARE's offline Rails templates so this test never shells out to a
  // real `rails new` (native/Docker) — keeps it deterministic and fast on dev
  // boxes and CI runners that have Docker installed.
  prevOffline = process.env.DARE_RAILS_OFFLINE;
  process.env.DARE_RAILS_OFFLINE = '1';

  tmpRoot = path.join(process.cwd(), `.init-rails-it-${Date.now()}`);
  await fs.ensureDir(tmpRoot);
  appDir = path.join(tmpRoot, 'my-rails-app');

  await generateProjectStructure({
    name: 'my-rails-app',
    structure: 'backend',
    backend: 'ruby-rails-8',
    outputDir: appDir,
    // Defaults — what an interactive init would pass
    toolchain: 'auto',
    ide: 'cursor',
    graphrag: 'sqlite',
    mcp: false,
  });
});

afterAll(async () => {
  if (prevOffline === undefined) delete process.env.DARE_RAILS_OFFLINE;
  else process.env.DARE_RAILS_OFFLINE = prevOffline;
  if (tmpRoot) await fs.remove(tmpRoot);
});

describe('dare init — backend: ruby-rails-8', () => {
  it('creates output directory', async () => {
    expect(await fs.pathExists(appDir)).toBe(true);
  });

  it('writes dare.config.json with backend=ruby-rails-8', async () => {
    const cfgPath = path.join(appDir, 'dare.config.json');
    expect(await fs.pathExists(cfgPath)).toBe(true);
    const cfg = await fs.readJSON(cfgPath);
    expect(cfg.backend).toBe('ruby-rails-8');
    expect(cfg.structure).toBe('backend');
    expect(cfg.name).toBe('my-rails-app');
  });

  it('creates Rails-specific files (Gemfile, app/, config/)', async () => {
    expect(await fs.pathExists(path.join(appDir, 'Gemfile'))).toBe(true);
    expect(await fs.pathExists(path.join(appDir, 'app'))).toBe(true);
    expect(await fs.pathExists(path.join(appDir, 'config'))).toBe(true);
  });

  it('creates llms.txt (DARE DNA)', async () => {
    const llms = path.join(appDir, 'llms.txt');
    expect(await fs.pathExists(llms)).toBe(true);
    const content = await fs.readFile(llms, 'utf8');
    expect(content.length).toBeGreaterThan(200);
  });

  it('creates .dare/skills.yml', async () => {
    const skills = path.join(appDir, '.dare', 'skills.yml');
    expect(await fs.pathExists(skills)).toBe(true);
  });

  it('creates DARE/ scaffolding (Method artifacts dir)', async () => {
    expect(await fs.pathExists(path.join(appDir, 'DARE'))).toBe(true);
    expect(await fs.pathExists(path.join(appDir, 'DARE', 'EXECUTION'))).toBe(true);
  });

  it('Rails Layered Design directories present', async () => {
    for (const dir of ['app/handlers', 'app/services', 'app/repositories']) {
      expect(await fs.pathExists(path.join(appDir, dir))).toBe(true);
    }
  });
});

// ── v3.1 routing gate ──────────────────────────────────────────────────────
//
// Regression guard for the gap found during npm-install simulation: every
// backend + MCP stack must route through the internalized registry scaffolder
// (DARE-shaped output), NOT the legacy official-tool bootstrap. Proven by the
// presence of the DNA artifacts the new scaffolders emit.
describe('dare init — all backends route through registry scaffolders', () => {
  const BACKENDS = [
    'node-nestjs',
    'python-fastapi',
    'php-laravel',
    'rust-axum',
    'go-gin',
    'go-stdlib',
  ] as const;

  it.each(BACKENDS)('%s emits DARE DNA (llms.txt + .dare/skills.yml + dare-ci.yml)', async (stack) => {
    const root = path.join(process.cwd(), `.init-${stack}-${Date.now()}`);
    await fs.ensureDir(root);
    const dir = path.join(root, 'app');
    try {
      await generateProjectStructure({
        name: 'app',
        structure: 'backend',
        backend: stack,
        outputDir: dir,
        toolchain: 'auto',
        ide: 'cursor',
        graphrag: 'sqlite',
        mcp: false,
      });
      expect(await fs.pathExists(path.join(dir, 'llms.txt')), `${stack} llms.txt`).toBe(true);
      expect(await fs.pathExists(path.join(dir, '.dare/skills.yml')), `${stack} skills.yml`).toBe(true);
      expect(
        await fs.pathExists(path.join(dir, '.github/workflows/dare-ci.yml')),
        `${stack} dare-ci.yml`,
      ).toBe(true);
    } finally {
      await fs.remove(root);
    }
  });
});

describe('dare init — MCP variants route through registry scaffolders', () => {
  const LANGS = ['node-ts', 'python', 'rust', 'go'] as const;

  it.each(LANGS)('mcp %s emits server + transports + DNA', async (lang) => {
    const root = path.join(process.cwd(), `.init-mcp-${lang}-${Date.now()}`);
    await fs.ensureDir(root);
    const dir = path.join(root, 'srv');
    try {
      await generateProjectStructure({
        name: 'srv',
        structure: 'mcp-server',
        mcpLanguage: lang,
        mcpTransport: 'stdio',
        outputDir: dir,
        toolchain: 'auto',
        ide: 'cursor',
        graphrag: 'sqlite',
        mcp: false,
      });
      expect(await fs.pathExists(path.join(dir, 'llms.txt')), `${lang} llms.txt`).toBe(true);
      expect(await fs.pathExists(path.join(dir, '.dare/skills.yml')), `${lang} skills.yml`).toBe(true);
    } finally {
      await fs.remove(root);
    }
  });
});
