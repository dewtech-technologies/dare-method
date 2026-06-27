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
  | 'ruby-rails-8'
  | 'php-laravel'
  | 'node-nestjs'
  | 'python-fastapi'
  | 'rust-axum'
  | 'go-gin'
  | 'go-stdlib';

export type FrontendStack = 'react' | 'vue' | 'rust-leptos' | 'rust-leptos-csr';

export type McpLanguage = 'node-ts' | 'python' | 'rust' | 'go';

/**
 * How to satisfy each stack's toolchain dependency:
 *   - `native`: require the CLI on PATH (composer / npm / cargo / python / go).
 *               If missing, fail with a clear error — do not fall back.
 *   - `docker`: always run via the official Docker image, even if the native
 *               CLI is available. Useful when you want a hermetic, reproducible
 *               toolchain regardless of host setup.
 *   - `auto`  : prefer native if present; otherwise fall back to Docker.
 *               Default behavior since v2.6.0.
 */
export type ToolchainMode = 'native' | 'docker' | 'auto';

export interface BootstrapBackendOptions {
  stack: BackendStack;
  dir: string;
  projectName: string;
  toolchain?: ToolchainMode;
  /** When true the crate lives inside a Cargo workspace — use --vcs none on cargo init. */
  isMonorepo?: boolean;
  /**
   * When true, scaffold a full server-rendered MVC app (views + asset pipeline)
   * instead of API-only. Set for the 'mvc' project structure. Honored by stacks
   * that support both shapes (ruby-rails-8); ignored by the rest.
   */
  fullstack?: boolean;
}

export interface BootstrapFrontendOptions {
  stack: FrontendStack;
  dir: string;
  projectName: string;
  toolchain?: ToolchainMode;
  /** When true the frontend crate lives inside a Cargo workspace whose root
   *  already has a .cargo/config.toml — skip writing one inside the crate dir. */
  isMonorepo?: boolean;
}

export interface BootstrapMcpOptions {
  language: McpLanguage;
  dir: string;
  projectName: string;
  toolchain?: ToolchainMode;
  transport?: 'stdio' | 'sse' | 'http';
}

const MCP_LANGUAGE_TO_STACK: Record<McpLanguage, string> = {
  'node-ts': 'mcp-node-ts',
  python: 'mcp-python',
  rust: 'mcp-rust',
  go: 'mcp-go',
};

// ─── Public API ─────────────────────────────────────────────────────────────

export async function bootstrapBackend(opts: BootstrapBackendOptions): Promise<void> {
  const mode = opts.toolchain ?? 'auto';
  // v3.1: all backend stack ids match registry StackId 1:1, so route every
  // one through the internalized scaffolder. The old official-tool bootstrap
  // functions (bootstrapNodeNestjs/npx, bootstrapPhpLaravel/composer, …) are
  // retained only as historical reference and no longer reached from init.
  // Rails is special: instead of hand-templating the framework runtime, run the
  // real `rails new` (native or Docker) and overlay DARE's value-add on top.
  // This keeps the app complete and current with every Rails release.
  if (opts.stack === 'ruby-rails-8') {
    return bootstrapRubyRails(opts.dir, opts.projectName, mode, opts.fullstack ?? false);
  }

  const BACKEND_IDS = new Set([
    'php-laravel',
    'node-nestjs',
    'python-fastapi',
    'rust-axum',
    'go-gin',
    'go-stdlib',
  ]);
  if (BACKEND_IDS.has(opts.stack)) {
    return bootstrapViaRegistry(
      opts.stack,
      opts.dir,
      opts.projectName,
      opts.isMonorepo ?? false,
      mode,
      undefined,
      opts.fullstack ?? false,
    );
  }
  switch (opts.stack) {
    default:
      throw new Error(`Unknown backend stack: ${opts.stack as string}`);
  }
}

export async function bootstrapFrontend(opts: BootstrapFrontendOptions): Promise<void> {
  const mode = opts.toolchain ?? 'auto';
  switch (opts.stack) {
    case 'react':
      await bootstrapVite(opts.dir, 'react-ts', mode);
      await tryRenameNpmProject(opts.dir, opts.projectName);
      break;
    case 'vue':
      await bootstrapVite(opts.dir, 'vue-ts', mode);
      await tryRenameNpmProject(opts.dir, opts.projectName);
      break;
    case 'rust-leptos':
      await bootstrapLeptosFullstack(opts.dir, opts.projectName, mode, opts.isMonorepo ?? false);
      break;
    case 'rust-leptos-csr':
      await bootstrapLeptosCsr(opts.dir, opts.projectName, mode, opts.isMonorepo ?? false);
      break;
    default:
      throw new Error(`Unknown frontend stack: ${opts.stack as string}`);
  }
}

