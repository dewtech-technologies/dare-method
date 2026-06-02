// SPDX-License-Identifier: MIT
/**
 * T-032 — php-laravel scaffolder.
 *
 * Produces a Layered Design Laravel 11 API with:
 *   - Sanctum token auth + FormRequest validation
 *   - Eloquent User model + migration
 *   - Reverb (WebSocket) config + Pail (tail logs)
 *   - ThrottleRequests middleware (env-driven)
 *   - l5-swagger for OpenAPI 3.x
 *   - LlmProvider abstraction (Dummy + OpenAI)
 *   - Pest tests
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import type {
  DareDnaArtifact,
  ScaffoldOpts,
  ScaffoldResult,
  StackScaffold,
} from '../types.js';
import { DARE_DNA } from '../types.js';
import { emit } from '../dna-emitter.js';
import { detectEngine, renderToFile } from '../template-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'templates',
  'stacks',
  'php-laravel',
);

const TEMPLATE_FILES: ReadonlyArray<{ template: string; dest: string }> = [
  { template: 'composer.json.hbs', dest: 'composer.json' },
  { template: 'gitignore', dest: '.gitignore' },
  { template: '.env.example', dest: '.env.example' },
  { template: 'README.md.hbs', dest: 'README.md' },
  { template: 'llms.txt.hbs', dest: 'llms.txt' },
  { template: 'openapi.json.hbs', dest: 'openapi.json' },
  { template: 'artisan', dest: 'artisan' },
  { template: 'bootstrap/app.php', dest: 'bootstrap/app.php' },
  { template: 'bootstrap/providers.php', dest: 'bootstrap/providers.php' },
  { template: 'config/sanctum.php', dest: 'config/sanctum.php' },
  { template: 'config/reverb.php', dest: 'config/reverb.php' },
  { template: 'config/l5-swagger.php', dest: 'config/l5-swagger.php' },
  { template: 'app/Http/Controllers/Api/AuthController.php', dest: 'app/Http/Controllers/Api/AuthController.php' },
  { template: 'app/Http/Controllers/Api/UsersController.php', dest: 'app/Http/Controllers/Api/UsersController.php' },
  { template: 'app/Http/Requests/LoginRequest.php', dest: 'app/Http/Requests/LoginRequest.php' },
  { template: 'app/Http/Requests/CreateUserRequest.php', dest: 'app/Http/Requests/CreateUserRequest.php' },
  { template: 'app/Services/AuthService.php', dest: 'app/Services/AuthService.php' },
  { template: 'app/Services/UsersService.php', dest: 'app/Services/UsersService.php' },
  { template: 'app/Repositories/UsersRepository.php', dest: 'app/Repositories/UsersRepository.php' },
  { template: 'app/Models/User.php', dest: 'app/Models/User.php' },
  { template: 'app/Llm/Contracts/LlmProvider.php', dest: 'app/Llm/Contracts/LlmProvider.php' },
  { template: 'app/Llm/Providers/DummyProvider.php', dest: 'app/Llm/Providers/DummyProvider.php' },
  { template: 'app/Llm/Providers/OpenAiProvider.php', dest: 'app/Llm/Providers/OpenAiProvider.php' },
  { template: 'database/migrations/2026_06_01_000001_create_users_table.php', dest: 'database/migrations/2026_06_01_000001_create_users_table.php' },
  { template: 'database/seeders/DatabaseSeeder.php', dest: 'database/seeders/DatabaseSeeder.php' },
  { template: 'routes/api.php', dest: 'routes/api.php' },
  { template: 'routes/channels.php', dest: 'routes/channels.php' },
  { template: 'tests/Feature/AuthTest.php', dest: 'tests/Feature/AuthTest.php' },
  { template: 'tests/Feature/UsersTest.php', dest: 'tests/Feature/UsersTest.php' },
  { template: 'tests/Pest.php', dest: 'tests/Pest.php' },
  { template: 'phpstan.neon', dest: 'phpstan.neon' },
  { template: '.dare/skills.yml', dest: '.dare/skills.yml' },
  { template: '.github/workflows/dare-ci.yml', dest: '.github/workflows/dare-ci.yml' },
];

export const php_laravel: StackScaffold = {
  id: 'php-laravel',
  label: '🐘 PHP / Laravel',
  category: 'backend',
  status: 'stable',

  async generate(opts: ScaffoldOpts): Promise<ScaffoldResult> {
    const vars = {
      projectName: opts.projectName,
      llmProvider: opts.llm?.providers[0]?.id ?? 'dummy',
    };

    const filesWritten: string[] = [];

    for (const { template, dest } of TEMPLATE_FILES) {
      const templatePath = path.join(TEMPLATES_DIR, template);
      const engine = detectEngine(template);
      await renderToFile({
        templatePath,
        engine,
        vars,
        baseDir: opts.dir,
        destPath: dest,
      });
      filesWritten.push(dest);
    }

    const dnaEmitted: ReadonlySet<DareDnaArtifact> = new Set(DARE_DNA);

    const envPath = path.join(opts.dir, '.env.example');
    const envContent = await fs.readFile(envPath, 'utf8');
    await emit({
      dir: opts.dir,
      projectName: opts.projectName,
      stackId: 'php-laravel',
      artifact: 'env-example',
      targetPath: '.env.example',
      content: envContent,
    });

    return {
      filesWritten: [...filesWritten].sort(),
      postInstallSteps: [
        `cd ${opts.projectName}`,
        'cp .env.example .env',
        'composer install',
        'php artisan key:generate',
        'docker compose up -d postgres',
        'php artisan migrate --seed',
        'php artisan l5-swagger:generate',
        'php artisan serve',
      ],
      warnings: [],
      dnaEmitted,
    };
  },
};
