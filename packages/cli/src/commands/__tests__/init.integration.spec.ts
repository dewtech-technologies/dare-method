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

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'init-rails-it-'));
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
