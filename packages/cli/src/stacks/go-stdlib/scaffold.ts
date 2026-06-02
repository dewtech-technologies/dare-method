// SPDX-License-Identifier: MIT
/**
 * T-035 — go-stdlib scaffolder.
 *
 * Same Layered Design as go-gin, no framework. Uses:
 *   - net/http 1.22 ServeMux (method + pattern routing)
 *   - pgx for DB + sqlc-compatible schema/queries
 *   - golang-jwt + bcrypt for auth
 *   - golang.org/x/time/rate for rate limit
 *   - github.com/coder/websocket (current name for nhooyr.io/websocket)
 *
 * Minimum-deps philosophy: only crates that don't have a stdlib equivalent.
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
  'go-stdlib',
);

const TEMPLATE_FILES: ReadonlyArray<{ template: string; dest: string }> = [
  { template: 'go.mod.tpl', dest: 'go.mod' },
  { template: 'gitignore', dest: '.gitignore' },
  { template: '.env.example', dest: '.env.example' },
  { template: 'README.md.tpl', dest: 'README.md' },
  { template: 'llms.txt.tpl', dest: 'llms.txt' },
  { template: 'openapi.json.tpl', dest: 'openapi.json' },
  { template: 'sqlc.yaml', dest: 'sqlc.yaml' },
  { template: 'cmd/server/main.go.tpl', dest: 'cmd/server/main.go' },
  { template: 'internal/config/config.go', dest: 'internal/config/config.go' },
  { template: 'internal/db/postgres.go.tpl', dest: 'internal/db/postgres.go' },
  { template: 'internal/httpx/json.go', dest: 'internal/httpx/json.go' },
  { template: 'internal/handler/auth_handler.go.tpl', dest: 'internal/handler/auth_handler.go' },
  { template: 'internal/handler/users_handler.go.tpl', dest: 'internal/handler/users_handler.go' },
  { template: 'internal/handler/ws_handler.go', dest: 'internal/handler/ws_handler.go' },
  { template: 'internal/service/auth_service.go.tpl', dest: 'internal/service/auth_service.go' },
  { template: 'internal/service/users_service.go.tpl', dest: 'internal/service/users_service.go' },
  { template: 'internal/repository/users_repository.go.tpl', dest: 'internal/repository/users_repository.go' },
  { template: 'internal/model/user.go', dest: 'internal/model/user.go' },
  { template: 'internal/middleware/chain.go', dest: 'internal/middleware/chain.go' },
  { template: 'internal/middleware/jwt.go.tpl', dest: 'internal/middleware/jwt.go' },
  { template: 'internal/middleware/rate_limit.go', dest: 'internal/middleware/rate_limit.go' },
  { template: 'internal/middleware/cors.go', dest: 'internal/middleware/cors.go' },
  { template: 'internal/llm/provider.go', dest: 'internal/llm/provider.go' },
  { template: 'internal/llm/dummy.go', dest: 'internal/llm/dummy.go' },
  { template: 'db/migrations/0001_create_users.up.sql', dest: 'db/migrations/0001_create_users.up.sql' },
  { template: 'db/migrations/0001_create_users.down.sql', dest: 'db/migrations/0001_create_users.down.sql' },
  { template: 'db/queries/users.sql', dest: 'db/queries/users.sql' },
  { template: 'tests/smoke_test.go.tpl', dest: 'tests/smoke_test.go' },
  { template: '.dare/skills.yml', dest: '.dare/skills.yml' },
  { template: '.github/workflows/dare-ci.yml', dest: '.github/workflows/dare-ci.yml' },
];

export const go_stdlib: StackScaffold = {
  id: 'go-stdlib',
  label: '🐹 Go / stdlib',
  category: 'backend',
  status: 'stable',

  async generate(opts: ScaffoldOpts): Promise<ScaffoldResult> {
    const vars = {
      projectName: opts.projectName,
      moduleName: opts.projectName,
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
      stackId: 'go-stdlib',
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
        'go mod tidy',
        'go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest',
        'sqlc generate',
        'go run ./cmd/server',
      ],
      warnings: [],
      dnaEmitted,
    };
  },
};
