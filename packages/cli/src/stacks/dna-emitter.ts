// SPDX-License-Identifier: MIT
/**
 * DNA emitter — writes the 7 invariant DARE artifacts to disk.
 *
 * Every scaffolder calls `emitDefaults()` early in `generate()` to satisfy
 * the DNA contract; then it overlays stack-specific versions on top.
 *
 * Two of the seven artifacts (`cli-json-flag` and `rate-limit`) are
 * "declarative" — the scaffolder reports it satisfied them by returning
 * them in `dnaEmitted`, and `dna.spec.ts` validates via structural grep
 * on the generated source.
 */
import path from 'node:path';
import fs from 'fs-extra';
import { assertRelativeSafe } from '../utils/path-safety.js';
import type { DareDnaArtifact, StackId } from './types.js';
import { DARE_DNA } from './types.js';

// ─── Secret patterns — reject in .env.example ──────────────────────────────

export const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /[A-Za-z0-9+/]{40,}={0,2}/,             // base64 ≥40 chars (likely key)
  /[a-f0-9]{32,}/,                        // hex ≥32 chars (hash / key)
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----/,  // PEM block
  /sk-[A-Za-z0-9]{40,}/,                  // OpenAI-style key
  /AKIA[0-9A-Z]{16}/,                     // AWS access key
];

export class EnvSecretError extends Error {
  public readonly line: number;
  public readonly value: string;
  public readonly pattern: RegExp;

  constructor(line: number, value: string, pattern: RegExp) {
    super(`.env.example line ${line}: value '${value}' matches secret pattern ${pattern}`);
    this.name = 'EnvSecretError';
    this.line = line;
    this.value = value;
    this.pattern = pattern;
  }
}

export class IOError extends Error {
  public readonly targetPath: string;
  public readonly cause: unknown;

  constructor(targetPath: string, cause: unknown) {
    super(`Failed to write '${targetPath}': ${(cause as Error)?.message ?? cause}`);
    this.name = 'IOError';
    this.targetPath = targetPath;
    this.cause = cause;
  }
}

/**
 * Validates a .env.example body. Throws `EnvSecretError` on the first match.
 */
export function validateEnvExample(content: string): void {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const value = trimmed.slice(eq + 1).trim();
    if (!value) continue;
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(value)) {
        throw new EnvSecretError(i + 1, value, pattern);
      }
    }
  }
}

// ─── emit() — write a single artifact ──────────────────────────────────────

export interface DnaEmitOpts {
  readonly dir: string;
  readonly projectName: string;
  readonly stackId: StackId;
  readonly artifact: DareDnaArtifact;
  readonly content: string;
  /** Subpath relative to opts.dir. Must not be absolute and must not contain '..'. */
  readonly targetPath: string;
}

/**
 * Writes one DNA artifact. Returns the relative path written.
 * Idempotent — overwrites if file exists (CLI ensures dir is empty upstream).
 */
export async function emit(opts: DnaEmitOpts): Promise<string> {
  assertRelativeSafe(opts.targetPath);

  // Defensive: if env-example, validate before writing.
  if (opts.artifact === 'env-example') {
    validateEnvExample(opts.content);
  }

  const abs = path.join(opts.dir, opts.targetPath);
  try {
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, opts.content, 'utf8');
  } catch (cause) {
    throw new IOError(abs, cause);
  }
  return opts.targetPath;
}

// ─── emitDefaults() — minimal viable content for all 7 artifacts ───────────

export interface EmitDefaultsCtx {
  readonly dir: string;
  readonly projectName: string;
  readonly stackId: StackId;
}

/**
 * Emits the 7 DNA artifacts with minimal viable defaults.
 * Each scaffolder typically OVERWRITES these with stack-specific content.
 *
 * Returns the full set DARE_DNA — scaffolder commits to satisfying all 7
 * (including `cli-json-flag` and `rate-limit` which are declarative).
 */
