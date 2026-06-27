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
  /**
   * Generate a full-stack Rails 8 application (server-rendered MVC: views,
   * asset pipeline, Hotwire, ActionController::Base) instead of the default
   * API-only shape (ActionController::API, no views). Default: false (API-only).
   */
  fullstack?: boolean;
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

    // 5b. Full-stack view layer (server-rendered MVC) — only when fullstack
    if (opts.fullstack) {
      await this.generateViewLayer(opts, result);
    }

    // 5c. Rails runtime skeleton — boot files, bin stubs, db, base classes.
    //     Makes the scaffold a runnable Rails app (no manual `rails new`).
    await this.generateRuntimeSkeleton(opts, result);
    if (opts.fullstack) {
      await this.generateAssetRuntime(opts, result);
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
      // Rails runtime (boot skeleton — makes the app runnable without `rails new`)
      'config/environments',
      'bin',
      'db/migrate',
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

    // Full-stack MVC adds the view layer (server-rendered HTML).
    if (opts.fullstack) {
      dirs.push(
        'app/views/layouts',
        'app/views/home',
        'app/helpers',
        'app/assets/stylesheets',
        'app/javascript/controllers',
      );
    }

    for (const dir of dirs) {
      const fullPath = path.join(opts.outputDir, dir);
      await fs.ensureDir(fullPath);
      result.directoriesCreated.push(dir);
    }

    this.log(opts, `Created ${dirs.length} directories`);
  }

  // ── Template generators ────────────────────────────────────────────────────

  private async generateGemfile(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const template = opts.fullstack ? 'Gemfile.fullstack.erb' : 'Gemfile.erb';
    const src  = path.join(this.TEMPLATES_DIR, template);
    const dest = path.join(opts.outputDir, 'Gemfile');
    const content = await this.renderTemplate(src, opts);
    await fs.writeFile(dest, content);
    result.filesCreated.push('Gemfile');
  }

  private async generateLlmsTxt(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const template = opts.fullstack ? 'llms.fullstack.txt.erb' : 'llms.txt.erb';
    const src  = path.join(this.TEMPLATES_DIR, template);
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
    // Full-stack uses an ActionController::Base controller (views/CSRF/cookies);
    // API-only uses the ActionController::API controller. The destination is the
    // same file — only the source template differs.
    const appControllerTemplate = opts.fullstack
      ? 'app/controllers/application_controller.fullstack.rb'
      : 'app/controllers/application_controller.rb';

    const files: Array<[string, string]> = [
      ['app/controllers/concerns/problem_details.rb', 'app/controllers/concerns/problem_details.rb'],
      [appControllerTemplate,                          'app/controllers/application_controller.rb'],
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

  /**
   * Full-stack only — lays down the server-rendered view layer: application
   * layout, an example HomeController + view, the application helper, and a
   * routes.rb wiring the root page + Swagger UI. API-only never calls this.
   */
  private async generateViewLayer(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    // Templates rendered through ERB-var substitution (contain <%= app_name %>).
    const rendered: Array<[string, string]> = [
      ['app/views/layouts/application.html.erb', 'app/views/layouts/application.html.erb'],
      ['app/views/home/index.html.erb',          'app/views/home/index.html.erb'],
    ];
    for (const [templateRel, destRel] of rendered) {
      const src  = path.join(this.TEMPLATES_DIR, templateRel);
      const dest = path.join(opts.outputDir, destRel);
      if (await fs.pathExists(src)) {
        await fs.writeFile(dest, await this.renderTemplate(src, opts));
        result.filesCreated.push(destRel);
      }
    }

    // Plain files copied verbatim (no ERB-var substitution).
    const copied: Array<[string, string]> = [
      ['app/controllers/home_controller.rb', 'app/controllers/home_controller.rb'],
      ['app/helpers/application_helper.rb',  'app/helpers/application_helper.rb'],
      ['config/routes.fullstack.rb',         'config/routes.rb'],
    ];
    for (const [templateRel, destRel] of copied) {
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

  /**
   * Rails runtime skeleton — the boot files `rails new` would normally generate,
   * so the DARE scaffold is a runnable app on its own (no manual `rails new`).
   * Emitted for BOTH api-only and full-stack; `config/application.rb` is the
   * only variant-aware file (api railties vs `rails/all`).
   */
  private async generateRuntimeSkeleton(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    // Files with ERB-var substitution (<%= app_name %> / <%= app_module %>).
    const applicationTemplate = opts.fullstack
      ? 'config/application.fullstack.rb'
      : 'config/application.rb';
    const rendered: Array<[string, string]> = [
      [applicationTemplate, 'config/application.rb'],
      ['config/database.yml', 'config/database.yml'],
      ['config/cable.yml',    'config/cable.yml'],
      ['bin/setup',           'bin/setup'],
    ];
    for (const [templateRel, destRel] of rendered) {
      const src = path.join(this.TEMPLATES_DIR, templateRel);
      const dest = path.join(opts.outputDir, destRel);
      if (await fs.pathExists(src)) {
        await fs.writeFile(dest, await this.renderTemplate(src, opts));
        result.filesCreated.push(destRel);
      }
    }

    // Files copied verbatim.
    const copied: string[] = [
      'config/boot.rb',
      'config/environment.rb',
      'config/environments/development.rb',
      'config/environments/test.rb',
      'config/environments/production.rb',
      'config/puma.rb',
      'config/initializers/filter_parameter_logging.rb',
      'config.ru',
      'Rakefile',
      '.ruby-version',
      'app/models/application_record.rb',
      'app/jobs/application_job.rb',
      'bin/rails',
      'bin/rake',
      'bin/bundle',
      'db/migrate/20260101000001_create_users.rb',
      'db/seeds.rb',
      'public/404.html',
      'public/422.html',
      'public/500.html',
      'public/robots.txt',
    ];
    for (const rel of copied) {
      const src = path.join(this.TEMPLATES_DIR, rel);
      const dest = path.join(opts.outputDir, rel);
      if (await fs.pathExists(src)) {
        await fs.copy(src, dest);
        result.filesCreated.push(rel);
      }
    }

    // bin/* must be executable.
    for (const stub of ['bin/rails', 'bin/rake', 'bin/bundle', 'bin/setup']) {
      const p = path.join(opts.outputDir, stub);
      if (await fs.pathExists(p)) await fs.chmod(p, 0o755);
    }
  }

  /**
   * Full-stack only — the asset/JS runtime that backs the view layer: importmap
   * pins, Propshaft assets initializer, the stylesheet entry and the Stimulus/
   * Turbo JavaScript wiring, plus `bin/dev`.
   */
  private async generateAssetRuntime(opts: RailsScaffoldOptions, result: RailsScaffoldResult): Promise<void> {
    const copied: string[] = [
      'config/importmap.rb',
      'config/initializers/assets.rb',
      'app/assets/stylesheets/application.css',
      'app/javascript/application.js',
      'app/javascript/controllers/application.js',
      'app/javascript/controllers/index.js',
      'bin/dev',
    ];
    for (const rel of copied) {
      const src = path.join(this.TEMPLATES_DIR, rel);
      const dest = path.join(opts.outputDir, rel);
      if (await fs.pathExists(src)) {
        await fs.copy(src, dest);
        result.filesCreated.push(rel);
      }
    }
    const dev = path.join(opts.outputDir, 'bin/dev');
    if (await fs.pathExists(dev)) await fs.chmod(dev, 0o755);
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
      app_module:    this.toModuleName(opts.appName),
      // snake_case form for DB names / channel prefixes (Postgres-friendly).
      app_database:  opts.appName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'app',
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
      fullstack:     options.fullstack     ?? false,
      llmProvider:   options.llmProvider   ?? 'dummy',
      verbose:       options.verbose       ?? true,
    };
  }

  /**
   * Ruby module name for `config/application.rb` — CamelCase from the app name.
   * E.g. "dare-labs-plataform" → "DareLabsPlataform". Falls back to "App" when
   * the name has no usable alphanumerics.
   */
  private toModuleName(appName: string): string {
    const camel = appName
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    // A Ruby module/constant must start with an uppercase letter.
    return /^[A-Z]/.test(camel) ? camel : `App${camel}`;
  }

  private log(opts: RailsScaffoldOptions, message: string): void {
    if (opts.verbose) {
      console.log(`[dare rails-8] ${message}`);
    }
  }

  private printNextSteps(opts: RailsScaffoldOptions): void {
    if (!opts.verbose) return;

    // The runtime skeleton makes this a runnable Rails app — no `rails new`.
    const runStep = opts.fullstack ? 'bin/dev' : 'bin/rails server';

    console.log(`
Next steps:
  1. cd ${opts.outputDir}
  2. bundle install
  3. bin/rails db:prepare        # create + migrate (+ seed on a fresh DB)
  4. bundle exec rspec
  5. ${runStep}
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
      // Full-stack MVC (views + asset pipeline) is opt-in via the 'mvc' project
      // structure. Default stays API-only so the 'backend' option is unchanged.
      fullstack: opts.fullstack ?? false,
      verbose: false,
    });

    const filesWritten = [...legacy.filesCreated]
      .map((p) => path.relative(opts.dir, p).replace(/\\/g, '/'))
      .sort();

    // The runtime skeleton ships the Rails boot files, so the project runs
    // without a manual `rails new`. Full-stack uses bin/dev; api uses server.
    const runStep = opts.fullstack ? 'bin/dev' : 'bin/rails server';

    return {
      filesWritten,
      postInstallSteps: [
        `cd ${opts.projectName}`,
        'bundle install',
        'bin/rails db:prepare',
        runStep,
      ],
      warnings: [],
      // RailsScaffold already emits every DNA artifact; v3.1 contract
      // is satisfied because the templates were already DARE-shaped.
      dnaEmitted: new Set(DARE_DNA),
    };
  },
};
