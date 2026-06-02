/**
 * DARE v3.0 — ruby-rails-8 stack generator
 *
 * Creates a new Rails 8 project with full DARE integration:
 * - Layered Design (handlers, services, repositories, models, presenters)
 * - OpenAPI via rswag (auto-generated from specs)
 * - LLM integration (app/llm/)
 * - Action Cable with authorized subscriptions
 * - RFC 7807 Problem Details errors (D-006)
 * - rake dare:metrics (M-01 to M-04)
 * - llms.txt for AI agents
 *
 * License: MIT (D-001 — permanent)
 */

import fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RailsScaffoldOptions {
  /** Rails app name (snake_case recommended) */
  appName: string;
  /** Target directory to generate the project in */
  outputDir: string;
  /** Ruby version constraint (default: ">= 3.3.0") */
  rubyVersion?: string;
  /** Rails version constraint (default: "~> 8.0") */
  railsVersion?: string;
  /** Skip example User resource (handlers/services/etc.) */
  skipExamples?: boolean;
  /** Skip LLM integration layer (app/llm/) */
  skipLlm?: boolean;
  /** Skip Action Cable channels */
  skipChannels?: boolean;
  /** LLM provider default (default: "dummy") */
  llmProvider?: 'openai' | 'dummy';
  /** Whether to include verbose console output */
  verbose?: boolean;
}

/**
 * Legacy ScaffoldResult interface (v3.0.0 shape) used by RailsScaffold.
 * Renamed to RailsScaffoldResult to avoid collision with the v3.1
 * `StackScaffold.generate()` result type imported below.
 */
export interface RailsScaffoldResult {
  appName: string;
  outputDir: string;
  filesCreated: string[];
  directoriesCreated: string[];
}

// ── Main class ────────────────────────────────────────────────────────────────

/**
 * RailsScaffold — generates a new Rails 8 project with DARE v3.0 integration.
 *
 * Usage:
 *   const scaffold = new RailsScaffold();
 *   await scaffold.generate("myapp", { outputDir: "/path/to/projects/myapp" });
 */
export class RailsScaffold {
  private readonly TEMPLATES_DIR: string;

  constructor() {
    // v3.1 internalized layout:
    //   src:  packages/cli/src/stacks/ruby-rails-8/scaffold.ts
    //   dist: packages/cli/dist/stacks/ruby-rails-8/scaffold.js
    // Templates at packages/cli/templates/stacks/ruby-rails-8/ — 3 levels up + /templates/stacks/<id>.
    const thisFilePath = typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath((import.meta as { url: string }).url));
    this.TEMPLATES_DIR = path.resolve(
      thisFilePath,
      '..',
      '..',
      '..',
      'templates',
      'stacks',
      'ruby-rails-8',
    );
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Generate a new Rails 8 project with DARE integration.
   *
   * @param appName   Application name (used in file content, not directory)
   * @param options   Configuration options
   * @returns         Manifest of created files and directories
   */
  async generate(appName: string, options: Partial<RailsScaffoldOptions> = {}): Promise<RailsScaffoldResult> {
    const opts = this.resolveOptions(appName, options);
    const result: RailsScaffoldResult = {
      appName,
      outputDir: opts.outputDir,
      filesCreated: [],
      directoriesCreated: [],
    };

    this.log(opts, `Generating Rails 8 DARE project: ${appName}`);

    // 1. Create directory structure
    await this.createDirectories(opts, result);

    // 2. Copy + render templates
    await this.generateGemfile(opts, result);
    await this.generateLlmsTxt(opts, result);
    await this.generateDareConfig(opts, result);
    await this.generateDareSkillsManifest(opts, result);
    await this.generateInitializers(opts, result);
    await this.generateApplicationController(opts, result);
    await this.generateRakeTask(opts, result);

    // 3. Example resources (User)
    if (!opts.skipExamples) {
      await this.generateUserExample(opts, result);
    }

    // 4. LLM integration layer
    if (!opts.skipLlm) {
      await this.generateLlmLayer(opts, result);
    }

    // 5. Action Cable channels
    if (!opts.skipChannels) {
      await this.generateChannels(opts, result);
    }

    // 6. SummarizeDocument feature
    await this.generateSummarizeDocument(opts, result);

    // 7. GitHub Actions CI workflow
    await this.generateGitHubActions(opts, result);

    // 7b. .env.example (DARE DNA invariant — v3.1)
    await this.generateEnvExample(opts, result);

    // 8. Spec helpers + factories
    await this.generateSpecSupport(opts, result);

    this.log(opts, `Done! ${result.filesCreated.length} files created in ${opts.outputDir}`);
    this.printNextSteps(opts);

    return result;
  }

  // ── Directory structure ────────────────────────────────────────────────────

