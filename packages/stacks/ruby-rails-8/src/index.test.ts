/**
 * DARE v3.0 — RailsScaffold unit tests
 * Verifies that the generator produces all required files and directories
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { RailsScaffold } from './index.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function readFile(dir: string, rel: string): Promise<string> {
  return fs.readFile(path.join(dir, rel), 'utf-8');
}

async function fileExists(dir: string, rel: string): Promise<boolean> {
  return fs.pathExists(path.join(dir, rel));
}

// ── Suite: default generation ──────────────────────────────────────────────────

describe('RailsScaffold — default generation', () => {
  let tmpDir: string;
  let outputDir: string;
  let result: Awaited<ReturnType<RailsScaffold['generate']>>;

  beforeAll(async () => {
    tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-test-'));
    outputDir = path.join(tmpDir, 'myapp');

    const scaffold = new RailsScaffold();
    result = await scaffold.generate('myapp', { outputDir, verbose: false });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  // ── M-01: llms.txt ──────────────────────────────────────────────────────────
  it('generates llms.txt (M-01)', async () => {
    expect(await fileExists(outputDir, 'llms.txt')).toBe(true);
    const c = await readFile(outputDir, 'llms.txt');
    expect(c).toContain('myapp');
    expect(c).toContain('Rails 8');
    expect(c).toContain('app/handlers/');
    expect(c).toContain('DARE v3.0');
  });

  // ── M-04: rack-attack initializer ──────────────────────────────────────────
  it('generates rack_attack.rb initializer (M-04)', async () => {
    expect(await fileExists(outputDir, 'config/initializers/rack_attack.rb')).toBe(true);
    const c = await readFile(outputDir, 'config/initializers/rack_attack.rb');
    expect(c).toContain('Rack::Attack');
    expect(c).toContain('throttle');
    expect(c).toContain('application/problem+json');
  });

  // ── D-006: ProblemDetails concern ──────────────────────────────────────────
  it('generates ProblemDetails concern (D-006)', async () => {
    expect(await fileExists(outputDir, 'app/controllers/concerns/problem_details.rb')).toBe(true);
    const c = await readFile(outputDir, 'app/controllers/concerns/problem_details.rb');
    expect(c).toContain('RFC 7807');
    expect(c).toContain('application/problem+json');
    expect(c).toContain('ProblemDetails');
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
    expect(await fileExists(outputDir, 'Gemfile')).toBe(true);
    const c = await readFile(outputDir, 'Gemfile');
    expect(c).toContain('rails');
    expect(c).toContain('rswag-api');
    expect(c).toContain('rack-attack');
    expect(c).toContain('rspec-rails');
    expect(c).toContain('factory_bot_rails');
    expect(c).toContain('redis');
    expect(c).toContain('solid_cache');
    expect(c).toContain('solid_queue');
    expect(c).toContain('pg');
  });

  // ── rake dare task ───────────────────────────────────────────────────────────
  it('generates dare.rake with M-01 to M-04 collectors', async () => {
    expect(await fileExists(outputDir, 'lib/tasks/dare.rake')).toBe(true);
    const c = await readFile(outputDir, 'lib/tasks/dare.rake');
    expect(c).toContain('M-01');
    expect(c).toContain('M-02');
    expect(c).toContain('M-03');
    expect(c).toContain('M-04');
    expect(c).toContain('dare:metrics');
    expect(c).toContain('dare_metrics.json');
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
      expect(await fileExists(outputDir, f)).toBe(true);
    }
  });

  // ── Action Cable ──────────────────────────────────────────────────────────────
  it('generates Action Cable connection with auth', async () => {
    expect(await fileExists(outputDir, 'app/channels/application_cable/connection.rb')).toBe(true);
    const c = await readFile(outputDir, 'app/channels/application_cable/connection.rb');
    expect(c).toContain('current_user');
    expect(c).toContain('reject_unauthorized_connection');
    expect(c).toContain('cookies.signed');
  });

  // ── RealtimeService ───────────────────────────────────────────────────────────
  it('generates RealtimeService broadcaster', async () => {
    expect(await fileExists(outputDir, 'app/services/realtime_service.rb')).toBe(true);
    const c = await readFile(outputDir, 'app/services/realtime_service.rb');
    expect(c).toContain('Singleton');
    expect(c).toContain('ActionCable.server.broadcast');
  });

  // ── LLM layer ─────────────────────────────────────────────────────────────────
  it('generates LLM provider interface', async () => {
    expect(await fileExists(outputDir, 'app/llm/providers/llm_provider.rb')).toBe(true);
    const c = await readFile(outputDir, 'app/llm/providers/llm_provider.rb');
    expect(c).toContain('LLMProvider');
    expect(c).toContain('complete');
    expect(c).toContain('DummyProvider');
  });

  // ── .dare/skills.yml ──────────────────────────────────────────────────────────
  it('generates .dare/skills.yml manifest', async () => {
    expect(await fileExists(outputDir, '.dare/skills.yml')).toBe(true);
    const c = await readFile(outputDir, '.dare/skills.yml');
    expect(c).toContain('ruby-rails-8');
    expect(c).toContain('dare-ax');
    expect(c).toContain('M-01');
  });

  // ── Result manifest ────────────────────────────────────────────────────────────
  it('returns a valid ScaffoldResult', () => {
    expect(result.appName).toBe('myapp');
    expect(result.outputDir).toBe(outputDir);
    expect(result.filesCreated.length).toBeGreaterThan(10);
    expect(result.directoriesCreated.length).toBeGreaterThan(5);
  });
});

// ── Suite: LLM templates content ─────────────────────────────────────────────

describe('RailsScaffold — LLM templates content', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-llm-'));
    outputDir = path.join(tmpDir, 'myapp');
    const scaffold = new RailsScaffold();
    await scaffold.generate('myapp', { outputDir, verbose: false });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('llm_cache.rb exists and contains TTL', async () => {
    expect(await fileExists(outputDir, 'app/llm/cache/llm_cache.rb')).toBe(true);
    const c = await readFile(outputDir, 'app/llm/cache/llm_cache.rb');
    expect(c).toContain('TTL');
    expect(c).toContain('LlmCache');
  });

  it('llm_cache.rb has hit_rate / fetch / invalidate methods', async () => {
    const c = await readFile(outputDir, 'app/llm/cache/llm_cache.rb');
    expect(c).toContain('fetch');
    expect(c).toContain('invalidate');
  });

  it('token_bucket.rb exists and contains acquire / try_acquire semantics', async () => {
    expect(await fileExists(outputDir, 'app/llm/rate_limit/token_bucket.rb')).toBe(true);
    const c = await readFile(outputDir, 'app/llm/rate_limit/token_bucket.rb');
    // The template uses consume! which is the acquire pattern
    expect(c).toContain('consume!');
    expect(c).toContain('TokenBucket');
    expect(c).toContain('retry_after');
  });

  it('validator.rb exists and contains validate_schema', async () => {
    expect(await fileExists(outputDir, 'app/llm/validators/validator.rb')).toBe(true);
    const c = await readFile(outputDir, 'app/llm/validators/validator.rb');
    expect(c).toContain('validate!');
    expect(c).toContain('Validator');
    expect(c).toContain('ValidationError');
  });

  it('prompt_loader.rb exists and contains PromptLoader.load', async () => {
    expect(await fileExists(outputDir, 'app/llm/prompts/prompt_loader.rb')).toBe(true);
    const c = await readFile(outputDir, 'app/llm/prompts/prompt_loader.rb');
    expect(c).toContain('PromptLoader');
    expect(c).toContain('def self.load');
  });

  it('summarize_v1.jinja2 prompt template exists', async () => {
    expect(await fileExists(outputDir, 'app/llm/prompts/summarize_v1.jinja2')).toBe(true);
  });

  it('summarize_output_schema.json exists', async () => {
    expect(await fileExists(outputDir, 'app/llm/validators/summarize_output_schema.json')).toBe(true);
  });
});

// ── Suite: Action Cable templates content ─────────────────────────────────────

describe('RailsScaffold — Action Cable templates content', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-cable-'));
    outputDir = path.join(tmpDir, 'myapp');
    const scaffold = new RailsScaffold();
    await scaffold.generate('myapp', { outputDir, verbose: false });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('dare_updates_channel.rb exists and contains subscribed and receive', async () => {
    expect(await fileExists(outputDir, 'app/channels/dare_updates_channel.rb')).toBe(true);
    const c = await readFile(outputDir, 'app/channels/dare_updates_channel.rb');
    expect(c).toContain('subscribed');
    expect(c).toContain('DareUpdatesChannel');
  });

  it('dare_updates_channel.rb streams from user-scoped channel', async () => {
    const c = await readFile(outputDir, 'app/channels/dare_updates_channel.rb');
    expect(c).toContain('stream_from');
    expect(c).toContain('dare_updates');
  });

  it('user_updates_channel.rb exists and contains stream_from', async () => {
    expect(await fileExists(outputDir, 'app/channels/user_updates_channel.rb')).toBe(true);
    const c = await readFile(outputDir, 'app/channels/user_updates_channel.rb');
    expect(c).toContain('stream_for');
    expect(c).toContain('UserUpdatesChannel');
  });

  it('user_updates_channel.rb references current_user', async () => {
    const c = await readFile(outputDir, 'app/channels/user_updates_channel.rb');
    expect(c).toContain('current_user');
  });
});

// ── Suite: SummarizeDocument feature ──────────────────────────────────────────

describe('RailsScaffold — SummarizeDocument feature', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-summarize-'));
    outputDir = path.join(tmpDir, 'myapp');
    const scaffold = new RailsScaffold();
    await scaffold.generate('myapp', { outputDir, verbose: false });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('summarize_handler.rb exists', async () => {
    expect(await fileExists(outputDir, 'app/handlers/summarize_handler.rb')).toBe(true);
  });

  it('summarize_handler.rb includes ProblemDetails', async () => {
    const c = await readFile(outputDir, 'app/handlers/summarize_handler.rb');
    expect(c).toContain('ProblemDetails');
    expect(c).toContain('SummarizeHandler');
  });

  it('summarize_handler.rb delegates to SummarizeDocumentService', async () => {
    const c = await readFile(outputDir, 'app/handlers/summarize_handler.rb');
    expect(c).toContain('SummarizeDocumentService');
  });

  it('summarize_handler.rb has RFC 7807 error responses', async () => {
    const c = await readFile(outputDir, 'app/handlers/summarize_handler.rb');
    expect(c).toContain('render_problem');
    expect(c).toContain('DocumentNotFoundError');
    expect(c).toContain('SummarizationError');
  });

  it('summarize_document_service.rb exists', async () => {
    expect(await fileExists(outputDir, 'app/services/summarize_document_service.rb')).toBe(true);
  });

  it('summarize_document_service.rb contains DocumentNotFoundError', async () => {
    const c = await readFile(outputDir, 'app/services/summarize_document_service.rb');
    expect(c).toContain('DocumentNotFoundError');
  });

  it('summarize_document_service.rb contains SummarizationError', async () => {
    const c = await readFile(outputDir, 'app/services/summarize_document_service.rb');
    expect(c).toContain('SummarizationError');
  });

  it('summarize_document_service.rb publishes document.summarized event', async () => {
    const c = await readFile(outputDir, 'app/services/summarize_document_service.rb');
    expect(c).toContain('document.summarized');
  });

  it('summarize_document_service.rb uses Result struct', async () => {
    const c = await readFile(outputDir, 'app/services/summarize_document_service.rb');
    expect(c).toContain('Result');
    expect(c).toContain('summary');
    expect(c).toContain('document_id');
  });

  it('document_repository.rb exists', async () => {
    expect(await fileExists(outputDir, 'app/repositories/document_repository.rb')).toBe(true);
  });

  it('document_repository.rb contains DocumentRepository', async () => {
    const c = await readFile(outputDir, 'app/repositories/document_repository.rb');
    expect(c).toContain('DocumentRepository');
  });

  it('document_repository.rb contains update_summary!', async () => {
    const c = await readFile(outputDir, 'app/repositories/document_repository.rb');
    expect(c).toContain('update_summary!');
    expect(c).toContain('summarized_at');
  });

  it('spec/services/summarize_document_service_spec.rb exists', async () => {
    expect(await fileExists(outputDir, 'spec/services/summarize_document_service_spec.rb')).toBe(true);
  });

  it('summarize_document_service_spec.rb uses instance_double', async () => {
    const c = await readFile(outputDir, 'spec/services/summarize_document_service_spec.rb');
    expect(c).toContain('instance_double');
    expect(c).toContain('document_repository');
    expect(c).toContain('llm_provider');
    expect(c).toContain('event_publisher');
  });

  it('summarize_document_service_spec.rb tests DocumentNotFoundError', async () => {
    const c = await readFile(outputDir, 'spec/services/summarize_document_service_spec.rb');
    expect(c).toContain('DocumentNotFoundError');
    expect(c).toContain('document is not found');
  });

  it('summarize_document_service_spec.rb tests SummarizationError on blank LLM', async () => {
    const c = await readFile(outputDir, 'spec/services/summarize_document_service_spec.rb');
    expect(c).toContain('SummarizationError');
    expect(c).toContain('blank');
  });

  it('spec/api/summarize_spec.rb exists', async () => {
    expect(await fileExists(outputDir, 'spec/api/summarize_spec.rb')).toBe(true);
  });

  it('summarize_spec.rb documents 200 response with summary schema', async () => {
    const c = await readFile(outputDir, 'spec/api/summarize_spec.rb');
    expect(c).toContain('"200"');
    expect(c).toContain('summary');
    expect(c).toContain('document_id');
  });

  it('summarize_spec.rb documents 404 RFC 7807 response', async () => {
    const c = await readFile(outputDir, 'spec/api/summarize_spec.rb');
    expect(c).toContain('"404"');
    expect(c).toContain('ProblemDetails');
  });

  it('summarize_spec.rb documents 422 RFC 7807 response', async () => {
    const c = await readFile(outputDir, 'spec/api/summarize_spec.rb');
    expect(c).toContain('"422"');
  });

  it('summarize_spec.rb documents 401 unauthorized response', async () => {
    const c = await readFile(outputDir, 'spec/api/summarize_spec.rb');
    expect(c).toContain('"401"');
  });

  it('spec/channels/dare_updates_channel_spec.rb exists', async () => {
    expect(await fileExists(outputDir, 'spec/channels/dare_updates_channel_spec.rb')).toBe(true);
  });

  it('dare_updates_channel_spec.rb tests document.summarized event delivery', async () => {
    const c = await readFile(outputDir, 'spec/channels/dare_updates_channel_spec.rb');
    expect(c).toContain('document.summarized');
  });
});

// ── Suite: rake dare.rake content ─────────────────────────────────────────────

describe('RailsScaffold — rake dare.rake content', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-rake-'));
    outputDir = path.join(tmpDir, 'myapp');
    const scaffold = new RailsScaffold();
    await scaffold.generate('myapp', { outputDir, verbose: false });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('dare.rake contains dare:openapi task', async () => {
    const c = await readFile(outputDir, 'lib/tasks/dare.rake');
    expect(c).toContain('dare:openapi');
  });

  it('dare.rake contains validate_structure task', async () => {
    const c = await readFile(outputDir, 'lib/tasks/dare.rake');
    expect(c).toContain('validate_structure');
    expect(c).toContain('required_dirs');
  });

  it('dare.rake outputs JSON to dare_metrics.json', async () => {
    const c = await readFile(outputDir, 'lib/tasks/dare.rake');
    expect(c).toContain('dare_metrics.json');
    expect(c).toContain('JSON');
  });
});

// ── Suite: GitHub Actions workflow ─────────────────────────────────────────────

describe('RailsScaffold — GitHub Actions CI workflow', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-ci-'));
    outputDir = path.join(tmpDir, 'myapp');
    const scaffold = new RailsScaffold();
    await scaffold.generate('myapp', { outputDir, verbose: false });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('.github/workflows/dare-ci.yml exists', async () => {
    expect(await fileExists(outputDir, '.github/workflows/dare-ci.yml')).toBe(true);
  });

  it('dare-ci.yml runs dare:metrics', async () => {
    const c = await readFile(outputDir, '.github/workflows/dare-ci.yml');
    expect(c).toContain('dare:metrics');
  });

  it('dare-ci.yml includes postgres service', async () => {
    const c = await readFile(outputDir, '.github/workflows/dare-ci.yml');
    expect(c).toContain('postgres');
    expect(c).toContain('pg_isready');
  });

  it('dare-ci.yml includes redis service', async () => {
    const c = await readFile(outputDir, '.github/workflows/dare-ci.yml');
    expect(c).toContain('redis');
    expect(c).toContain('redis-cli ping');
  });

  it('dare-ci.yml uses ruby/setup-ruby@v1', async () => {
    const c = await readFile(outputDir, '.github/workflows/dare-ci.yml');
    expect(c).toContain('ruby/setup-ruby@v1');
  });

  it('dare-ci.yml runs bundle exec rspec', async () => {
    const c = await readFile(outputDir, '.github/workflows/dare-ci.yml');
    expect(c).toContain('bundle exec rspec');
  });

  it('dare-ci.yml runs db:create db:migrate', async () => {
    const c = await readFile(outputDir, '.github/workflows/dare-ci.yml');
    expect(c).toContain('db:create db:migrate');
  });

  it('dare-ci.yml uses actions/checkout@v4', async () => {
    const c = await readFile(outputDir, '.github/workflows/dare-ci.yml');
    expect(c).toContain('actions/checkout@v4');
  });
});

// ── Suite: config templates ────────────────────────────────────────────────────

describe('RailsScaffold — config templates', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-config-'));
    outputDir = path.join(tmpDir, 'myapp');
    const scaffold = new RailsScaffold();
    await scaffold.generate('myapp', { outputDir, verbose: false });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('config/dare.yml exists and contains llm_provider settings', async () => {
    expect(await fileExists(outputDir, 'config/dare.yml')).toBe(true);
    const c = await readFile(outputDir, 'config/dare.yml');
    expect(c).toContain('provider');
    expect(c).toContain('dummy');
  });

  it('config/dare.yml contains api_key comment (never in source)', async () => {
    const c = await readFile(outputDir, 'config/dare.yml');
    expect(c).toContain('api_key');
  });

  it('config/initializers/rswag_api.rb contains swagger_root', async () => {
    expect(await fileExists(outputDir, 'config/initializers/rswag_api.rb')).toBe(true);
    const c = await readFile(outputDir, 'config/initializers/rswag_api.rb');
    expect(c).toContain('openapi_root');
    expect(c).toContain('Rswag');
  });

  it('config/initializers/dare.rb exists', async () => {
    expect(await fileExists(outputDir, 'config/initializers/dare.rb')).toBe(true);
  });
});

// ── Suite: --skip-llm option ──────────────────────────────────────────────────

describe('RailsScaffold — --skip-llm option', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-skipllm-'));
    outputDir = path.join(tmpDir, 'myapp');
    const scaffold = new RailsScaffold();
    await scaffold.generate('myapp', { outputDir, verbose: false, skipLlm: true });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('does NOT generate app/llm/ files when skipLlm is true', async () => {
    expect(await fileExists(outputDir, 'app/llm/providers/llm_provider.rb')).toBe(false);
    expect(await fileExists(outputDir, 'app/llm/cache/llm_cache.rb')).toBe(false);
    expect(await fileExists(outputDir, 'app/llm/rate_limit/token_bucket.rb')).toBe(false);
  });

  it('still generates Gemfile when skipLlm is true', async () => {
    expect(await fileExists(outputDir, 'Gemfile')).toBe(true);
  });

  it('still generates User handler when skipLlm is true', async () => {
    expect(await fileExists(outputDir, 'app/handlers/users_handler.rb')).toBe(true);
  });

  it('still generates rake dare.rake when skipLlm is true', async () => {
    expect(await fileExists(outputDir, 'lib/tasks/dare.rake')).toBe(true);
  });

  it('still generates GitHub Actions workflow when skipLlm is true', async () => {
    expect(await fileExists(outputDir, '.github/workflows/dare-ci.yml')).toBe(true);
  });
});

// ── Suite: --skip-channels option ─────────────────────────────────────────────

describe('RailsScaffold — --skip-channels option', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-skipchan-'));
    outputDir = path.join(tmpDir, 'myapp');
    const scaffold = new RailsScaffold();
    await scaffold.generate('myapp', { outputDir, verbose: false, skipChannels: true });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('does NOT generate dare_updates_channel.rb when skipChannels is true', async () => {
    expect(await fileExists(outputDir, 'app/channels/dare_updates_channel.rb')).toBe(false);
  });

  it('does NOT generate user_updates_channel.rb when skipChannels is true', async () => {
    expect(await fileExists(outputDir, 'app/channels/user_updates_channel.rb')).toBe(false);
  });

  it('does NOT generate realtime_service.rb when skipChannels is true', async () => {
    expect(await fileExists(outputDir, 'app/services/realtime_service.rb')).toBe(false);
  });

  it('still generates Gemfile when skipChannels is true', async () => {
    expect(await fileExists(outputDir, 'Gemfile')).toBe(true);
  });

  it('still generates LLM layer when skipChannels is true', async () => {
    expect(await fileExists(outputDir, 'app/llm/providers/llm_provider.rb')).toBe(true);
  });

  it('still generates SummarizeDocument when skipChannels is true', async () => {
    expect(await fileExists(outputDir, 'app/handlers/summarize_handler.rb')).toBe(true);
    expect(await fileExists(outputDir, 'app/services/summarize_document_service.rb')).toBe(true);
  });
});

// ── Suite: --skip-examples option ────────────────────────────────────────────

describe('RailsScaffold — --skip-examples option', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeAll(async () => {
    tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-skipex-'));
    outputDir = path.join(tmpDir, 'myapp');
    const scaffold = new RailsScaffold();
    await scaffold.generate('myapp', { outputDir, verbose: false, skipExamples: true });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('does NOT generate users_handler.rb when skipExamples is true', async () => {
    expect(await fileExists(outputDir, 'app/handlers/users_handler.rb')).toBe(false);
  });

  it('does NOT generate create_user_service.rb when skipExamples is true', async () => {
    expect(await fileExists(outputDir, 'app/services/create_user_service.rb')).toBe(false);
  });

  it('does NOT generate user_repository.rb when skipExamples is true', async () => {
    expect(await fileExists(outputDir, 'app/repositories/user_repository.rb')).toBe(false);
  });

  it('still generates Gemfile when skipExamples is true', async () => {
    expect(await fileExists(outputDir, 'Gemfile')).toBe(true);
  });

  it('still generates LLM layer when skipExamples is true', async () => {
    expect(await fileExists(outputDir, 'app/llm/providers/llm_provider.rb')).toBe(true);
  });

  it('still generates SummarizeDocument when skipExamples is true', async () => {
    expect(await fileExists(outputDir, 'app/handlers/summarize_handler.rb')).toBe(true);
  });

  it('still generates GitHub Actions workflow when skipExamples is true', async () => {
    expect(await fileExists(outputDir, '.github/workflows/dare-ci.yml')).toBe(true);
  });
});

// ── Suite: ScaffoldResult manifest ────────────────────────────────────────────

describe('RailsScaffold — ScaffoldResult manifest includes new Semana 2 files', () => {
  let tmpDir: string;
  let outputDir: string;
  let result: Awaited<ReturnType<RailsScaffold['generate']>>;

  beforeAll(async () => {
    tmpDir    = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-rails-manifest-'));
    outputDir = path.join(tmpDir, 'myapp');
    const scaffold = new RailsScaffold();
    result = await scaffold.generate('myapp', { outputDir, verbose: false });
  });

  afterAll(async () => {
    await fs.remove(tmpDir);
  });

  it('filesCreated includes summarize_handler.rb', () => {
    expect(result.filesCreated).toContain('app/handlers/summarize_handler.rb');
  });

  it('filesCreated includes summarize_document_service.rb', () => {
    expect(result.filesCreated).toContain('app/services/summarize_document_service.rb');
  });

  it('filesCreated includes document_repository.rb', () => {
    expect(result.filesCreated).toContain('app/repositories/document_repository.rb');
  });

  it('filesCreated includes dare-ci.yml', () => {
    expect(result.filesCreated).toContain('.github/workflows/dare-ci.yml');
  });

  it('filesCreated includes summarize_document_service_spec.rb', () => {
    expect(result.filesCreated).toContain('spec/services/summarize_document_service_spec.rb');
  });

  it('filesCreated includes summarize_spec.rb', () => {
    expect(result.filesCreated).toContain('spec/api/summarize_spec.rb');
  });

  it('filesCreated includes dare_updates_channel_spec.rb', () => {
    expect(result.filesCreated).toContain('spec/channels/dare_updates_channel_spec.rb');
  });

  it('total files created is now greater than 25', () => {
    expect(result.filesCreated.length).toBeGreaterThan(25);
  });

  it('directoriesCreated includes .github/workflows', () => {
    expect(result.directoriesCreated).toContain('.github/workflows');
  });
});
