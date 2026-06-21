/**
 * DNA detector for `dare dna`.
 *
 * Extracts the *conventions* of an existing codebase ("how this project does
 * things") so the DARE agent can follow the house style instead of generic
 * defaults. Deterministic and line/regex-based — no AST, no LLM — matching the
 * rest of the CLI. The semantic layer (`/dare-dna` skill) turns these facts
 * into actionable rules.
 *
 * Reuses `detectProject` (stack), `detectModules` / `reverse-facts.json` (file
 * inventory) and `isTestFile` (test classification).
 *
 * License: MIT (part of DARE CLI).
 */

import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'node:child_process';
import { isTestFile } from './static-analyzer.js';
import { detectModules, type ModuleInfo } from './module-detector.js';
import { extractDnaWithAst } from '../ast/conventions/dna-extract.js';
import { mergeDnaFacts } from '../ast/conventions/merge-facts.js';
import type { ConventionExtractionMeta } from '../ast/conventions/types.js';

export interface ToolingConfig {
  name: string;
  configPath: string;
  /** A few high-signal parsed rules (best-effort; empty for presence-only). */
  rules?: Record<string, unknown>;
}

export interface NamingByExt {
  extension: string;
  dominant: 'kebab-case' | 'camelCase' | 'snake_case' | 'PascalCase' | 'mixed';
  counts: Record<string, number>;
  samples: string[];
}

export interface DnaFacts {
  generatedAt: string;
  fileInventorySource: 'reverse-facts' | 'module-detector';
  tooling: {
    linters: ToolingConfig[];
    formatters: ToolingConfig[];
  };
  naming: NamingByExt[];
  architecture: {
    detectedLayers: string[];
    guess: string;
  };
  testing: {
    framework?: string;
    testFiles: number;
    prodFiles: number;
    ratio: number;
  };
  libraries: {
    orm?: string;
    http?: string;
    auth?: string;
    validation?: string;
  };
  commits: {
    sampled: number;
    conventional: boolean;
    prefixes: Record<string, number>;
  } | null;
}

// ── Tooling detection ──────────────────────────────────────────────────────────

const LINTER_FILES: Array<{ name: string; files: string[] }> = [
  { name: 'ESLint', files: ['.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs'] },
  { name: 'Biome', files: ['biome.json', 'biome.jsonc'] },
  { name: 'RuboCop', files: ['.rubocop.yml'] },
  { name: 'PHPStan', files: ['phpstan.neon', 'phpstan.neon.dist'] },
  { name: 'Ruff', files: ['ruff.toml', '.ruff.toml'] },
  { name: 'Clippy', files: ['clippy.toml', '.clippy.toml'] },
  { name: 'golangci-lint', files: ['.golangci.yml', '.golangci.yaml', '.golangci.toml'] },
];

const FORMATTER_FILES: Array<{ name: string; files: string[] }> = [
  { name: 'Prettier', files: ['.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.yml', '.prettierrc.yaml', 'prettier.config.js', 'prettier.config.cjs'] },
  { name: 'EditorConfig', files: ['.editorconfig'] },
  { name: 'rustfmt', files: ['.rustfmt.toml', 'rustfmt.toml'] },
];

async function firstExisting(root: string, files: string[]): Promise<string | null> {
  for (const f of files) {
    if (await fs.pathExists(path.join(root, f))) return f;
  }
  return null;
}

async function detectTooling(root: string): Promise<DnaFacts['tooling']> {
  const linters: ToolingConfig[] = [];
  for (const { name, files } of LINTER_FILES) {
    const found = await firstExisting(root, files);
    if (found) linters.push({ name, configPath: found });
  }

  // ESLint can live in package.json#eslintConfig.
  const pkg = await readJsonSafe(path.join(root, 'package.json'));
  if (pkg?.eslintConfig && !linters.some((l) => l.name === 'ESLint')) {
    linters.push({ name: 'ESLint', configPath: 'package.json#eslintConfig' });
  }
  // Ruff can live in pyproject.toml[tool.ruff].
  const pyproject = await readTextSafe(path.join(root, 'pyproject.toml'));
  if (pyproject.includes('[tool.ruff]') && !linters.some((l) => l.name === 'Ruff')) {
    linters.push({ name: 'Ruff', configPath: 'pyproject.toml[tool.ruff]' });
  }

  const formatters: ToolingConfig[] = [];
  for (const { name, files } of FORMATTER_FILES) {
    const found = await firstExisting(root, files);
    if (found) formatters.push({ name, configPath: found, rules: await parseFormatter(root, name, found) });
  }
  if (pkg?.prettier && !formatters.some((f) => f.name === 'Prettier')) {
    formatters.push({
      name: 'Prettier',
      configPath: 'package.json#prettier',
      rules: typeof pkg.prettier === 'object' ? pickPrettierRules(pkg.prettier) : undefined,
    });
  }

  return { linters, formatters };
}

