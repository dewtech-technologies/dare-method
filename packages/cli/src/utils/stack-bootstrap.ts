/**
 * Stack bootstrap — runs the official scaffold for the chosen backend /
 * frontend / MCP stack. Called by `dare init` BEFORE the DARE artifacts are
 * copied on top.
 *
 * Toolchain resolution order:
 *   1. Native CLI on PATH (composer, npm, cargo, python, go) — fastest path
 *   2. Docker fallback using the official image — works when the user has
 *      only Docker installed (no PHP / Go / Rust / Python toolchain)
 *   3. Hard error with both install hints — never falls back to a fake
 *      template, since fake templates were the v1.x bug we're fixing
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

// ─── Toolchain abstraction ──────────────────────────────────────────────────

type ToolMode = 'native' | 'docker';

/**
 * Resolves a toolchain (native vs Docker) and runs commands through it.
 * Created via the static factories below — one per language ecosystem.
 */
class StackTool {
  private constructor(
    private readonly nativeCmd: string,
    private readonly mode: ToolMode,
    private readonly dir: string,
    /** Docker image to use when `mode === 'docker'`. */
    private readonly image: string | null,
    /**
     * Some Docker images (e.g. `composer:latest`) declare the tool as their
     * ENTRYPOINT, so we only pass arguments. Others (e.g. `node:20`) are
     * shell-based — we prepend the tool name to the args.
     */
    private readonly imageHasEntrypoint: boolean,
  ) {}

  static async resolve(opts: {
    nativeCmd: string;
    nativeHint: string;
    dockerImage: string;
    imageHasEntrypoint?: boolean;
    dir: string;
  }): Promise<StackTool> {
    const dir = path.resolve(opts.dir);

    if (await hasCommand(opts.nativeCmd)) {
      return new StackTool(opts.nativeCmd, 'native', dir, null, false);
    }

    if (await hasCommand('docker')) {
      console.log(
        chalk.yellow(
          `⚠  ${opts.nativeCmd} not found on PATH — falling back to Docker (${opts.dockerImage}).`,
        ),
      );
      return new StackTool(
        opts.nativeCmd,
        'docker',
        dir,
        opts.dockerImage,
        opts.imageHasEntrypoint ?? false,
      );
    }

    throw new Error(
      `Required tool not found: ${opts.nativeCmd}\n` +
        `  ${opts.nativeHint}\n` +
        `  …or install Docker (https://www.docker.com/products/docker-desktop/) — DARE will use the\n` +
        `  ${opts.dockerImage} image automatically.`,
    );
  }

  get usingDocker(): boolean {
    return this.mode === 'docker';
  }

  /**
   * Run the tool with the given arguments. Native mode invokes the CLI
   * directly; Docker mode runs `docker run --rm -v <dir>:/app -w /app`.
   */
  async run(args: string[]): Promise<void> {
    if (this.mode === 'native') {
      await runCmd(this.nativeCmd, args, this.dir);
      return;
    }

    const dockerArgs = this.buildDockerArgs(args);
    await runCmd('docker', dockerArgs, this.dir);
  }

  /**
   * For tools that ship in the official image but with a different entrypoint
   * (e.g. running `pip` from inside `python:3.12-slim`).
   */
  async runOther(otherCmd: string, args: string[]): Promise<void> {
    if (this.mode === 'native') {
      await runCmd(otherCmd, args, this.dir);
      return;
    }
    const dockerArgs = [
      'run',
      '--rm',
      '-v',
      `${dockerizePath(this.dir)}:/app`,
      '-w',
      '/app',
      ...currentUserFlags(),
      this.image!,
      otherCmd,
      ...args,
    ];
    await runCmd('docker', dockerArgs, this.dir);
  }

  private buildDockerArgs(args: string[]): string[] {
    const base = [
      'run',
      '--rm',
      '-v',
      `${dockerizePath(this.dir)}:/app`,
      '-w',
      '/app',
      ...currentUserFlags(),
      this.image!,
    ];
    return this.imageHasEntrypoint ? [...base, ...args] : [...base, this.nativeCmd, ...args];
  }
}

// ─── Per-stack scaffolds ────────────────────────────────────────────────────

async function bootstrapPhpLaravel(dir: string, projectName: string): Promise<void> {
  banner(`Bootstrapping Laravel 11 in ${dir}`);

  const composer = await StackTool.resolve({
    nativeCmd: 'composer',
    nativeHint: 'Install Composer: https://getcomposer.org/download/',
    dockerImage: 'composer:latest',
    imageHasEntrypoint: true,
    dir,
  });

  await composer.run(['create-project', 'laravel/laravel:^11', '.', '--no-interaction', '--prefer-dist']);
  await composer.run(['require', 'laravel/sanctum', 'tymon/jwt-auth', '--no-interaction']);
  await composer.run(['require', '--dev', 'laravel/pint', 'larastan/larastan', '--no-interaction']);

  await tryRenameComposerProject(dir, projectName);
}

async function bootstrapNodeNestjs(dir: string, projectName: string): Promise<void> {
  banner(`Bootstrapping NestJS in ${dir}`);

  const npx = await StackTool.resolve({
    nativeCmd: 'npx',
    nativeHint: 'Install Node.js (includes npx): https://nodejs.org/',
    dockerImage: 'node:20-alpine',
    imageHasEntrypoint: false,
    dir,
  });

  await npx.run([
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
  ]);

  await tryRenameNpmProject(dir, projectName);
}