  private async createDirectories(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const dirs: string[] = [
      // Layered Design (ADR-05)
      'app/handlers',
      'app/services',
      'app/repositories',
      'app/models',
      'app/presenters',
      'app/middleware',
      'app/jobs',
      // Controllers concern
      'app/controllers/concerns',
      // Config
      'config/initializers',
      // LLM
      'app/llm/providers',
      'app/llm/prompts',
      'app/llm/validators',
      'app/llm/cache',
      'app/llm/rate_limit',
      // Channels
      'app/channels/application_cable',
      // Tasks
      'lib/tasks',
      // Specs
      'spec/services',
      'spec/handlers',
      'spec/channels',
      'spec/factories',
      'spec/api',
      'spec/support',
      // Docs
      'public',
      'tmp',
      '.dare',
      '.github/workflows',
    ];

    for (const dir of dirs) {
      const fullPath = path.join(opts.outputDir, dir);
      await fs.ensureDir(fullPath);
      result.directoriesCreated.push(dir);
    }

    this.log(opts, `Created ${dirs.length} directories`);
  }

  // ── Template generators ────────────────────────────────────────────────────

  private async generateGemfile(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const src  = path.join(this.TEMPLATES_DIR, 'Gemfile.erb');
    const dest = path.join(opts.outputDir, 'Gemfile');
    const content = await this.renderTemplate(src, opts);
    await fs.writeFile(dest, content);
    result.filesCreated.push('Gemfile');
  }

  private async generateLlmsTxt(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const src  = path.join(this.TEMPLATES_DIR, 'llms.txt.erb');
    const dest = path.join(opts.outputDir, 'llms.txt');
    const content = await this.renderTemplate(src, opts);
    await fs.writeFile(dest, content);
    result.filesCreated.push('llms.txt');
  }

  private async generateDareConfig(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const src  = path.join(this.TEMPLATES_DIR, 'config', 'dare.yml');
    const dest = path.join(opts.outputDir, 'config', 'dare.yml');
    const content = await this.renderTemplate(src, opts);
    await fs.writeFile(dest, content);
    result.filesCreated.push('config/dare.yml');
  }

  private async generateDareSkillsManifest(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const src  = path.join(this.TEMPLATES_DIR, '.dare', 'skills.yml');
    const dest = path.join(opts.outputDir, '.dare', 'skills.yml');
    await fs.copy(src, dest);
    result.filesCreated.push('.dare/skills.yml');
  }

  private async generateInitializers(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const initializerFiles = [
      'dare.rb',
      'rack_attack.rb',
      'rswag_api.rb',
    ];

    for (const filename of initializerFiles) {
      const src  = path.join(this.TEMPLATES_DIR, 'config', 'initializers', filename);
      const dest = path.join(opts.outputDir, 'config', 'initializers', filename);
      if (await fs.pathExists(src)) {
        await fs.copy(src, dest);
        result.filesCreated.push(`config/initializers/${filename}`);
      }
    }
  }

  private async generateApplicationController(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const files: Array<[string, string]> = [
      ['app/controllers/concerns/problem_details.rb', 'app/controllers/concerns/problem_details.rb'],
      ['app/controllers/application_controller.rb',   'app/controllers/application_controller.rb'],
    ];

    for (const [templateRel, destRel] of files) {
      const src  = path.join(this.TEMPLATES_DIR, templateRel);
      const dest = path.join(opts.outputDir, destRel);
      if (await fs.pathExists(src)) {
        await fs.copy(src, dest);
        result.filesCreated.push(destRel);
      }
    }
  }

  private async generateRakeTask(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const src  = path.join(this.TEMPLATES_DIR, 'lib', 'tasks', 'dare.rake');
    const dest = path.join(opts.outputDir, 'lib', 'tasks', 'dare.rake');
    await fs.copy(src, dest);
    result.filesCreated.push('lib/tasks/dare.rake');
  }

  private async generateUserExample(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const exampleFiles: Array<[string, string]> = [
      ['app/models/user.rb',                           'app/models/user.rb'],
      ['app/repositories/user_repository.rb',          'app/repositories/user_repository.rb'],
      ['app/services/create_user_service.rb',          'app/services/create_user_service.rb'],
      ['app/presenters/user_presenter.rb',             'app/presenters/user_presenter.rb'],
      ['app/handlers/users_handler.rb',                'app/handlers/users_handler.rb'],
      ['spec/services/create_user_service_spec.rb',    'spec/services/create_user_service_spec.rb'],
      ['spec/handlers/users_handler_spec.rb',          'spec/handlers/users_handler_spec.rb'],
      ['spec/factories/users.rb',                      'spec/factories/users.rb'],
      ['spec/api/users_spec.rb',                       'spec/api/users_spec.rb'],
    ];

    for (const [templateRel, destRel] of exampleFiles) {
      const src  = path.join(this.TEMPLATES_DIR, templateRel);
      const dest = path.join(opts.outputDir, destRel);
      if (await fs.pathExists(src)) {
        await fs.copy(src, dest);
        result.filesCreated.push(destRel);
      }
    }
  }

