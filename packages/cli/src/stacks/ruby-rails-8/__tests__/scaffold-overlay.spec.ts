// SPDX-License-Identifier: MIT
//
// Native-overlay mode — when `rails new` already produced the framework runtime
// (nativeRuntimeProvided: true), the scaffolder writes ONLY DARE's value-add and
// must NOT emit its hand-written runtime skeleton (which would clobber the real,
// complete `rails new` output). See bootstrapRubyRails in stack-bootstrap.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { RailsScaffold } from '../scaffold.js';

async function exists(dir: string, rel: string): Promise<boolean> {
  return fs.pathExists(path.join(dir, rel));
}

// Files `rails new` owns — the overlay must NOT write these.
const RUNTIME_OWNED_BY_RAILS_NEW = [
  'config/application.rb',
  'config/boot.rb',
  'config/environment.rb',
  'config/database.yml',
  'config/puma.rb',
  'config/environments/development.rb',
  'config.ru',
  'Rakefile',
  '.ruby-version',
  'bin/rails',
  'bin/rake',
  'bin/setup',
  'app/models/application_record.rb',
  'app/jobs/application_job.rb',
  'public/404.html',
  // full-stack asset/JS runtime
  'config/importmap.rb',
  'config/initializers/assets.rb',
  'app/javascript/application.js',
  'bin/dev',
];

// DARE value-add — the overlay MUST write these in both api and full.
const DARE_VALUE_ADD = [
  'app/controllers/application_controller.rb',
  'app/controllers/concerns/problem_details.rb',
  'app/handlers/users_handler.rb',
  'app/services/create_user_service.rb',
  'app/repositories/user_repository.rb',
  'app/models/user.rb',
  'db/migrate/20260101000001_create_users.rb', // backs the User model
  'app/llm/providers/llm_provider.rb',
  'lib/tasks/dare.rake',
  'llms.txt',
  'config/dare.yml',
  '.dare/skills.yml',
  '.github/workflows/dare-ci.yml',
  '.env.example',
  'Gemfile',
];

describe('RailsScaffold — native overlay (full-stack, rails new owns runtime)', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-ov-full-'));
    outputDir = path.join(tmpDir, 'app');
    await new RailsScaffold().generate('app', {
      outputDir, verbose: false, fullstack: true, nativeRuntimeProvided: true,
    });
  });
  afterAll(async () => fs.remove(tmpDir));

  it.each(RUNTIME_OWNED_BY_RAILS_NEW)('does NOT overlay runtime file %s', async (f) => {
    expect(await exists(outputDir, f)).toBe(false);
  });

  it.each(DARE_VALUE_ADD)('emits DARE value-add %s', async (f) => {
    expect(await exists(outputDir, f)).toBe(true);
  });

  it('still overlays the DARE view layer (layout + home + routes)', async () => {
    expect(await exists(outputDir, 'app/views/layouts/application.html.erb')).toBe(true);
    expect(await exists(outputDir, 'app/controllers/home_controller.rb')).toBe(true);
    expect(await exists(outputDir, 'config/routes.rb')).toBe(true);
  });
});

describe('RailsScaffold — native overlay (API-only)', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-ov-api-'));
    outputDir = path.join(tmpDir, 'app');
    await new RailsScaffold().generate('app', {
      outputDir, verbose: false, nativeRuntimeProvided: true,
    });
  });
  afterAll(async () => fs.remove(tmpDir));

  it.each(RUNTIME_OWNED_BY_RAILS_NEW)('does NOT overlay runtime file %s', async (f) => {
    expect(await exists(outputDir, f)).toBe(false);
  });

  it('emits the User migration (DARE value-add) and DARE controllers', async () => {
    expect(await exists(outputDir, 'db/migrate/20260101000001_create_users.rb')).toBe(true);
    expect(await exists(outputDir, 'app/controllers/application_controller.rb')).toBe(true);
  });

  it('does NOT overlay the full-stack view layer', async () => {
    expect(await exists(outputDir, 'app/views/layouts/application.html.erb')).toBe(false);
    expect(await exists(outputDir, 'app/controllers/home_controller.rb')).toBe(false);
  });
});