const PRETTIER_KEYS = ['semi', 'singleQuote', 'tabWidth', 'printWidth', 'trailingComma', 'useTabs'];

function pickPrettierRules(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PRETTIER_KEYS) if (k in obj) out[k] = obj[k];
  return out;
}

async function parseFormatter(
  root: string,
  name: string,
  file: string,
): Promise<Record<string, unknown> | undefined> {
  const abs = path.join(root, file);
  if (name === 'Prettier' && /\.(json|prettierrc)$/.test(file)) {
    const json = await readJsonSafe(abs);
    return json ? pickPrettierRules(json) : undefined;
  }
  if (name === 'EditorConfig') {
    const text = await readTextSafe(abs);
    const rules: Record<string, unknown> = {};
    const style = /indent_style\s*=\s*(\w+)/.exec(text);
    const size = /indent_size\s*=\s*(\w+)/.exec(text);
    if (style) rules.indent_style = style[1];
    if (size) rules.indent_size = size[1];
    return Object.keys(rules).length ? rules : undefined;
  }
  return undefined;
}

// ── Naming conventions ───────────────────────────────────────────────────────

type NameStyle = 'kebab-case' | 'camelCase' | 'snake_case' | 'PascalCase' | 'mixed';

function classifyName(basename: string): NameStyle {
  const stem = basename.replace(/\.[^.]+$/, '').replace(/\.(test|spec|stories|module|service|controller)$/i, '');
  if (!stem) return 'mixed';
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(stem)) return 'kebab-case';
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(stem)) return 'snake_case';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(stem)) return 'PascalCase';
  if (/^[a-z][a-zA-Z0-9]*$/.test(stem)) return 'camelCase';
  return 'mixed';
}

function computeNaming(files: string[]): NamingByExt[] {
  const byExt = new Map<string, { counts: Record<string, number>; samples: string[] }>();
  for (const rel of files) {
    if (isTestFile(rel)) continue;
    const ext = path.extname(rel);
    if (!ext) continue;
    const style = classifyName(path.basename(rel));
    if (!byExt.has(ext)) byExt.set(ext, { counts: {}, samples: [] });
    const entry = byExt.get(ext)!;
    entry.counts[style] = (entry.counts[style] ?? 0) + 1;
    if (entry.samples.length < 4) entry.samples.push(path.basename(rel));
  }

  const out: NamingByExt[] = [];
  for (const [extension, { counts, samples }] of byExt) {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, n]) => s + n, 0);
    const [topStyle, topCount] = sorted[0];
    // "dominant" only if it clearly wins (>= 60%); else mixed.
    const dominant = topCount / total >= 0.6 ? (topStyle as NameStyle) : 'mixed';
    out.push({ extension, dominant, counts, samples });
  }
  return out.sort((a, b) => a.extension.localeCompare(b.extension));
}

// ── Architecture / layering ────────────────────────────────────────────────────

const KNOWN_LAYERS = [
  'controllers', 'controller', 'services', 'service', 'repositories', 'repository',
  'models', 'model', 'handlers', 'handler', 'usecases', 'use_cases', 'entities',
  'entity', 'dto', 'dtos', 'middleware', 'middlewares', 'routes', 'views',
  'components', 'domain', 'infrastructure', 'application', 'adapters', 'ports',
];