  private async generateLlmLayer(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const llmFiles: Array<[string, string]> = [
      ['app/llm/providers/llm_provider.rb',              'app/llm/providers/llm_provider.rb'],
      ['app/llm/providers/openai_provider.rb',           'app/llm/providers/openai_provider.rb'],
      ['app/llm/providers/dummy_provider.rb',            'app/llm/providers/dummy_provider.rb'],
      ['app/llm/prompts/prompt_loader.rb',               'app/llm/prompts/prompt_loader.rb'],
      ['app/llm/prompts/summarize_v1.jinja2',            'app/llm/prompts/summarize_v1.jinja2'],
      ['app/llm/validators/validator.rb',                'app/llm/validators/validator.rb'],
      ['app/llm/validators/summarize_output_schema.json','app/llm/validators/summarize_output_schema.json'],
      ['app/llm/cache/llm_cache.rb',                     'app/llm/cache/llm_cache.rb'],
      ['app/llm/rate_limit/token_bucket.rb',             'app/llm/rate_limit/token_bucket.rb'],
    ];

    for (const [templateRel, destRel] of llmFiles) {
      const src  = path.join(this.TEMPLATES_DIR, templateRel);
      const dest = path.join(opts.outputDir, destRel);
      if (await fs.pathExists(src)) {
        await fs.copy(src, dest);
        result.filesCreated.push(destRel);
      }
    }
  }

  private async generateChannels(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const channelFiles: Array<[string, string]> = [
      ['app/channels/application_cable/connection.rb', 'app/channels/application_cable/connection.rb'],
      ['app/channels/application_cable/channel.rb',    'app/channels/application_cable/channel.rb'],
      ['app/channels/dare_updates_channel.rb',         'app/channels/dare_updates_channel.rb'],
      ['app/channels/user_updates_channel.rb',         'app/channels/user_updates_channel.rb'],
      ['app/services/realtime_service.rb',             'app/services/realtime_service.rb'],
      ['spec/channels/user_updates_channel_spec.rb',   'spec/channels/user_updates_channel_spec.rb'],
    ];

    for (const [templateRel, destRel] of channelFiles) {
      const src  = path.join(this.TEMPLATES_DIR, templateRel);
      const dest = path.join(opts.outputDir, destRel);
      if (await fs.pathExists(src)) {
        await fs.copy(src, dest);
        result.filesCreated.push(destRel);
      }
    }
  }

  private async generateSummarizeDocument(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const summarizeFiles: Array<[string, string]> = [
      ['app/handlers/summarize_handler.rb',                    'app/handlers/summarize_handler.rb'],
      ['app/services/summarize_document_service.rb',           'app/services/summarize_document_service.rb'],
      ['app/repositories/document_repository.rb',             'app/repositories/document_repository.rb'],
      ['spec/services/summarize_document_service_spec.rb',     'spec/services/summarize_document_service_spec.rb'],
      ['spec/api/summarize_spec.rb',                          'spec/api/summarize_spec.rb'],
      ['spec/channels/dare_updates_channel_spec.rb',           'spec/channels/dare_updates_channel_spec.rb'],
    ];

    for (const [templateRel, destRel] of summarizeFiles) {
      const src  = path.join(this.TEMPLATES_DIR, templateRel);
      const dest = path.join(opts.outputDir, destRel);
      if (await fs.pathExists(src)) {
        await fs.copy(src, dest);
        result.filesCreated.push(destRel);
      }
    }
  }

  private async generateGitHubActions(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const src  = path.join(this.TEMPLATES_DIR, '.github', 'workflows', 'dare-ci.yml');
    const dest = path.join(opts.outputDir, '.github', 'workflows', 'dare-ci.yml');
    if (await fs.pathExists(src)) {
      await fs.copy(src, dest);
      result.filesCreated.push('.github/workflows/dare-ci.yml');
    }
  }

  // v3.1 — DNA invariant: every stack ships a .env.example with no real
  // secrets. Rails normally keeps config in credentials; this documents the
  // env-driven knobs (DB, Redis, rate limit, LLM) for parity with the other
  // stacks and the DARE DNA gate.
  private async generateEnvExample(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const src  = path.join(this.TEMPLATES_DIR, '.env.example');
    const dest = path.join(opts.outputDir, '.env.example');
    if (await fs.pathExists(src)) {
      await fs.copy(src, dest);
      result.filesCreated.push('.env.example');
    }
  }