export async function emitDefaults(
  ctx: EmitDefaultsCtx,
): Promise<ReadonlySet<DareDnaArtifact>> {
  const { dir, projectName, stackId } = ctx;

  // 1. llms.txt
  await emit({
    dir,
    projectName,
    stackId,
    artifact: 'llms-txt',
    targetPath: 'llms.txt',
    content: defaultLlmsTxt(projectName, stackId),
  });

  // 2. openapi.json (minimal skeleton; scaffolder overrides)
  await emit({
    dir,
    projectName,
    stackId,
    artifact: 'openapi',
    targetPath: 'openapi.json',
    content: defaultOpenapi(projectName),
  });

  // 4. .env.example
  await emit({
    dir,
    projectName,
    stackId,
    artifact: 'env-example',
    targetPath: '.env.example',
    content: defaultEnvExample(),
  });

  // 6. .dare/skills.yml
  await emit({
    dir,
    projectName,
    stackId,
    artifact: 'skills-yml',
    targetPath: '.dare/skills.yml',
    content: defaultSkillsYml(stackId),
  });

  // 7. .github/workflows/dare-ci.yml
  await emit({
    dir,
    projectName,
    stackId,
    artifact: 'github-ci',
    targetPath: '.github/workflows/dare-ci.yml',
    content: defaultGithubCi(),
  });

  // 3 & 5 (cli-json-flag, rate-limit) are check-only — scaffolder declares
  // it satisfied them; `dna.spec.ts` greps the generated source.
  return new Set(DARE_DNA);
}

// ─── Default content for each artifact ─────────────────────────────────────

function defaultLlmsTxt(projectName: string, stackId: StackId): string {
  return `# ${projectName}

Generated by DARE Method (${stackId}).

## Setup

See README.md for full setup instructions.

## Commands

- run: see package manifest scripts
- test: see CI workflow

## Endpoints

See \`openapi.json\` (or \`/openapi.json\` at runtime) for the HTTP surface.
`;
}

function defaultOpenapi(projectName: string): string {
  return (
    JSON.stringify(
      {
        openapi: '3.1.0',
        info: { title: projectName, version: '0.1.0' },
        paths: {},
      },
      null,
      2,
    ) + '\n'
  );
}

function defaultEnvExample(): string {
  return `# Application
APP_PORT=3000
LOG_LEVEL=info

# Database — replace with your connection string
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# Auth
JWT_SECRET=replace-me-in-prod
JWT_EXPIRES_IN=15m

# Rate limit
RATE_LIMIT_PER_MIN=60

# LLM (optional)
# LLM_PROVIDER=dummy
# OPENAI_API_KEY=
`;
}

function defaultSkillsYml(stackId: StackId): string {
  // Map stackId → canonical skill id used in `packages/cli/templates/ide/*`.
  const skillId = skillIdForStack(stackId);
  return `version: 1
skills:
  - id: ${skillId}
    source: ${skillId}
`;
}

function skillIdForStack(stackId: StackId): string {
  // Backend stacks generally have a `skill-<framework>-api`; MCP stacks
  // all share `skill-mcp-server`.
  switch (stackId) {
    case 'ruby-rails-8':
      return 'skill-rails-api';
    case 'node-nestjs':
      return 'skill-nestjs-api';
    case 'python-fastapi':
      return 'skill-fastapi-api';
    case 'php-laravel':
      return 'skill-laravel-api';
    case 'rust-axum':
      return 'skill-axum-api';
    case 'go-gin':
      return 'skill-go-gin-api';
    case 'go-stdlib':
      return 'skill-go-stdlib-api';
    case 'mcp-node-ts':
    case 'mcp-python':
    case 'mcp-rust':
    case 'mcp-go':
      return 'skill-mcp-server';
  }
}

function defaultGithubCi(): string {
  return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  audit:
    name: Audit dependencies
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Audit
        run: echo "Replace with ecosystem-specific audit (pnpm audit / cargo audit / pip-audit / etc.)"

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Lint
        run: echo "Replace with ecosystem-specific linter"

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Test
        run: echo "Replace with ecosystem-specific test runner"
`;
}