function computeArchitecture(files: string[]): DnaFacts['architecture'] {
  const segments = new Set<string>();
  for (const rel of files) {
    for (const seg of rel.split('/')) segments.add(seg.toLowerCase());
  }
  const detected = KNOWN_LAYERS.filter((l) => segments.has(l));
  // Concept membership tolerant to plural forms (service(s), repository->repositories).
  const detectedSet = new Set(detected);
  const has = (singular: string): boolean => {
    const forms = [singular, singular + 's'];
    if (singular.endsWith('y')) forms.push(singular.slice(0, -1) + 'ies');
    return forms.some((f) => detectedSet.has(f));
  };

  let guess = 'indefinido';
  if (has('domain') && (has('infrastructure') || has('adapter') || has('port'))) {
    guess = 'Hexagonal / Ports & Adapters';
  } else if (has('controller') && has('service') && has('repository')) {
    guess = 'Layered (Controller → Service → Repository)';
  } else if (has('controller') && (has('model') || has('view'))) {
    guess = 'MVC';
  } else if (has('handler') && has('service')) {
    guess = 'Layered (Handler → Service)';
  } else if (has('component')) {
    guess = 'Component-based (frontend)';
  }
  return { detectedLayers: detected, guess };
}

// ── Testing ─────────────────────────────────────────────────────────────────

function detectTestFramework(deps: Record<string, string>, pyproject: string, gemfile: string): string | undefined {
  if (deps['vitest']) return 'Vitest';
  if (deps['jest'] || deps['@jest/core']) return 'Jest';
  if (deps['mocha']) return 'Mocha';
  if (deps['@playwright/test']) return 'Playwright';
  if (/pytest/.test(pyproject)) return 'pytest';
  if (/rspec/i.test(gemfile)) return 'RSpec';
  if (deps['phpunit/phpunit']) return 'PHPUnit';
  return undefined;
}

function computeTesting(files: string[], framework: string | undefined): DnaFacts['testing'] {
  let testFiles = 0;
  for (const rel of files) if (isTestFile(rel)) testFiles++;
  const prodFiles = files.length - testFiles;
  const ratio = prodFiles > 0 ? Math.round((testFiles / prodFiles) * 100) / 100 : 0;
  return { framework, testFiles, prodFiles, ratio };
}

// ── Libraries ─────────────────────────────────────────────────────────────────

function detectLibraries(
  deps: Record<string, string>,
  composer: Record<string, string>,
  cargo: string,
  gemfile: string,
  pyproject: string,
): DnaFacts['libraries'] {
  const libs: DnaFacts['libraries'] = {};
  // ORM
  if (deps['prisma'] || deps['@prisma/client']) libs.orm = 'Prisma';
  else if (deps['typeorm']) libs.orm = 'TypeORM';
  else if (deps['sequelize']) libs.orm = 'Sequelize';
  else if (deps['drizzle-orm']) libs.orm = 'Drizzle';
  else if (/sqlx|diesel|sea-orm/.test(cargo)) libs.orm = /diesel/.test(cargo) ? 'Diesel' : /sea-orm/.test(cargo) ? 'SeaORM' : 'SQLx';
  else if (/sqlalchemy/i.test(pyproject)) libs.orm = 'SQLAlchemy';
  else if (composer['laravel/framework']) libs.orm = 'Eloquent';
  else if (/activerecord|rails/i.test(gemfile)) libs.orm = 'ActiveRecord';

  // HTTP / framework
  if (deps['@nestjs/core']) libs.http = 'NestJS';
  else if (deps['express']) libs.http = 'Express';
  else if (deps['fastify']) libs.http = 'Fastify';
  else if (/axum/.test(cargo)) libs.http = 'Axum';
  else if (/fastapi/i.test(pyproject)) libs.http = 'FastAPI';
  else if (composer['laravel/framework']) libs.http = 'Laravel';

  // Auth
  if (deps['passport'] || deps['@nestjs/passport']) libs.auth = 'Passport';
  else if (deps['jsonwebtoken'] || deps['jose']) libs.auth = 'JWT';
  else if (composer['laravel/sanctum']) libs.auth = 'Sanctum';
  else if (/devise/i.test(gemfile)) libs.auth = 'Devise';

  // Validation
  if (deps['zod']) libs.validation = 'Zod';
  else if (deps['class-validator']) libs.validation = 'class-validator';
  else if (deps['joi']) libs.validation = 'Joi';
  else if (deps['yup']) libs.validation = 'Yup';
  else if (/pydantic/i.test(pyproject)) libs.validation = 'Pydantic';

  return libs;
}

// ── Commits ─────────────────────────────────────────────────────────────────

const CONVENTIONAL_RE = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:/;