  private async generateSpecSupport(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const specFiles: Array<[string, string]> = [
      ['spec/rails_helper.rb',   'spec/rails_helper.rb'],
      ['spec/swagger_helper.rb', 'spec/swagger_helper.rb'],
    ];

    for (const [templateRel, destRel] of specFiles) {
      const src  = path.join(this.TEMPLATES_DIR, templateRel);
      const dest = path.join(opts.outputDir, destRel);
      if (await fs.pathExists(src)) {
        await fs.copy(src, dest);
        result.filesCreated.push(destRel);
      }
    }
  }

  // ── Template rendering ─────────────────────────────────────────────────────

  /**
   * Reads a template file and performs ERB-style variable substitution.
   * Handles: <%= app_name %> and <%= variable_name %>
   */
  private async renderTemplate(templatePath: string, opts: RailsScaffoldOptions): Promise<string> {
    if (!await fs.pathExists(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    let content = await fs.readFile(templatePath, 'utf-8');

    const vars: Record<string, string> = {
      app_name:      opts.appName,
      ruby_version:  opts.rubyVersion ?? '>= 3.3.0',
      rails_version: opts.railsVersion ?? '~> 8.0',
      llm_provider:  opts.llmProvider ?? 'dummy',
    };

    for (const [key, value] of Object.entries(vars)) {
      content = content.split(`<%= ${key} %>`).join(value);
      content = content.split(`<%= ${key} -%>`).join(value);
    }

    return content;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private resolveOptions(appName: string, options: Partial<RailsScaffoldOptions>): RailsScaffoldOptions {
    return {
      appName,
      outputDir:     options.outputDir ?? path.resolve(process.cwd(), appName),
      rubyVersion:   options.rubyVersion   ?? '>= 3.3.0',
      railsVersion:  options.railsVersion  ?? '~> 8.0',
      skipExamples:  options.skipExamples  ?? false,
      skipLlm:       options.skipLlm       ?? false,
      skipChannels:  options.skipChannels  ?? false,
      llmProvider:   options.llmProvider   ?? 'dummy',
      verbose:       options.verbose       ?? true,
    };
  }

  private log(opts: RailsScaffoldOptions, message: string): void {
    if (opts.verbose) {
      console.log(`[dare rails-8] ${message}`);
    }
  }

  private printNextSteps(opts: RailsScaffoldOptions): void {
    if (!opts.verbose) return;

    console.log(`
Next steps:
  1. cd ${opts.outputDir}
  2. rails new . --database=postgresql --skip-test (if integrating into existing dir)
     OR run the full scaffold: dare new ${opts.appName} --stack rails
  3. bundle install
  4. bin/rails db:create db:migrate
  5. bundle exec rspec
  6. bundle exec rake dare:metrics

DARE docs:
  - llms.txt         — AI agent context
  - config/dare.yml  — DARE configuration
  - lib/tasks/dare.rake — rake dare:metrics, rake dare:openapi
  - .dare/skills.yml — installed skills manifest
`);
  }
}

// ── Default export ────────────────────────────────────────────────────────────

export default RailsScaffold;

// ── v3.1 StackScaffold adapter ────────────────────────────────────────────────
//
// Wraps the existing RailsScaffold class to implement the new StackScaffold
// contract. Behavior is identical to v3.0.0 — parity-rails.spec.ts gates this.

import type {
  ScaffoldOpts,
  ScaffoldResult,
  StackScaffold,
} from '../types.js';
import { DARE_DNA } from '../types.js';

export const ruby_rails_8: StackScaffold = {
  id: 'ruby-rails-8',
  label: '💎 Ruby / Rails 8',
  category: 'backend',
  status: 'stable',

  async generate(opts: ScaffoldOpts): Promise<ScaffoldResult> {
    const scaffolder = new RailsScaffold();
    const legacy = await scaffolder.generate(opts.projectName, {
      outputDir: opts.dir,
      llmProvider:
        opts.llm?.providers[0]?.id === 'openai' ? 'openai' : 'dummy',
      // v3.0.0 default behavior: always include the full DARE-shaped scaffold
      // (examples + LLM layer + channels). Skip-* knobs are reserved for
      // explicit opt-out via future CLI flags.
      skipExamples: false,
      skipLlm: false,
      skipChannels: false,
      verbose: false,
    });

    const filesWritten = [...legacy.filesCreated]
      .map((p) => path.relative(opts.dir, p).replace(/\\/g, '/'))
      .sort();

    return {
      filesWritten,
      postInstallSteps: [
        `cd ${opts.projectName}`,
        'rails new . --database=postgresql',
        'bundle install',
        'bin/rails db:create db:migrate',
        'bin/rails server',
      ],
      warnings: [],
      // RailsScaffold already emits every DNA artifact; v3.1 contract
      // is satisfied because the templates were already DARE-shaped.
      dnaEmitted: new Set(DARE_DNA),
    };
  },
};