export async function bootstrapMcp(opts: BootstrapMcpOptions): Promise<void> {
  const mode = opts.toolchain ?? 'auto';
  const stackId = MCP_LANGUAGE_TO_STACK[opts.language];
  if (stackId) {
    return bootstrapViaRegistry(
      stackId,
      opts.dir,
      opts.projectName,
      false,
      mode,
      opts.transport ?? 'stdio',
    );
  }
  switch (opts.language) {
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
    mode?: ToolchainMode;
  }): Promise<StackTool> {
    const dir = path.resolve(opts.dir);
    const mode: ToolchainMode = opts.mode ?? 'auto';

    // Forced Docker
    if (mode === 'docker') {
      if (!(await hasCommand('docker'))) {
        throw new Error(
          `--toolchain=docker selected, but \`docker\` is not on PATH.\n` +
            `  Install Docker Desktop: https://www.docker.com/products/docker-desktop/`,
        );
      }
      console.log(chalk.cyan(`🐳 Using Docker (${opts.dockerImage}) — toolchain=docker`));
      return new StackTool(
        opts.nativeCmd,
        'docker',
        dir,
        opts.dockerImage,
        opts.imageHasEntrypoint ?? false,
      );
    }

    // Forced native
    if (mode === 'native') {
      if (!(await hasCommand(opts.nativeCmd))) {
        throw new Error(
          `--toolchain=native selected, but \`${opts.nativeCmd}\` is not on PATH.\n` +
            `  ${opts.nativeHint}`,
        );
      }
      console.log(chalk.green(`🔧 Using native ${opts.nativeCmd} — toolchain=native`));
      return new StackTool(opts.nativeCmd, 'native', dir, null, false);
    }

    // Auto: prefer native, fall back to Docker
    if (await hasCommand(opts.nativeCmd)) {
      console.log(chalk.green(`🔧 Using native ${opts.nativeCmd} — toolchain=auto`));
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

async function bootstrapPhpLaravel(
  dir: string,
  projectName: string,
  mode: ToolchainMode,
): Promise<void> {
  banner(`Bootstrapping Laravel 11 in ${dir}`);

  const composer = await StackTool.resolve({
    nativeCmd: 'composer',
    nativeHint: 'Install Composer: https://getcomposer.org/download/',
    dockerImage: 'composer:latest',
    imageHasEntrypoint: true,
    dir,
    mode,
  });

  await composer.run(['create-project', 'laravel/laravel:^11', '.', '--no-interaction', '--prefer-dist']);
  await composer.run(['require', 'laravel/sanctum', 'tymon/jwt-auth', '--no-interaction']);
  await composer.run(['require', '--dev', 'laravel/pint', 'larastan/larastan', '--no-interaction']);

  await tryRenameComposerProject(dir, projectName);
}

async function bootstrapNodeNestjs(
  dir: string,
  projectName: string,
  mode: ToolchainMode,
): Promise<void> {
  banner(`Bootstrapping NestJS in ${dir}`);

  const npx = await StackTool.resolve({
    nativeCmd: 'npx',
    nativeHint: 'Install Node.js (includes npx): https://nodejs.org/',
    dockerImage: 'node:20-alpine',
    imageHasEntrypoint: false,
    dir,
    mode,
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

async function bootstrapPythonFastapi(dir: string, mode: ToolchainMode): Promise<void> {
  banner(`Bootstrapping FastAPI in ${dir}`);

  const python = await StackTool.resolve({
    nativeCmd: 'python',
    nativeHint: 'Install Python 3.11+: https://www.python.org/downloads/',
    dockerImage: 'python:3.12-slim',
    imageHasEntrypoint: false,
    dir,
    mode,
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

  // Use the venv's `python -m pip` instead of `pip.exe` directly. On Windows,
  // pip cannot replace its own running executable when upgrading itself —
  // pip itself prints "To modify pip, please run python -m pip install
  // --upgrade pip". So we always go through `python -m pip`, which works on
  // Windows, macOS, and Linux without special-casing.
  const venvPython =
    process.platform === 'win32' && !python.usingDocker
      ? path.join('.venv', 'Scripts', 'python.exe')
      : path.join('.venv', 'bin', 'python');

  await python.runOther(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  await python.runOther(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt']);
}

async function bootstrapRustAxum(
  dir: string,
  projectName: string,
  mode: ToolchainMode,
  isMonorepo: boolean = false,
): Promise<void> {
  banner(`Bootstrapping Rust + Axum in ${dir}`);

  const cargo = await StackTool.resolve({
    nativeCmd: 'cargo',
    nativeHint: 'Install Rust toolchain: https://www.rust-lang.org/tools/install',
    dockerImage: 'rust:1.83',
    imageHasEntrypoint: false,
    dir,
    mode,
  });

  // --vcs none when inside a workspace — the workspace root owns the .git
  const vcsArgs = isMonorepo ? ['--vcs', 'none'] : [];
  await cargo.run(['init', '--name', sanitizeCrateName(projectName), ...vcsArgs]);

  // cargo init creates Cargo.lock for binary crates even with --vcs none.
  // Workspace members must NOT have their own Cargo.lock — only the workspace root does.
  if (isMonorepo) {
    const lockFile = path.join(dir, 'Cargo.lock');
    if (await fs.pathExists(lockFile)) await fs.remove(lockFile);
  }

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
  if (isMonorepo) {
    const lockFile = path.join(dir, 'Cargo.lock');
    if (await fs.pathExists(lockFile)) await fs.remove(lockFile);
  }
}

async function bootstrapGoGin(
  dir: string,
  projectName: string,
  mode: ToolchainMode,
): Promise<void> {
  banner(`Bootstrapping Go + Gin in ${dir}`);

  const go = await StackTool.resolve({
    nativeCmd: 'go',
    nativeHint: 'Install Go 1.25+: https://go.dev/dl/',
    dockerImage: 'golang:1.25',
    imageHasEntrypoint: false,
    dir,
    mode,
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

async function bootstrapGoStdlib(
  dir: string,
  projectName: string,
  mode: ToolchainMode,
): Promise<void> {
  banner(`Bootstrapping Go (stdlib only, no framework) in ${dir}`);

  const go = await StackTool.resolve({
    nativeCmd: 'go',
    nativeHint: 'Install Go 1.22+: https://go.dev/dl/',
    // Go 1.22+ is the minimum that supports the new ServeMux pattern syntax
    // (`mux.HandleFunc("GET /path/{id}", h)`). Anything below that defeats
    // the whole point of going stdlib-only.
    dockerImage: 'golang:1.25',
    imageHasEntrypoint: false,
    dir,
    mode,
  });

  const moduleName = sanitizeGoModule(projectName);

  await go.run(['mod', 'init', moduleName]);
  // Intentionally NO `go get` for any framework — this is the stdlib-only
  // path. The starter only uses `net/http`, `encoding/json`, `log/slog`,
  // `net/http/httptest` (test), all bundled with Go.

  await fs.ensureDir(path.join(dir, 'cmd', 'api'));
  await fs.ensureDir(path.join(dir, 'internal', 'handlers'));
  await fs.ensureDir(path.join(dir, 'internal', 'middleware'));

  // cmd/api/main.go — http.NewServeMux with the Go 1.22+ pattern syntax,
  // wired through a logging + recover middleware chain.
  await fs.writeFile(
    path.join(dir, 'cmd', 'api', 'main.go'),
    `package main

import (
\t"log"
\t"log/slog"
\t"net/http"
\t"os"

\t"${moduleName}/internal/handlers"
\t"${moduleName}/internal/middleware"
)

func main() {
\tlogger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
\tslog.SetDefault(logger)

\tmux := http.NewServeMux()

\tmux.HandleFunc("GET /healthz", handlers.Health)

\t// Example resource — replace with real routes per BLUEPRINT.md.
\tmux.HandleFunc("GET /api/v1/", handlers.RootV1)

\thandler := middleware.Recover(middleware.Logger(mux))

\tport := os.Getenv("PORT")
\tif port == "" {
\t\tport = "8080"
\t}
\tslog.Info("server starting", "addr", ":"+port)
\tif err := http.ListenAndServe(":"+port, handler); err != nil {
\t\tlog.Fatal(err)
\t}
}
`,
  );

  // internal/handlers/health.go
  await fs.writeFile(
    path.join(dir, 'internal', 'handlers', 'health.go'),
    `package handlers

import (
\t"encoding/json"
\t"net/http"
)

// Health returns 200 with a small JSON status payload.
func Health(w http.ResponseWriter, r *http.Request) {
\twriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// RootV1 is a placeholder for the v1 root handler — replace per BLUEPRINT.
func RootV1(w http.ResponseWriter, r *http.Request) {
\twriteJSON(w, http.StatusOK, map[string]string{"message": "API v1"})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
\tw.Header().Set("Content-Type", "application/json")
\tw.WriteHeader(status)
\t_ = json.NewEncoder(w).Encode(body)
}
`,
  );

  // internal/handlers/health_test.go — uses net/http/httptest from stdlib.
  await fs.writeFile(
    path.join(dir, 'internal', 'handlers', 'health_test.go'),
    `package handlers

import (
\t"encoding/json"
\t"net/http"
\t"net/http/httptest"
\t"testing"
)

func TestHealth(t *testing.T) {
\treq := httptest.NewRequest(http.MethodGet, "/healthz", nil)
\trec := httptest.NewRecorder()

\tHealth(rec, req)

\tif rec.Code != http.StatusOK {
\t\tt.Fatalf("expected 200, got %d", rec.Code)
\t}

\tvar body map[string]string
\tif err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
\t\tt.Fatalf("invalid JSON: %v", err)
\t}
\tif body["status"] != "ok" {
\t\tt.Fatalf("expected status=ok, got %q", body["status"])
\t}
}
`,
  );

  // internal/middleware/logger.go
  await fs.writeFile(
    path.join(dir, 'internal', 'middleware', 'logger.go'),
    `package middleware

import (
\t"log/slog"
\t"net/http"
\t"time"
)

// Logger emits a structured log line per request: method, path, status, duration.
func Logger(next http.Handler) http.Handler {
\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
\t\tstart := time.Now()
\t\tsr := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
\t\tnext.ServeHTTP(sr, r)
\t\tslog.Info("http",
\t\t\t"method", r.Method,
\t\t\t"path", r.URL.Path,
\t\t\t"status", sr.status,
\t\t\t"duration_ms", time.Since(start).Milliseconds(),
\t\t)
\t})
}

type statusRecorder struct {
\thttp.ResponseWriter
\tstatus int
}

func (s *statusRecorder) WriteHeader(code int) {
\ts.status = code
\ts.ResponseWriter.WriteHeader(code)
}
`,
  );

  // internal/middleware/recover.go
  await fs.writeFile(
    path.join(dir, 'internal', 'middleware', 'recover.go'),
    `package middleware

import (
\t"log/slog"
\t"net/http"
)

// Recover intercepts panics in handlers and turns them into 500 responses
// instead of letting the goroutine crash the server.
func Recover(next http.Handler) http.Handler {
\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
\t\tdefer func() {
\t\t\tif rec := recover(); rec != nil {
\t\t\t\tslog.Error("panic recovered", "value", rec, "path", r.URL.Path)
\t\t\t\thttp.Error(w, "internal server error", http.StatusInternalServerError)
\t\t\t}
\t\t}()
\t\tnext.ServeHTTP(w, r)
\t})
}
`,
  );

  await go.run(['mod', 'tidy']);
}

async function bootstrapLeptosFullstack(
  dir: string,
  projectName: string,
  mode: ToolchainMode,
  isMonorepo: boolean,
): Promise<void> {
  banner(`Bootstrapping Leptos fullstack (SSR + WASM) in ${dir}`);

  const cargo = await StackTool.resolve({
    nativeCmd: 'cargo',
    nativeHint: [
      'Install Rust toolchain: https://www.rust-lang.org/tools/install',
      'Then: rustup target add wasm32-unknown-unknown',
      '      cargo install cargo-leptos --locked --version 0.2.22',
    ].join('\n  '),
    dockerImage: 'ghcr.io/dewtech-technologies/dare-rust-leptos:1',
    imageHasEntrypoint: false,
    dir,
    mode,
  });

  const crateName = sanitizeCrateName(projectName);
  const crateIdent = crateName.replace(/-/g, '_');

  await fs.ensureDir(path.join(dir, 'src'));
  await fs.ensureDir(path.join(dir, 'style'));
  await fs.ensureDir(path.join(dir, 'public'));
  await fs.ensureDir(path.join(dir, '.cargo'));

  // Cargo.toml — pinned to Leptos 0.7 (0.6 → 0.7 broke server function API)
  await fs.writeFile(
    path.join(dir, 'Cargo.toml'),
    [
      `[package]`,
      `name = "${crateName}"`,
      `version = "0.1.0"`,
      `edition = "2021"`,
      ``,
      `[lib]`,
      `crate-type = ["cdylib", "rlib"]`,
      ``,
      `[dependencies]`,
      `axum = { version = "0.7", optional = true }`,
      `console_error_panic_hook = "0.1"`,
      `leptos = { version = "0.7", features = [] }`,
      `leptos_axum = { version = "0.7", optional = true }`,
      `leptos_meta = { version = "0.7" }`,
      `leptos_router = { version = "0.7", features = [] }`,
      `tokio = { version = "1", features = ["full"], optional = true }`,
      `tower = { version = "0.5", optional = true }`,
      `tower-http = { version = "0.6", features = ["fs"], optional = true }`,
      `wasm-bindgen = "0.2"`,
      ``,
      `[features]`,
      `default = []`,
      `hydrate = ["leptos/hydrate"]`,
      `ssr = [`,
      `  "dep:axum",`,
      `  "dep:leptos_axum",`,
      `  "dep:tokio",`,
      `  "dep:tower",`,
      `  "dep:tower-http",`,
      `  "leptos/ssr",`,
      `  "leptos_meta/ssr",`,
      `  "leptos_router/ssr",`,
      `]`,
      ``,
      `[package.metadata.leptos]`,
      `output-name = "${crateName}"`,
      `site-root = "target/site"`,
      `site-pkg-dir = "pkg"`,
      `style-file = "style/main.scss"`,
      `browserquery = "defaults"`,
      `env = "DEV"`,
      `bin-features = ["ssr"]`,
      `lib-features = ["hydrate"]`,
      ``,
      `[[bin]]`,
      `name = "${crateName}"`,
      `path = "src/main.rs"`,
      `required-features = ["ssr"]`,
      ``,
      `[profile.release]`,
      `codegen-units = 1`,
      `lto = true`,
      ``,
      `[profile.wasm-release]`,
      `inherits = "release"`,
      `opt-level = "z"`,
      ``,
    ].join('\n'),
  );

  // src/lib.rs — shared App component + hydrate entry for WASM
  await fs.writeFile(
    path.join(dir, 'src', 'lib.rs'),
    `pub mod app;

#[cfg(feature = "hydrate")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn hydrate() {
    use app::App;
    console_error_panic_hook::set_once();
    leptos::mount::hydrate_body(App);
}
`,
  );

  // src/app.rs — App component with basic router
  await fs.writeFile(
    path.join(dir, 'src', 'app.rs'),
    `use leptos::prelude::*;
use leptos_meta::*;
use leptos_router::{components::Router, path};

pub fn shell(options: LeptosOptions) -> impl IntoView {
    view! {
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <AutoReload options=options.clone()/>
                <HydrationScripts options=options.clone()/>
                <MetaTags/>
            </head>
            <body>
                <App/>
            </body>
        </html>
    }
}

#[component]
pub fn App() -> impl IntoView {
    provide_meta_context();

    view! {
        <Title text="${projectName}"/>
        <Router>
            <main>
                <Routes fallback=|| view! { <p>"Not found."</p> }>
                    <Route path=path!("/") view=HomePage/>
                </Routes>
            </main>
        </Router>
    }
}

#[component]
fn HomePage() -> impl IntoView {
    let (count, set_count) = signal(0);

    view! {
        <h1>"${projectName}"</h1>
        <button on:click=move |_| set_count.update(|n| *n += 1)>
            "Count: " {count}
        </button>
    }
}
`.replace(/\${projectName}/g, projectName),
  );

  // src/main.rs — SSR server entry (Axum + leptos_axum)
  await fs.writeFile(
    path.join(dir, 'src', 'main.rs'),
    `#[cfg(feature = "ssr")]
#[tokio::main]
async fn main() {
    use axum::Router;
    use leptos::prelude::*;
    use leptos_axum::{generate_route_list, LeptosRoutes};
    use ${crateIdent}::app::{shell, App};

    let conf = get_configuration(None).unwrap();
    let leptos_options = conf.leptos_options;
    let addr = leptos_options.site_addr;
    let routes = generate_route_list(App);

    let app = Router::new()
        .leptos_routes(&leptos_options, routes, {
            let leptos_options = leptos_options.clone();
            move || shell(leptos_options.clone())
        })
        .fallback(leptos_axum::file_and_error_handler(shell))
        .with_state(leptos_options);

    println!("Listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[cfg(not(feature = "ssr"))]
pub fn main() {}
`,
  );

  // style/main.scss
  await fs.writeFile(
    path.join(dir, 'style', 'main.scss'),
    `:root {
  font-family: system-ui, sans-serif;
}

body {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

h1 {
  color: #b7410e;
}

button {
  padding: 0.5rem 1rem;
  font-size: 1rem;
  cursor: pointer;
}
`,
  );

  // .cargo/config.toml — only needed when this crate is the workspace root.
  // In a monorepo the root Cargo workspace already has this file; writing it
  // inside the frontend/ member dir is redundant and can confuse tooling.
  if (!isMonorepo) {
    await fs.writeFile(
      path.join(dir, '.cargo', 'config.toml'),
      `# DARE: Do NOT add a global [build] target here.
# Mixed workspaces (Leptos WASM + native crates like napi-rs or aya) will break
# if cargo tries to compile all crates for the same target.
# cargo-leptos manages wasm32-unknown-unknown target per-crate automatically.
`,
    );
  }

  await cargo.run(['fetch']);
  if (isMonorepo) {
    const lockFile = path.join(dir, 'Cargo.lock');
    if (await fs.pathExists(lockFile)) await fs.remove(lockFile);
  }
}

async function bootstrapLeptosCsr(
  dir: string,
  projectName: string,
  mode: ToolchainMode,
  isMonorepo: boolean,
): Promise<void> {
  banner(`Bootstrapping Leptos CSR (WASM + trunk) in ${dir}`);

  const cargo = await StackTool.resolve({
    nativeCmd: 'cargo',
    nativeHint: [
      'Install Rust toolchain: https://www.rust-lang.org/tools/install',
      'Then: rustup target add wasm32-unknown-unknown',
      '      cargo install trunk --locked',
    ].join('\n  '),
    dockerImage: 'ghcr.io/dewtech-technologies/dare-rust-leptos:1',
    imageHasEntrypoint: false,
    dir,
    mode,
  });

  const crateName = sanitizeCrateName(projectName);

  await fs.ensureDir(path.join(dir, 'src'));
  await fs.ensureDir(path.join(dir, 'style'));
  await fs.ensureDir(path.join(dir, '.cargo'));

  // Cargo.toml — CSR-only, compiled to WASM via trunk
  await fs.writeFile(
    path.join(dir, 'Cargo.toml'),
    [
      `[package]`,
      `name = "${crateName}"`,
      `version = "0.1.0"`,
      `edition = "2021"`,
      ``,
      `[lib]`,
      `crate-type = ["cdylib", "rlib"]`,
      ``,
      `[dependencies]`,
      `leptos = { version = "0.7", features = ["csr"] }`,
      `console_error_panic_hook = "0.1"`,
      `wasm-bindgen = "0.2"`,
      ``,
      `[profile.release]`,
      `lto = true`,
      `opt-level = "z"`,
      ``,
    ].join('\n'),
  );

  // src/lib.rs — App component, mount entry for trunk
  await fs.writeFile(
    path.join(dir, 'src', 'lib.rs'),
    `use leptos::prelude::*;

pub fn main() {
    console_error_panic_hook::set_once();
    leptos::mount::mount_to_body(App);
}

#[component]
pub fn App() -> impl IntoView {
    let (count, set_count) = signal(0);

    view! {
        <main>
            <h1>"${projectName}"</h1>
            <button on:click=move |_| set_count.update(|n| *n += 1)>
                "Count: " {count}
            </button>
        </main>
    }
}
`.replace('${projectName}', projectName),
  );

  // index.html — trunk entry point (data-trunk attributes tell trunk what to bundle)
  await fs.writeFile(
    path.join(dir, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <link data-trunk rel="scss" href="style/main.scss" />
    <link data-trunk rel="rust" href="Cargo.toml" data-wasm-opt="z" />
  </head>
  <body></body>
</html>
`.replace(/\${projectName}/g, projectName),
  );

  // Trunk.toml
  await fs.writeFile(
    path.join(dir, 'Trunk.toml'),
    `[build]
target = "index.html"
dist = "dist"

[watch]
ignore = ["./dist"]

[serve]
port = 3001
open = false
`,
  );

  // style/main.scss
  await fs.writeFile(
    path.join(dir, 'style', 'main.scss'),
    `:root {
  font-family: system-ui, sans-serif;
}

body {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

h1 {
  color: #b7410e;
}

button {
  padding: 0.5rem 1rem;
  font-size: 1rem;
  cursor: pointer;
}
`,
  );

  // .cargo/config.toml — omit when inside a Cargo workspace (root already has it)
  if (!isMonorepo) {
    await fs.writeFile(
      path.join(dir, '.cargo', 'config.toml'),
      `# DARE: Do NOT add a global [build] target here.
# trunk manages wasm32-unknown-unknown target automatically via its own build pipeline.
`,
    );
  }

  await cargo.run(['fetch']);
  if (isMonorepo) {
    const lockFile = path.join(dir, 'Cargo.lock');
    if (await fs.pathExists(lockFile)) await fs.remove(lockFile);
  }
}

async function bootstrapVite(
  dir: string,
  template: 'react-ts' | 'vue-ts',
  mode: ToolchainMode,
): Promise<void> {
  banner(`Bootstrapping Vite (${template}) in ${dir}`);

  const npm = await StackTool.resolve({
    nativeCmd: 'npm',
    nativeHint: 'Install Node.js: https://nodejs.org/',
    dockerImage: 'node:20-alpine',
    imageHasEntrypoint: false,
    dir,
    mode,
  });

  // We use `degit` instead of `npm create vite` because the Vite scaffolder
  // has interactive prompts (project name, package manager, sometimes the
  // experimental "Use Rolldown-Vite?" question) that can't be reliably
  // suppressed from a non-TTY parent process. `degit` clones the *same*
  // official template tree from the Vite repo with zero prompts.
  await npm.runOther('npx', [
    '-y',
    'degit',
    `vitejs/vite/packages/create-vite/template-${template}`,
    '.',
    '--force',
  ]);

  // The Vite official templates ship a `package.json` with a placeholder
  // `name: "vite-project"` — the DARE generator will overwrite that with
  // the project name later (via tryRenameNpmProject in the caller chain),
  // but we still kick off `npm install` here so the agent has node_modules
  // and the build/test gates run from the start.
  await npm.run(['install']);
}

async function bootstrapMcpNode(
  dir: string,
  projectName: string,
  mode: ToolchainMode,
): Promise<void> {
  banner(`Bootstrapping MCP server (TypeScript) in ${dir}`);

  const npm = await StackTool.resolve({
    nativeCmd: 'npm',
    nativeHint: 'Install Node.js: https://nodejs.org/',
    dockerImage: 'node:20-alpine',
    imageHasEntrypoint: false,
    dir,
    mode,
  });

  await npm.run(['init', '-y']);
  await npm.run(['install', '@modelcontextprotocol/sdk']);
  await npm.run(['install', '--save-dev', 'typescript', '@types/node', 'tsx', 'vitest']);

  await tryRenameNpmProject(dir, projectName);
}

async function bootstrapMcpPython(dir: string, mode: ToolchainMode): Promise<void> {
  banner(`Bootstrapping MCP server (Python) in ${dir}`);

  const python = await StackTool.resolve({
    nativeCmd: 'python',
    nativeHint: 'Install Python 3.11+: https://www.python.org/downloads/',
    dockerImage: 'python:3.12-slim',
    imageHasEntrypoint: false,
    dir,
    mode,
  });

  await python.run(['-m', 'venv', '.venv']);
  // See bootstrapPythonFastapi above: `pip.exe install --upgrade pip` fails
  // on Windows because pip can't overwrite its own running executable. We
  // route every pip call through `python -m pip` instead.
  const venvPython =
    process.platform === 'win32' && !python.usingDocker
      ? path.join('.venv', 'Scripts', 'python.exe')
      : path.join('.venv', 'bin', 'python');

  await python.runOther(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  await python.runOther(venvPython, ['-m', 'pip', 'install', 'mcp[cli]', 'pytest', 'ruff']);
}

/**
 * Ruby on Rails — run the real `rails new`, then overlay DARE's value-add.
 *
 * Unlike the other stacks, the framework runtime (config/application.rb, bin/,
 * boot.rb, database.yml, locales, credentials, …) lives INSIDE the app and is
 * produced by `rails new`, not fetched by `bundle install`. So we generate it
 * with the real generator (native `rails` or, as a fallback, the `ruby` Docker
 * image) and then lay the DARE files on top. The scaffolder is told the runtime
 * already exists (`nativeRuntimeProvided`) so it skips its offline template
 * runtime and only writes DARE's controllers/services/specs/Gemfile/etc.
 *
 * If neither `rails` nor Docker is available, we degrade gracefully to the
 * offline template runtime (the hand-written skeleton) with a warning instead
 * of hard-failing — so `dare init` always produces something runnable-ish.
 */
async function bootstrapRubyRails(
  dir: string,
  projectName: string,
  mode: ToolchainMode,
  fullstack: boolean,
): Promise<void> {
  banner(`Bootstrapping Rails 8 (${fullstack ? 'full-stack' : 'API-only'}) in ${dir}`);

  // rails new flags — skip what DARE owns (tests→rspec, ci→dare-ci, git, bundle).
  const flags = [
    '--database=postgresql',
    '--skip-bundle',
    '--skip-git',
    '--skip-test',
    '--skip-ci',
  ];
  if (!fullstack) flags.push('--api');

  // Toolchain policy (Rails). The goal is a real, complete app whenever a
  // toolchain exists — only fall back to DARE's offline templates when there's
  // genuinely no way to run `rails new`:
  //   docker → always Docker (explicit).
  //   native → native `rails`, else offline (never silently pulls Docker).
  //   auto   → native `rails` if present, else Docker if present, else offline.
  // DARE_RAILS_OFFLINE=1 forces the offline path (deterministic tests).
  const forceOffline = process.env.DARE_RAILS_OFFLINE === '1';
  const hasNativeRails = !forceOffline && (await hasCommand('rails'));
  const hasDocker = !forceOffline && (await hasCommand('docker'));

  let plan: 'native' | 'docker' | 'offline';
  if (forceOffline) plan = 'offline';
  else if (mode === 'docker') plan = 'docker';
  else if (hasNativeRails) plan = 'native';
  else if (mode === 'auto' && hasDocker) plan = 'docker';
  else plan = 'offline';

  if (plan === 'offline') {
    const reason =
      mode === 'native'
        ? '--toolchain=native selected but `rails` is not on PATH'
        : 'neither `rails` nor Docker is available';
    console.log(
      chalk.yellow(
        `⚠  ${reason} — using DARE's offline Rails templates (less complete than \`rails new\`).\n` +
          `   Install Ruby+Rails or Docker, or re-run with --toolchain docker, for a full app.`,
      ),
    );
    await overlayRailsDare(dir, projectName, mode, fullstack, /* nativeRuntimeProvided */ false);
    return;
  }

  const tool = await StackTool.resolve({
    nativeCmd: 'rails',
    nativeHint: 'Install Ruby 3.3+ and Rails 8: https://rubyonrails.org/ (gem install rails)',
    // No official `rails` image. Use the FULL ruby image (not -slim): it ships
    // the build toolchain needed to compile rails' native gems (e.g.
    // websocket-driver). -slim lacks make/gcc and `gem install rails` fails.
    dockerImage: 'ruby:3.3',
    imageHasEntrypoint: false,
    dir,
    mode: plan === 'native' ? 'native' : 'docker',
  });

  if (tool.usingDocker) {
    // The ruby image has gem but not rails — install it, then generate. Point
    // GEM_HOME at a world-writable dir so this also works when the container
    // runs as the host user (`--user uid:gid` on Linux can't write the default
    // /usr/local/bundle).
    const railsNew = `rails new . ${flags.join(' ')}`;
    await tool.runOther('sh', [
      '-c',
      `export GEM_HOME=/tmp/.dare-gems GEM_PATH=/tmp/.dare-gems PATH="/tmp/.dare-gems/bin:$PATH" && ` +
        `gem install rails -v '~> 8.0' --no-document && ${railsNew}`,
    ]);
  } else {
    await tool.run(['new', '.', ...flags]);
  }

  // Overlay DARE's value-add; the real runtime is already in place.
  await overlayRailsDare(dir, projectName, mode, fullstack, /* nativeRuntimeProvided */ true);
}

/** Runs the ruby-rails-8 scaffolder as a DARE overlay (or offline fallback). */
async function overlayRailsDare(
  dir: string,
  projectName: string,
  mode: ToolchainMode,
  fullstack: boolean,
  nativeRuntimeProvided: boolean,
): Promise<void> {
  const { resolve } = await import('../stacks/registry.js');
  const { DARE_DNA } = await import('../stacks/types.js');
  const scaffold = await resolve('ruby-rails-8');
  await scaffold.generate({
    dir,
    projectName,
    toolchain: mode,
    features: new Set(DARE_DNA),
    isMonorepo: false,
    fullstack,
    nativeRuntimeProvided,
  });
}

/**
 * v3.1 — Generic registry-backed bootstrap. Every stack (backend + MCP) lays
 * down its DARE-shaped templates directly via its internalized scaffolder; no
 * shell-out to the framework's official CLI. The user runs install/migrate
 * steps afterwards (printed as postInstallSteps).
 */
async function bootstrapViaRegistry(
  stackId: string,
  dir: string,
  projectName: string,
  isMonorepo: boolean,
  mode: ToolchainMode,
  mcpTransport?: 'stdio' | 'sse' | 'http',
  fullstack: boolean = false,
): Promise<void> {
  banner(`Scaffolding ${stackId} (DARE-shaped) in ${dir}`);
  const { resolve } = await import('../stacks/registry.js');
  const { DARE_DNA } = await import('../stacks/types.js');
  const scaffold = await resolve(stackId);
  await scaffold.generate({
    dir,
    projectName,
    toolchain: mode,
    features: new Set(DARE_DNA),
    isMonorepo,
    fullstack,
    mcp: scaffold.category === 'mcp' ? { transport: mcpTransport ?? 'stdio' } : undefined,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function banner(msg: string): void {
  console.log(chalk.blue.bold(`\n📦 ${msg}\n`));
}

async function hasCommand(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = spawn(cmd, ['--version'], { shell: false, stdio: 'ignore' });
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
      shell: false,
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
  // Cargo package names use hyphens (idiomatic). Rust identifiers derived from
  // them replace hyphens with underscores — see crateIdent usages in this file.
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
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
