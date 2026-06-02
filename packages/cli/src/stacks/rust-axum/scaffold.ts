// SPDX-License-Identifier: MIT
/**
 * T-033 — rust-axum scaffolder.
 *
 * Produces a Layered Design Axum 0.7 API with:
 *   - Tokio runtime
 *   - tower-http (CORS, trace) + tower-governor (rate limit)
 *   - utoipa for OpenAPI 3.x
 *   - jsonwebtoken + argon2 for auth
 *   - sqlx + Postgres + migrations
 *   - axum::extract::ws for WebSocket
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
  'rust-axum',
);

const TEMPLATE_FILES: ReadonlyArray<{ template: string; dest: string }> = [
  { template: 'Cargo.toml.tera', dest: 'Cargo.toml' },
  { template: '.gitignore', dest: '.gitignore' },
  { template: '.env.example', dest: '.env.example' },
  { template: 'README.md.tera', dest: 'README.md' },
  { template: 'llms.txt.tera', dest: 'llms.txt' },
  { template: 'openapi.json.tera', dest: 'openapi.json' },
  { template: 'src/main.rs.tera', dest: 'src/main.rs' },
  { template: 'src/lib.rs', dest: 'src/lib.rs' },
  { template: 'src/config.rs', dest: 'src/config.rs' },
  { template: 'src/errors.rs', dest: 'src/errors.rs' },
  { template: 'src/handlers/mod.rs', dest: 'src/handlers/mod.rs' },
  { template: 'src/handlers/auth.rs', dest: 'src/handlers/auth.rs' },
  { template: 'src/handlers/users.rs', dest: 'src/handlers/users.rs' },
  { template: 'src/handlers/ws.rs', dest: 'src/handlers/ws.rs' },
  { template: 'src/services/mod.rs', dest: 'src/services/mod.rs' },
  { template: 'src/services/auth_service.rs', dest: 'src/services/auth_service.rs' },
  { template: 'src/services/user_service.rs', dest: 'src/services/user_service.rs' },
  { template: 'src/repositories/mod.rs', dest: 'src/repositories/mod.rs' },
  { template: 'src/repositories/user_repository.rs', dest: 'src/repositories/user_repository.rs' },
  { template: 'src/models/mod.rs', dest: 'src/models/mod.rs' },
  { template: 'src/models/user.rs', dest: 'src/models/user.rs' },
  { template: 'src/middleware/mod.rs', dest: 'src/middleware/mod.rs' },
  { template: 'src/middleware/auth.rs', dest: 'src/middleware/auth.rs' },
  { template: 'src/middleware/rate_limit.rs', dest: 'src/middleware/rate_limit.rs' },
  { template: 'src/llm/mod.rs', dest: 'src/llm/mod.rs' },
  { template: 'src/llm/provider.rs', dest: 'src/llm/provider.rs' },
  { template: 'migrations/0001_create_users.sql', dest: 'migrations/0001_create_users.sql' },
  { template: 'tests/integration_test.rs.tera', dest: 'tests/integration_test.rs' },
  { template: '.dare/skills.yml', dest: '.dare/skills.yml' },
  { template: '.github/workflows/dare-ci.yml', dest: '.github/workflows/dare-ci.yml' },
];

export const rust_axum: StackScaffold = {
  id: 'rust-axum',
  label: '🦀 Rust / Axum',
  category: 'backend',
  status: 'stable',

  async generate(opts: ScaffoldOpts): Promise<ScaffoldResult> {
    const vars = {
      projectName: opts.projectName,
      crateName: opts.projectName.replace(/-/g, '_'),
      llmProvider: opts.llm?.providers[0]?.id ?? 'dummy',
      isMonorepo: opts.isMonorepo,
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
      stackId: 'rust-axum',
      artifact: 'env-example',
      targetPath: '.env.example',
      content: envContent,
    });

    return {
      filesWritten: [...filesWritten].sort(),
      postInstallSteps: [
        `cd ${opts.projectName}`,
        'cp .env.example .env',
        'docker compose up -d postgres',
        'sqlx database create',
        'sqlx migrate run',
        'cargo run',
      ],
      warnings: [],
      dnaEmitted,
    };
  },
};