function detectCommits(root: string): DnaFacts['commits'] {
  let raw: string;
  try {
    raw = execSync('git log --no-merges --pretty=%s -n 100', {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null; // not a git repo / git unavailable
  }
  const subjects = raw.split(/\r?\n/).filter(Boolean);
  if (subjects.length === 0) return null;

  const prefixes: Record<string, number> = {};
  let conventionalCount = 0;
  for (const s of subjects) {
    const m = CONVENTIONAL_RE.exec(s);
    if (m) {
      conventionalCount++;
      prefixes[m[1]] = (prefixes[m[1]] ?? 0) + 1;
    }
  }
  return {
    sampled: subjects.length,
    conventional: conventionalCount / subjects.length >= 0.5,
    prefixes,
  };
}

// ── Orchestration ─────────────────────────────────────────────────────────────

export interface DetectDnaOptions {
  readonly ast?: boolean;
  readonly maxFileBytes?: number;
}

export interface DetectDnaResult {
  readonly facts: DnaFacts;
  readonly extraction?: ConventionExtractionMeta;
}

async function detectDnaRegex(root: string, generatedAt: string): Promise<DnaFacts> {
  // File inventory: prefer an existing reverse-facts.json, else run module detection.
  const { files, source } = await loadFileInventoryWithModules(root);

  // Manifests for lib/framework/test detection.
  const pkg = await readJsonSafe(path.join(root, 'package.json'));
  const deps: Record<string, string> = {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
  };
  const composerJson = await readJsonSafe(path.join(root, 'composer.json'));
  const composer: Record<string, string> = {
    ...(composerJson?.require ?? {}),
    ...(composerJson?.['require-dev'] ?? {}),
  };
  const cargo = await readTextSafe(path.join(root, 'Cargo.toml'));
  const gemfile = await readTextSafe(path.join(root, 'Gemfile'));
  const pyproject = await readTextSafe(path.join(root, 'pyproject.toml'));

  const framework = detectTestFramework(deps, pyproject, gemfile);

  return {
    generatedAt,
    fileInventorySource: source,
    tooling: await detectTooling(root),
    naming: computeNaming(files),
    architecture: computeArchitecture(files),
    testing: computeTesting(files, framework),
    libraries: detectLibraries(deps, composer, cargo, gemfile, pyproject),
    commits: detectCommits(root),
  };
}

export async function detectDnaDetailed(
  root: string,
  generatedAt: string,
  opts?: DetectDnaOptions,
): Promise<DetectDnaResult> {
  const regexFacts = await detectDnaRegex(root, generatedAt);
  if (!opts?.ast) return { facts: regexFacts };

  const { files, modules } = await loadFileInventoryWithModules(root);
  const astResult = await extractDnaWithAst({
    root,
    files,
    modules,
    maxFileBytes: opts.maxFileBytes,
  });

  const merged = mergeDnaFacts(regexFacts, astResult.slice);
  const extraction: ConventionExtractionMeta = {
    mode: 'hybrid',
    astEnabled: true,
    astAvailable: astResult.astAvailable,
    astPatternCount: astResult.slice.extraLayers.length + astResult.slice.diPatterns.length,
    regexPatternCount: regexFacts.architecture.detectedLayers.length,
  };

  return { facts: merged, extraction };
}

export async function detectDna(root: string, generatedAt: string): Promise<DnaFacts> {
  return (await detectDnaDetailed(root, generatedAt)).facts;
}

async function loadFileInventoryWithModules(
  root: string,
): Promise<{ files: string[]; modules: ModuleInfo[]; source: DnaFacts['fileInventorySource'] }> {
  const reverseFacts = path.join(root, 'DARE', 'REVERSE', 'reverse-facts.json');
  if (await fs.pathExists(reverseFacts)) {
    const facts = await readJsonSafe(reverseFacts);
    const modules = (facts?.modules ?? []) as ModuleInfo[];
    const files = modules.flatMap((m) => m.files ?? []);
    if (files.length > 0) return { files, modules, source: 'reverse-facts' };
  }
  const graph = await detectModules(root);
  return {
    files: graph.modules.flatMap((m) => m.files),
    modules: graph.modules,
    source: 'module-detector',
  };
}

// ── Small IO helpers ────────────────────────────────────────────────────────

async function readJsonSafe(abs: string): Promise<Record<string, any> | null> {
  try {
    return (await fs.readJSON(abs)) as Record<string, any>;
  } catch {
    return null;
  }
}

async function readTextSafe(abs: string): Promise<string> {
  try {
    return await fs.readFile(abs, 'utf-8');
  } catch {
    return '';
  }
}
