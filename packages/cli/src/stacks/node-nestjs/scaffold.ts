// SPDX-License-Identifier: MIT
/**
 * T-030 — node-nestjs scaffolder (canonical v3.1 implementation).
 *
 * Produces a Layered Design NestJS 10 project with:
 *   - Prisma + Postgres (User model with email/password/role)
 *   - JWT auth (login + me + users CRUD)
 *   - Swagger / OpenAPI at /openapi.json
 *   - Throttler rate limit (env-driven)
 *   - class-validator + class-transformer
 *   - Pino logging
 *
 * Templates live in packages/cli/templates/stacks/node-nestjs/.
 * Engine per file detected by extension (handlebars / raw).
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
  'node-nestjs',
);

/** Every file emitted, in the order it appears in this list. */
const TEMPLATE_FILES: ReadonlyArray<{ template: string; dest: string }> = [
  { template: 'package.json.hbs', dest: 'package.json' },
  { template: 'tsconfig.json', dest: 'tsconfig.json' },
  { template: 'tsconfig.build.json', dest: 'tsconfig.build.json' },
  { template: 'nest-cli.json', dest: 'nest-cli.json' },
  { template: 'gitignore', dest: '.gitignore' },
  { template: '.env.example', dest: '.env.example' },
  { template: 'README.md.hbs', dest: 'README.md' },
  { template: 'llms.txt.hbs', dest: 'llms.txt' },
  { template: 'openapi.json.hbs', dest: 'openapi.json' },
  { template: 'src/main.ts.hbs', dest: 'src/main.ts' },
  { template: 'src/app.module.ts', dest: 'src/app.module.ts' },
  { template: 'src/common/filters/problem-details.filter.ts', dest: 'src/common/filters/problem-details.filter.ts' },
  { template: 'src/common/interceptors/json-response.interceptor.ts', dest: 'src/common/interceptors/json-response.interceptor.ts' },
  { template: 'src/prisma/prisma.module.ts', dest: 'src/prisma/prisma.module.ts' },
  { template: 'src/prisma/prisma.service.ts', dest: 'src/prisma/prisma.service.ts' },
  { template: 'src/auth/auth.module.ts', dest: 'src/auth/auth.module.ts' },
  { template: 'src/auth/auth.controller.ts', dest: 'src/auth/auth.controller.ts' },
  { template: 'src/auth/auth.service.ts', dest: 'src/auth/auth.service.ts' },
  { template: 'src/auth/jwt.strategy.ts', dest: 'src/auth/jwt.strategy.ts' },
  { template: 'src/auth/dto/login.dto.ts', dest: 'src/auth/dto/login.dto.ts' },
  { template: 'src/auth/dto/login-response.dto.ts', dest: 'src/auth/dto/login-response.dto.ts' },
  { template: 'src/users/users.module.ts', dest: 'src/users/users.module.ts' },
  { template: 'src/users/users.controller.ts', dest: 'src/users/users.controller.ts' },
  { template: 'src/users/users.service.ts', dest: 'src/users/users.service.ts' },
  { template: 'src/users/users.repository.ts', dest: 'src/users/users.repository.ts' },
  { template: 'src/users/dto/user.dto.ts', dest: 'src/users/dto/user.dto.ts' },
  { template: 'src/users/dto/create-user.dto.ts', dest: 'src/users/dto/create-user.dto.ts' },
  { template: 'prisma/schema.prisma', dest: 'prisma/schema.prisma' },
  { template: 'prisma/seed.ts.hbs', dest: 'prisma/seed.ts' },
  { template: '.dare/skills.yml', dest: '.dare/skills.yml' },
  { template: '.github/workflows/dare-ci.yml', dest: '.github/workflows/dare-ci.yml' },
];

export const node_nestjs: StackScaffold = {
  id: 'node-nestjs',
  label: '🟢 Node.js / NestJS',
  category: 'backend',
  status: 'stable',

  async generate(opts: ScaffoldOpts): Promise<ScaffoldResult> {
    const vars = {
      projectName: opts.projectName,
      llmProvider: opts.llm?.providers[0]?.id ?? 'dummy',
      hasRealtime: opts.realtime !== undefined,
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

    // DNA gate sanity: emit (or re-emit) any of the 7 invariants that the
    // template set above didn't already cover. With the current TEMPLATE_FILES,
    // all 5 file-backed artifacts (llms-txt, openapi, env-example, skills-yml,
    // github-ci) ship from templates. cli-json-flag + rate-limit are
    // declarative (verified by source grep in T-060/T-062).
    const dnaEmitted: ReadonlySet<DareDnaArtifact> = new Set(DARE_DNA);

    // Defensive: validate the generated .env.example has no secret-like values.
    // emit() runs this check, so call it on the already-written file content.
    const envPath = path.join(opts.dir, '.env.example');
    const envContent = await fs.readFile(envPath, 'utf8');
    await emit({
      dir: opts.dir,
      projectName: opts.projectName,
      stackId: 'node-nestjs',
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
        'pnpm install',
        'pnpm prisma migrate dev --name init',
        'pnpm prisma db seed',
        'pnpm start:dev',
      ],
      warnings: [],
      dnaEmitted,
    };
  },
};
