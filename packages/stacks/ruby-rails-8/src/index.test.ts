/**
 * DARE v3.0 — RailsScaffold unit tests
 * Verifies that the generator produces all required files and directories
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { RailsScaffold } from './index.js';

describe('RailsScaffold', () => {
  let tmpDir: string;
  let outputDir: string;
  let result: Awaited<ReturnType<RailsScaffold['generate']>>;

  beforeAll(async () => {
    tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-test-'));
    outputDir = path.join(tmpDir, 'myapp');

    const scaffold = new RailsScaffold();
    result = await scaffold.generate('myapp', {
      outputDir,
      verbose: false,
    });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  // ── M-01: llms.txt ──────────────────────────────────────────────────────────
  it('generates llms.txt (M-01)', async () => {
    const llmsTxt = path.join(outputDir, 'llms.txt');
    expect(await fs.pathExists(llmsTxt)).toBe(true);

    const content = await fs.readFile(llmsTxt, 'utf-8');
    expect(content).toContain('myapp');
    expect(content).toContain('Rails 8');
    expect(content).toContain('app/handlers/');
    expect(content).toContain('DARE v3.0');
  });

  // ── M-04: rack-attack initializer ──────────────────────────────────────────
  it('generates rack_attack.rb initializer (M-04)', async () => {
    const rackAttack = path.join(outputDir, 'config', 'initializers', 'rack_attack.rb');
    expect(await fs.pathExists(rackAttack)).toBe(true);

    const content = await fs.readFile(rackAttack, 'utf-8');
    expect(content).toContain('Rack::Attack');
    expect(content).toContain('throttle');
    expect(content).toContain('application/problem+json');
  });

  // ── D-006: ProblemDetails concern ──────────────────────────────────────────
  it('generates ProblemDetails concern (D-006)', async () => {
    const concern = path.join(outputDir, 'app', 'controllers', 'concerns', 'problem_details.rb');
    expect(await fs.pathExists(concern)).toBe(true);

    const content = await fs.readFile(concern, 'utf-8');
    expect(content).toContain('RFC 7807');
    expect(content).toContain('application/problem+json');
    expect(content).toContain('ProblemDetails');
  });

  // ── Layered Design directories (ADR-05) ─────────────────────────────────────
  it.each([
    'app/handlers',
    'app/services',
    'app/repositories',
    'app/models',
    'app/presenters',
    'app/llm/providers',
    'app/llm/prompts',
    'app/llm/validators',
    'app/channels/application_cable',
    'lib/tasks',
    'spec/services',
    'spec/handlers',
    'spec/channels',
    'spec/factories',
    'spec/api',
  ])('creates directory: %s', async (dir) => {
    expect(await fs.pathExists(path.join(outputDir, dir))).toBe(true);
  });

  // ── Gemfile ─────────────────────────────────────────────────────────────────
  it('generates Gemfile with required gems', async () => {
    const gemfile = path.join(outputDir, 'Gemfile');
    expect(await fs.pathExists(gemfile)).toBe(true);

    const content = await fs.readFile(gemfile, 'utf-8');
    expect(content).toContain('rails');
    expect(content).toContain('rswag-api');
    expect(content).toContain('rack-attack');
    expect(content).toContain('rspec-rails');
    expect(content).toContain('factory_bot_rails');
    expect(content).toContain('redis');
    expect(content).toContain('solid_cache');
    expect(content).toContain('solid_queue');
    expect(content).toContain('pg');
  });

  // ── rake dare task ───────────────────────────────────────────────────────────
  it('generates dare.rake with M-01 to M-04 collectors', async () => {
    const rake = path.join(outputDir, 'lib', 'tasks', 'dare.rake');
    expect(await fs.pathExists(rake)).toBe(true);

    const content = await fs.readFile(rake, 'utf-8');
    expect(content).toContain('M-01');
    expect(content).toContain('M-02');
    expect(content).toContain('M-03');
    expect(content).toContain('M-04');
    expect(content).toContain('dare:metrics');
    expect(content).toContain('dare_metrics.json');
  });

  // ── User example ─────────────────────────────────────────────────────────────
  it('generates User example files', async () => {
    const files = [
      'app/handlers/users_handler.rb',
      'app/services/create_user_service.rb',
      'app/repositories/user_repository.rb',
      'app/models/user.rb',
      'app/presenters/user_presenter.rb',
      'spec/services/create_user_service_spec.rb',
    ];
    for (const f of files) {
      expect(await fs.pathExists(path.join(outputDir, f))).toBe(true);
    }
  });

  // ── Action Cable ──────────────────────────────────────────────────────────────
  it('generates Action Cable connection with auth', async () => {
    const connection = path.join(outputDir, 'app', 'channels', 'application_cable', 'connection.rb');
    expect(await fs.pathExists(connection)).toBe(true);

    const content = await fs.readFile(connection, 'utf-8');
    expect(content).toContain('current_user');
    expect(content).toContain('reject_unauthorized_connection');
    expect(content).toContain('cookies.signed');
  });

  // ── RealtimeService ───────────────────────────────────────────────────────────
  it('generates RealtimeService broadcaster', async () => {
    const service = path.join(outputDir, 'app', 'services', 'realtime_service.rb');
    expect(await fs.pathExists(service)).toBe(true);

    const content = await fs.readFile(service, 'utf-8');
    expect(content).toContain('Singleton');
    expect(content).toContain('ActionCable.server.broadcast');
  });

  // ── LLM layer ─────────────────────────────────────────────────────────────────
  it('generates LLM provider interface', async () => {
    const provider = path.join(outputDir, 'app', 'llm', 'providers', 'llm_provider.rb');
    expect(await fs.pathExists(provider)).toBe(true);

    const content = await fs.readFile(provider, 'utf-8');
    expect(content).toContain('LLMProvider');
    expect(content).toContain('complete');
    expect(content).toContain('DummyProvider');
  });

  // ── .dare/skills.yml ──────────────────────────────────────────────────────────
  it('generates .dare/skills.yml manifest', async () => {
    const manifest = path.join(outputDir, '.dare', 'skills.yml');
    expect(await fs.pathExists(manifest)).toBe(true);

    const content = await fs.readFile(manifest, 'utf-8');
    expect(content).toContain('ruby-rails-8');
    expect(content).toContain('dare-ax');
    expect(content).toContain('M-01');
  });

  // ── Result manifest ────────────────────────────────────────────────────────────
  it('returns a valid ScaffoldResult', () => {
    expect(result.appName).toBe('myapp');
    expect(result.outputDir).toBe(outputDir);
    expect(result.filesCreated.length).toBeGreaterThan(10);
    expect(result.directoriesCreated.length).toBeGreaterThan(5);
  });
});
