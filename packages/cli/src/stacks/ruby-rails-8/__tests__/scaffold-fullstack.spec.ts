// SPDX-License-Identifier: MIT
//
// Full-stack MVC variant — `dare init` with the 'mvc' structure scaffolds a
// Rails 8 FULL application (server-rendered views, asset pipeline,
// ActionController::Base) instead of the default API-only shape.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { RailsScaffold } from '../scaffold.js';

async function readFile(dir: string, rel: string): Promise<string> {
  return fs.readFile(path.join(dir, rel), 'utf-8');
}
async function fileExists(dir: string, rel: string): Promise<boolean> {
  return fs.pathExists(path.join(dir, rel));
}

describe('RailsScaffold — full-stack MVC (fullstack: true)', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-fullstack-'));
    outputDir = path.join(tmpDir, 'myapp');
    const scaffold = new RailsScaffold();
    await scaffold.generate('myapp', { outputDir, verbose: false, fullstack: true });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('ApplicationController inherits ActionController::Base (not API)', async () => {
    const c = await readFile(outputDir, 'app/controllers/application_controller.rb');
    expect(c).toContain('ActionController::Base');
    expect(c).not.toContain('ActionController::API');
    expect(c).toContain('protect_from_forgery');
  });

  it('Gemfile includes the full-stack view/asset stack', async () => {
    const c = await readFile(outputDir, 'Gemfile');
    expect(c).toContain('propshaft');
    expect(c).toContain('importmap-rails');
    expect(c).toContain('turbo-rails');
    expect(c).toContain('stimulus-rails');
  });

  it('generates the server-rendered view layer', async () => {
    expect(await fileExists(outputDir, 'app/views/layouts/application.html.erb')).toBe(true);
    expect(await fileExists(outputDir, 'app/views/home/index.html.erb')).toBe(true);
    expect(await fileExists(outputDir, 'app/controllers/home_controller.rb')).toBe(true);
    expect(await fileExists(outputDir, 'app/helpers/application_helper.rb')).toBe(true);
  });

  it('layout substitutes app_name and preserves Rails ERB tags', async () => {
    const c = await readFile(outputDir, 'app/views/layouts/application.html.erb');
    expect(c).toContain('myapp');
    expect(c).toContain('<%= yield %>');
    expect(c).toContain('javascript_importmap_tags');
  });

  it('routes.rb wires the root page and Swagger UI', async () => {
    const c = await readFile(outputDir, 'config/routes.rb');
    expect(c).toContain('root "home#index"');
    expect(c).toContain('Rswag::Ui::Engine');
  });

  it('llms.txt describes a full-stack (not api-only) app', async () => {
    const c = await readFile(outputDir, 'llms.txt');
    expect(c).toContain('full-stack');
    expect(c).toContain('app/views/');
  });

  it('still emits the DARE layered/LLM/channel layers', async () => {
    expect(await fileExists(outputDir, 'app/handlers/users_handler.rb')).toBe(true);
    expect(await fileExists(outputDir, 'app/llm/providers/llm_provider.rb')).toBe(true);
    expect(await fileExists(outputDir, 'app/channels/dare_updates_channel.rb')).toBe(true);
  });
});

describe('RailsScaffold — API-only default is unaffected by the fullstack flag', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-apionly-'));
    outputDir = path.join(tmpDir, 'myapp');
    const scaffold = new RailsScaffold();
    await scaffold.generate('myapp', { outputDir, verbose: false }); // no fullstack
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('ApplicationController stays ActionController::API', async () => {
    const c = await readFile(outputDir, 'app/controllers/application_controller.rb');
    expect(c).toContain('ActionController::API');
  });

  it('does NOT generate the view layer', async () => {
    expect(await fileExists(outputDir, 'app/views/layouts/application.html.erb')).toBe(false);
    expect(await fileExists(outputDir, 'app/controllers/home_controller.rb')).toBe(false);
    expect(await fileExists(outputDir, 'config/routes.rb')).toBe(false);
  });

  it('Gemfile has no front-end asset gems', async () => {
    const c = await readFile(outputDir, 'Gemfile');
    expect(c).not.toContain('propshaft');
    expect(c).not.toContain('turbo-rails');
  });
});
