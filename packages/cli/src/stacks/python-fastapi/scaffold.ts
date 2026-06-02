// SPDX-License-Identifier: MIT
/**
 * T-031 — python-fastapi scaffolder.
 *
 * Produces a Layered Design FastAPI project with:
 *   - Pydantic v2 + SQLAlchemy 2.0 + Alembic migrations
 *   - JWT auth via python-jose, passlib[bcrypt]
 *   - slowapi rate limit (env-driven)
 *   - uvicorn[standard] server
 *   - Native OpenAPI at /openapi.json
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
  'python-fastapi',
);

const TEMPLATE_FILES: ReadonlyArray<{ template: string; dest: string }> = [
  { template: 'pyproject.toml.j2', dest: 'pyproject.toml' },
  { template: '.gitignore', dest: '.gitignore' },
  { template: '.env.example', dest: '.env.example' },
  { template: 'README.md.j2', dest: 'README.md' },
  { template: 'llms.txt.j2', dest: 'llms.txt' },
  { template: 'openapi.json.j2', dest: 'openapi.json' },
  { template: 'app/__init__.py', dest: 'app/__init__.py' },
  { template: 'app/main.py.j2', dest: 'app/main.py' },
  { template: 'app/core/__init__.py', dest: 'app/core/__init__.py' },
  { template: 'app/core/config.py', dest: 'app/core/config.py' },
  { template: 'app/core/security.py', dest: 'app/core/security.py' },
  { template: 'app/db/__init__.py', dest: 'app/db/__init__.py' },
  { template: 'app/db/session.py', dest: 'app/db/session.py' },
  { template: 'app/models/__init__.py', dest: 'app/models/__init__.py' },
  { template: 'app/models/user.py', dest: 'app/models/user.py' },
  { template: 'app/schemas/__init__.py', dest: 'app/schemas/__init__.py' },
  { template: 'app/schemas/user.py', dest: 'app/schemas/user.py' },
  { template: 'app/repositories/__init__.py', dest: 'app/repositories/__init__.py' },
  { template: 'app/repositories/user_repository.py', dest: 'app/repositories/user_repository.py' },
  { template: 'app/services/__init__.py', dest: 'app/services/__init__.py' },
  { template: 'app/services/auth_service.py', dest: 'app/services/auth_service.py' },
  { template: 'app/services/user_service.py', dest: 'app/services/user_service.py' },
  { template: 'app/routers/__init__.py', dest: 'app/routers/__init__.py' },
  { template: 'app/routers/auth.py', dest: 'app/routers/auth.py' },
  { template: 'app/routers/users.py', dest: 'app/routers/users.py' },
  { template: 'alembic.ini.j2', dest: 'alembic.ini' },
  { template: 'alembic/env.py', dest: 'alembic/env.py' },
  { template: 'alembic/script.py.mako', dest: 'alembic/script.py.mako' },
  { template: 'alembic/versions/0001_create_users.py.j2', dest: 'alembic/versions/0001_create_users.py' },
  { template: 'tests/__init__.py', dest: 'tests/__init__.py' },
  { template: 'tests/test_auth.py', dest: 'tests/test_auth.py' },
  { template: '.dare/skills.yml', dest: '.dare/skills.yml' },
  { template: '.github/workflows/dare-ci.yml', dest: '.github/workflows/dare-ci.yml' },
];

export const python_fastapi: StackScaffold = {
  id: 'python-fastapi',
  label: '🐍 Python / FastAPI',
  category: 'backend',
  status: 'stable',

  async generate(opts: ScaffoldOpts): Promise<ScaffoldResult> {
    const vars = {
      projectName: opts.projectName,
      projectModule: opts.projectName.replace(/-/g, '_'),
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
      stackId: 'python-fastapi',
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
        'python -m venv .venv',
        'source .venv/bin/activate    # or .venv\\Scripts\\activate on Windows',
        'pip install -e ".[dev]"',
        'alembic upgrade head',
        'uvicorn app.main:app --reload',
      ],
      warnings: [],
      dnaEmitted,
    };
  },
};
