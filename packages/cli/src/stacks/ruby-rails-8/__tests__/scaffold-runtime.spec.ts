// SPDX-License-Identifier: MIT
//
// Runtime skeleton — the ruby-rails-8 scaffold ships the Rails boot files that
// `rails new` would normally generate, so the project runs without a manual
// `rails new`. Shared by api-only and full-stack; only config/application.rb,
// the asset/JS layer and bin/dev differ by variant.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { RailsScaffold } from '../scaffold.js';

async function read(dir: string, rel: string): Promise<string> {
  return fs.readFile(path.join(dir, rel), 'utf-8');
}
async function exists(dir: string, rel: string): Promise<boolean> {
  return fs.pathExists(path.join(dir, rel));
}

const SHARED_RUNTIME = [
  'config/boot.rb',
  'config/environment.rb',
  'config/application.rb',
  'config/database.yml',
  'config/puma.rb',
  'config/cable.yml',
  'config/environments/development.rb',
  'config/environments/test.rb',
  'config/environments/production.rb',
  'config/initializers/filter_parameter_logging.rb',
  'config.ru',
  'Rakefile',
  '.ruby-version',
  'app/models/application_record.rb',
  'app/jobs/application_job.rb',
  'bin/rails',
  'bin/rake',
  'bin/bundle',
  'bin/setup',
  'db/migrate/20260101000001_create_users.rb',
  'db/seeds.rb',
  'public/404.html',
  'public/500.html',
  'public/robots.txt',
];

describe('RailsScaffold — runtime skeleton (API-only)', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-rt-api-'));
    outputDir = path.join(tmpDir, 'dare-labs');
    await new RailsScaffold().generate('dare-labs', { outputDir, verbose: false });
  });
  afterAll(async () => fs.remove(tmpDir));

  it.each(SHARED_RUNTIME)('emits %s', async (f) => {
    expect(await exists(outputDir, f)).toBe(true);
  });

  it('application.rb is API-only (api_only = true, selective railties)', async () => {
    const c = await read(outputDir, 'config/application.rb');
    expect(c).toContain('config.api_only = true');
    expect(c).toContain('require "rails"');
    expect(c).not.toContain('require "rails/all"');
  });

  it('application.rb uses a CamelCase Ruby module derived from the app name', async () => {
    const c = await read(outputDir, 'config/application.rb');
    expect(c).toContain('module DareLabs');
  });

  it('database.yml uses snake_case db names and runtime ENV ERB', async () => {
    const c = await read(outputDir, 'config/database.yml');
    expect(c).toContain('dare_labs_development');
    expect(c).toContain('ENV.fetch("DATABASE_HOST"');
  });

  it('the users migration matches the User model columns', async () => {
    const c = await read(outputDir, 'db/migrate/20260101000001_create_users.rb');
    for (const col of [':email', ':name', ':active', ':admin']) expect(c).toContain(col);
    expect(c).toContain('add_index :users, :email, unique: true');
  });

  // The Unix executable bit isn't representable on NTFS, so this only runs on
  // POSIX. The shipped bin/* stubs carry the +x git mode so npm installs keep it.
  it.skipIf(process.platform === 'win32')('bin stubs are executable', async () => {
    const mode = (await fs.stat(path.join(outputDir, 'bin/rails'))).mode;
    expect(mode & 0o100).toBeTruthy(); // owner-execute bit
  });

  it('does NOT emit the full-stack asset/JS runtime', async () => {
    expect(await exists(outputDir, 'config/importmap.rb')).toBe(false);
    expect(await exists(outputDir, 'app/javascript/application.js')).toBe(false);
    expect(await exists(outputDir, 'bin/dev')).toBe(false);
  });
});

describe('RailsScaffold — runtime skeleton (full-stack)', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-rt-full-'));
    outputDir = path.join(tmpDir, 'dare-labs');
    await new RailsScaffold().generate('dare-labs', { outputDir, verbose: false, fullstack: true });
  });
  afterAll(async () => fs.remove(tmpDir));

  it.each(SHARED_RUNTIME)('still emits shared runtime %s', async (f) => {
    expect(await exists(outputDir, f)).toBe(true);
  });

  it('application.rb loads all frameworks (rails/all, no api_only)', async () => {
    const c = await read(outputDir, 'config/application.rb');
    expect(c).toContain('require "rails/all"');
    expect(c).not.toContain('config.api_only = true');
  });

  it.each([
    'config/importmap.rb',
    'config/initializers/assets.rb',
    'app/assets/stylesheets/application.css',
    'app/javascript/application.js',
    'app/javascript/controllers/application.js',
    'app/javascript/controllers/index.js',
    'bin/dev',
  ])('emits asset/JS runtime %s', async (f) => {
    expect(await exists(outputDir, f)).toBe(true);
  });

  it('importmap pins turbo + stimulus + controllers', async () => {
    const c = await read(outputDir, 'config/importmap.rb');
    expect(c).toContain('@hotwired/turbo-rails');
    expect(c).toContain('@hotwired/stimulus');
    expect(c).toContain('pin_all_from "app/javascript/controllers"');
  });
});