async function bootstrapPythonFastapi(dir: string): Promise<void> {
  banner(`Bootstrapping FastAPI in ${dir}`);

  const python = await StackTool.resolve({
    nativeCmd: 'python',
    nativeHint: 'Install Python 3.11+: https://www.python.org/downloads/',
    dockerImage: 'python:3.12-slim',
    imageHasEntrypoint: false,
    dir,
  });

  // Even in Docker mode, we keep .venv in the project folder so it survives
  // across runs and the agent can read it from the host.
  await python.run(['-m', 'venv', '.venv']);

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

  // Install via the venv's pip — works the same in native or Docker mode
  // because the venv lives inside `dir` (and thus inside the volume).
  const pipBin =
    process.platform === 'win32' && !python.usingDocker
      ? path.join('.venv', 'Scripts', 'pip.exe')
      : path.join('.venv', 'bin', 'pip');

  await python.runOther(pipBin, ['install', '--upgrade', 'pip']);
  await python.runOther(pipBin, ['install', '-r', 'requirements.txt']);
}

async function bootstrapRustAxum(dir: string, projectName: string): Promise<void> {
  banner(`Bootstrapping Rust + Axum in ${dir}`);

  const cargo = await StackTool.resolve({
    nativeCmd: 'cargo',
    nativeHint: 'Install Rust toolchain: https://www.rust-lang.org/tools/install',
    dockerImage: 'rust:1.83',
    imageHasEntrypoint: false,
    dir,
  });

  await cargo.run(['init', '--name', sanitizeCrateName(projectName)]);

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

  await cargo.run(['fetch']);
}

async function bootstrapGoGin(dir: string, projectName: string): Promise<void> {
  banner(`Bootstrapping Go + Gin in ${dir}`);

  const go = await StackTool.resolve({
    nativeCmd: 'go',
    nativeHint: 'Install Go 1.22+: https://go.dev/dl/',
    dockerImage: 'golang:1.22',
    imageHasEntrypoint: false,
    dir,
  });

  const moduleName = sanitizeGoModule(projectName);

  await go.run(['mod', 'init', moduleName]);
  await go.run(['get', 'github.com/gin-gonic/gin@latest']);
  await go.run(['get', 'github.com/joho/godotenv@latest']);

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

  await go.run(['mod', 'tidy']);
}

async function bootstrapVite(dir: string, template: 'react-ts' | 'vue-ts'): Promise<void> {
  banner(`Bootstrapping Vite (${template}) in ${dir}`);

  const npm = await StackTool.resolve({
    nativeCmd: 'npm',
    nativeHint: 'Install Node.js: https://nodejs.org/',
    dockerImage: 'node:20-alpine',
    imageHasEntrypoint: false,
    dir,
  });

  await npm.run(['create', 'vite@latest', '.', '--', '--template', template]);
  await npm.run(['install']);
}

async function bootstrapMcpNode(dir: string, projectName: string): Promise<void> {
  banner(`Bootstrapping MCP server (TypeScript) in ${dir}`);

  const npm = await StackTool.resolve({
    nativeCmd: 'npm',
    nativeHint: 'Install Node.js: https://nodejs.org/',
    dockerImage: 'node:20-alpine',
    imageHasEntrypoint: false,
    dir,
  });

  await npm.run(['init', '-y']);
  await npm.run(['install', '@modelcontextprotocol/sdk']);
  await npm.run(['install', '--save-dev', 'typescript', '@types/node', 'tsx', 'vitest']);

  await tryRenameNpmProject(dir, projectName);
}

async function bootstrapMcpPython(dir: string): Promise<void> {
  banner(`Bootstrapping MCP server (Python) in ${dir}`);

  const python = await StackTool.resolve({
    nativeCmd: 'python',
    nativeHint: 'Install Python 3.11+: https://www.python.org/downloads/',
    dockerImage: 'python:3.12-slim',
    imageHasEntrypoint: false,
    dir,
  });

  await python.run(['-m', 'venv', '.venv']);
  const pipBin =
    process.platform === 'win32' && !python.usingDocker
      ? path.join('.venv', 'Scripts', 'pip.exe')
      : path.join('.venv', 'bin', 'pip');

  await python.runOther(pipBin, ['install', '--upgrade', 'pip']);
  await python.runOther(pipBin, ['install', 'mcp[cli]', 'pytest', 'ruff']);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function banner(msg: string): void {
  console.log(chalk.blue.bold(`\n📦 ${msg}\n`));
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

/**
 * On Linux/macOS, run the Docker container as the host user so files written
 * to the bind mount don't end up owned by root. On Windows / Docker Desktop
 * this is unnecessary (and `id` doesn't exist), so we skip.
 */
function currentUserFlags(): string[] {
  if (process.platform === 'win32') return [];
  // Best-effort: read uid/gid from process. If unavailable, fall back to the
  // image's default user.
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (typeof uid === 'number' && typeof gid === 'number') {
    return ['--user', `${uid}:${gid}`];
  }
  return [];
}

/**
 * Convert a Windows path (`C:\foo\bar`) to a form Docker Desktop accepts as
 * a bind-mount source. Modern Docker Desktop accepts native Windows paths
 * unmodified, but some configurations require POSIX form.
 */
function dockerizePath(p: string): string {
  if (process.platform !== 'win32') return p;
  // Normalize backslashes; Docker Desktop accepts forward slashes here.
  return p.replace(/\\/g, '/');
}

function sanitizeCrateName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'app';
}

function sanitizeGoModule(name: string): string {
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
