/**
 * Stack bootstrap — runs the official scaffold for the chosen backend /
 * frontend / MCP stack. Called by `dare init` BEFORE the DARE artifacts are
 * copied on top.
 *
 * No fallbacks: if the required tool (composer / npm / cargo / python) is not
 * on PATH, this module throws a clear error pointing to install instructions.
 * Generating a fake skeleton is what got us into trouble before — we don't
 * do that anymore.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';

export type BackendStack =
  | 'php-laravel'
  | 'node-nestjs'
  | 'python-fastapi'
  | 'rust-axum'
  | 'go-gin';

export type FrontendStack = 'react' | 'vue';

export type McpLanguage = 'node-ts' | 'python';

export interface BootstrapBackendOptions {
  stack: BackendStack;
  dir: string;
  projectName: string;
}

export interface BootstrapFrontendOptions {
  stack: FrontendStack;
  dir: string;
  projectName: string;
}

export interface BootstrapMcpOptions {
  language: McpLanguage;
  dir: string;
  projectName: string;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function bootstrapBackend(opts: BootstrapBackendOptions): Promise<void> {
  switch (opts.stack) {
    case 'php-laravel':
      return bootstrapPhpLaravel(opts.dir, opts.projectName);
    case 'node-nestjs':
      return bootstrapNodeNestjs(opts.dir, opts.projectName);
    case 'python-fastapi':
      return bootstrapPythonFastapi(opts.dir);
    case 'rust-axum':
      return bootstrapRustAxum(opts.dir, opts.projectName);
    case 'go-gin':
      return bootstrapGoGin(opts.dir, opts.projectName);
    default:
      throw new Error(`Unknown backend stack: ${opts.stack as string}`);
  }
}

export async function bootstrapFrontend(opts: BootstrapFrontendOptions): Promise<void> {
  switch (opts.stack) {
    case 'react':
      return bootstrapVite(opts.dir, 'react-ts');
    case 'vue':
      return bootstrapVite(opts.dir, 'vue-ts');
    default:
      throw new Error(`Unknown frontend stack: ${opts.stack as string}`);
  }
}

export async function bootstrapMcp(opts: BootstrapMcpOptions): Promise<void> {
  switch (opts.language) {
    case 'node-ts':
      return bootstrapMcpNode(opts.dir, opts.projectName);
    case 'python':
      return bootstrapMcpPython(opts.dir);
    default:
      throw new Error(`Unknown MCP language: ${opts.language as string}`);
  }
}

// ─── Per-stack scaffolds ────────────────────────────────────────────────────

async function bootstrapPhpLaravel(dir: string, projectName: string): Promise<void> {
  await ensureCommand(
    'composer',
    'Install Composer: https://getcomposer.org/download/',
  );
  banner(`Bootstrapping Laravel 11 in ${dir}`);

  await runCmd(
    'composer',
    [
      'create-project',
      'laravel/laravel:^11',
      '.',
      '--no-interaction',
      '--prefer-dist',
    ],
    dir,
  );

  await runCmd(
    'composer',
    ['require', 'laravel/sanctum', 'tymon/jwt-auth', '--no-interaction'],
    dir,
  );

  await runCmd(
    'composer',
    [
      'require',
      '--dev',
      'laravel/pint',
      'larastan/larastan',
      '--no-interaction',
    ],
    dir,
  );

  // Best-effort: rename app to projectName in composer.json
  await tryRenameComposerProject(dir, projectName);
}

async function bootstrapNodeNestjs(dir: string, projectName: string): Promise<void> {
  await ensureCommand('npx', 'Install Node.js (includes npx): https://nodejs.org/');
  banner(`Bootstrapping NestJS in ${dir}`);

  await runCmd(
    'npx',
    [
      '-y',
      '@nestjs/cli@latest',
      'new',
      '.',
      '--skip-git',
      '--strict',
      '--package-manager',
      'npm',
      '--directory',
      '.',
    ],
    dir,
  );

  await tryRenameNpmProject(dir, projectName);
}

async function bootstrapPythonFastapi(dir: string): Promise<void> {
  await ensureCommand(
    'python',
    'Install Python 3.11+ from https://www.python.org/downloads/',
  );
  banner(`Bootstrapping FastAPI in ${dir}`);

  // Create virtualenv
  await runCmd('python', ['-m', 'venv', '.venv'], dir);

  // Write a starter requirements.txt + main.py if not present (since FastAPI
  // has no official scaffold). The DARE template copy will overwrite later
  // only if we left placeholders here.
  const reqPath = path.join(dir, 'requirements.txt');
  if (!(await fs.pathExists(reqPath))) {
    await fs.writeFile(
      reqPath,
      [
        'fastapi>=0.115',
        'uvicorn[standard]>=0.30',
        'pydantic-settings>=2.4',
        'sqlalchemy>=2.0',
        'alembic>=1.13',
        'asyncpg>=0.29',
        'python-jose[cryptography]>=3.3',
        'passlib[bcrypt]>=1.7',
        'pytest>=8.0',
        'pytest-asyncio>=0.23',
        'ruff>=0.6',
        '',
      ].join('\n'),
    );
  }

  // pip install
  const pip = path.join(
    dir,
    '.venv',
    process.platform === 'win32' ? 'Scripts\\pip.exe' : 'bin/pip',
  );
  await runCmd(pip, ['install', '--upgrade', 'pip'], dir);
  await runCmd(pip, ['install', '-r', 'requirements.txt'], dir);
}

async function bootstrapRustAxum(dir: string, projectName: string): Promise<void> {
  await ensureCommand(
    'cargo',
    'Install Rust toolchain: https://www.rust-lang.org/tools/install',
  );
  banner(`Bootstrapping Rust + Axum in ${dir}`);

  await runCmd(
    'cargo',
    ['init', '--name', sanitizeCrateName(projectName)],
    dir,
  );

  // Replace generated Cargo.toml with axum-ready dependencies.
  const cargoToml = path.join(dir, 'Cargo.toml');
  await fs.writeFile(
    cargoToml,
    [
      `[package]`,
      `name = "${sanitizeCrateName(projectName)}"`,
      `version = "0.1.0"`,
      `edition = "2021"`,
      ``,
      `[dependencies]`,
      `axum = "0.7"`,
      `tokio = { version = "1.40", features = ["full"] }`,
      `tower = "0.5"`,
      `tower-http = { version = "0.6", features = ["cors", "trace"] }`,
      `serde = { version = "1.0", features = ["derive"] }`,
      `serde_json = "1.0"`,
      `tracing = "0.1"`,
      `tracing-subscriber = { version = "0.3", features = ["env-filter"] }`,
      `thiserror = "1.0"`,
      `anyhow = "1.0"`,
      `uuid = { version = "1.10", features = ["v4", "serde"] }`,
      `sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "uuid", "chrono"] }`,
      ``,
      `[dev-dependencies]`,
      `tokio = { version = "1.40", features = ["macros", "rt-multi-thread"] }`,
      ``,
    ].join('\n'),
  );

  // Pre-fetch dependencies so first build is faster.
  await runCmd('cargo', ['fetch'], dir);
}

async function bootstrapGoGin(dir: string, projectName: string): Promise<void> {
  await ensureCommand('go', 'Install Go 1.22+: https://go.dev/dl/');
  banner(`Bootstrapping Go + Gin in ${dir}`);

  const moduleName = sanitizeGoModule(projectName);

  // 1) Initialize module
  await runCmd('go', ['mod', 'init', moduleName], dir);

  // 2) Add core deps
  await runCmd('go', ['get', 'github.com/gin-gonic/gin@latest'], dir);
  await runCmd('go', ['get', 'github.com/joho/godotenv@latest'], dir);

  // 3) Lay down a working starter so go build / go test / go vet have
  //    something to compile against. Without this, `go vet ./...` would
  //    succeed trivially with zero packages and the Ralph Loop would be
  //    a no-op until the agent writes code.
  await fs.ensureDir(path.join(dir, 'cmd', 'api'));
  await fs.ensureDir(path.join(dir, 'internal', 'handlers'));
  await fs.ensureDir(path.join(dir, 'internal', 'middleware'));

  await fs.writeFile(
    path.join(dir, 'cmd', 'api', 'main.go'),
    `package main

import (
\t"log"
\t"os"

\t"github.com/gin-gonic/gin"
\t"${moduleName}/internal/handlers"
)

func main() {
\tr := gin.Default()

\tr.GET("/healthz", handlers.Health)

\tv1 := r.Group("/api/v1")
\t{
\t\tv1.GET("/", func(c *gin.Context) {
\t\t\tc.JSON(200, gin.H{"message": "API v1"})
\t\t})
\t}

\tport := os.Getenv("PORT")
\tif port == "" {
\t\tport = "8080"
\t}
\tif err := r.Run(":" + port); err != nil {
\t\tlog.Fatal(err)
\t}
}
`,
  );

  await fs.writeFile(
    path.join(dir, 'internal', 'handlers', 'health.go'),
    `package handlers

import (
\t"net/http"

\t"github.com/gin-gonic/gin"
)

// Health returns 200 with a small status payload.
func Health(c *gin.Context) {
\tc.JSON(http.StatusOK, gin.H{"status": "ok"})
}
`,
  );

  await fs.writeFile(
    path.join(dir, 'internal', 'handlers', 'health_test.go'),
    `package handlers

import (
\t"net/http"
\t"net/http/httptest"
\t"testing"

\t"github.com/gin-gonic/gin"
)

func TestHealth(t *testing.T) {
\tgin.SetMode(gin.TestMode)
\tr := gin.New()
\tr.GET("/healthz", Health)

\treq := httptest.NewRequest(http.MethodGet, "/healthz", nil)
\trec := httptest.NewRecorder()
\tr.ServeHTTP(rec, req)

\tif rec.Code != http.StatusOK {
\t\tt.Fatalf("expected 200, got %d", rec.Code)
\t}
}
`,
  );

  // 4) Tidy go.mod and resolve transitive deps
  await runCmd('go', ['mod', 'tidy'], dir);
}

async function bootstrapVite(dir: string, template: 'react-ts' | 'vue-ts'): Promise<void> {
  await ensureCommand('npm', 'Install Node.js: https://nodejs.org/');
  banner(`Bootstrapping Vite (${template}) in ${dir}`);

  // `npm create vite@latest . -- --template react-ts` requires the directory
  // to be empty. We're being called from `dare init`, which created an empty
  // directory, so this is fine.
  await runCmd(
    'npm',
    ['create', 'vite@latest', '.', '--', '--template', template],
    dir,
  );

  await runCmd('npm', ['install'], dir);
}

async function bootstrapMcpNode(dir: string, projectName: string): Promise<void> {
  await ensureCommand('npm', 'Install Node.js: https://nodejs.org/');
  banner(`Bootstrapping MCP server (TypeScript) in ${dir}`);

  await runCmd('npm', ['init', '-y'], dir);
  await runCmd(
    'npm',
    ['install', '@modelcontextprotocol/sdk'],
    dir,
  );
  await runCmd(
    'npm',
    ['install', '--save-dev', 'typescript', '@types/node', 'tsx', 'vitest'],
    dir,
  );

  await tryRenameNpmProject(dir, projectName);
}

async function bootstrapMcpPython(dir: string): Promise<void> {
  await ensureCommand('python', 'Install Python 3.11+: https://www.python.org/downloads/');
  banner(`Bootstrapping MCP server (Python) in ${dir}`);

  await runCmd('python', ['-m', 'venv', '.venv'], dir);
  const pip = path.join(
    dir,
    '.venv',
    process.platform === 'win32' ? 'Scripts\\pip.exe' : 'bin/pip',
  );
  await runCmd(pip, ['install', '--upgrade', 'pip'], dir);
  await runCmd(pip, ['install', 'mcp[cli]', 'pytest', 'ruff'], dir);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function banner(msg: string): void {
  console.log(chalk.blue.bold(`\n📦 ${msg}\n`));
}

async function ensureCommand(cmd: string, hint: string): Promise<void> {
  const exists = await hasCommand(cmd);
  if (!exists) {
    throw new Error(
      `Required tool not found on PATH: ${cmd}\n  ${hint}\n` +
        `dare init requires a working ${cmd} to scaffold the chosen stack.`,
    );
  }
}

async function hasCommand(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = spawn(cmd, ['--version'], { shell: true, stdio: 'ignore' });
    probe.on('error', () => resolve(false));
    probe.on('close', (code) => resolve(code === 0));
  });
}

async function runCmd(cmd: string, args: string[], cwd: string): Promise<void> {
  console.log(chalk.gray(`  $ ${cmd} ${args.join(' ')}`));
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function sanitizeCrateName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'app';
}

function sanitizeGoModule(name: string): string {
  // Go module path: lowercase, hyphens allowed, no spaces or symbols.
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
}

async function tryRenameComposerProject(dir: string, projectName: string): Promise<void> {
  const cj = path.join(dir, 'composer.json');
  if (!(await fs.pathExists(cj))) return;
  try {
    const data = await fs.readJson(cj);
    data.name = `dare/${projectName.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;
    await fs.writeJson(cj, data, { spaces: 4 });
  } catch {
    // non-critical
  }
}

async function tryRenameNpmProject(dir: string, projectName: string): Promise<void> {
  const pj = path.join(dir, 'package.json');
  if (!(await fs.pathExists(pj))) return;
  try {
    const data = await fs.readJson(pj);
    data.name = projectName.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    await fs.writeJson(pj, data, { spaces: 2 });
  } catch {
    // non-critical
  }
}
