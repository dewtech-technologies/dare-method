# @dewtech/dare-cli

CLI tool for the **DARE Framework** — Design, Architect, Review, Execute.

A structured methodology for AI-assisted software development with mandatory human-in-the-loop reviews and parallel task execution.

> **Current version:** `2.15.1`

[![npm](https://img.shields.io/npm/v/@dewtech/dare-cli)](https://www.npmjs.com/package/@dewtech/dare-cli)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://github.com/dewtech-technologies/dare-method/blob/main/LICENSE)

---

## ⚠ Read this first — How `dare init` runs the official scaffold

`dare init` invokes the **official scaffold** of the stack you pick. That
means it literally runs:

| Stack | What `dare init` runs |
|-------|----------------------|
| `php-laravel` | `composer create-project laravel/laravel:^11 .` |
| `node-nestjs` | `npx @nestjs/cli new . --strict --skip-git` |
| `python-fastapi` | `python -m venv .venv && python -m pip install -r requirements.txt` |
| `rust-axum` | `cargo init` + write `Cargo.toml` (axum, sqlx, tokio…) |
| `go-gin` | `go mod init` + `go get gin/godotenv` + starter files |
| `go-stdlib` | `go mod init` + starter usando só `net/http` (zero deps externas) |
| `react`, `vue` | `npx degit vitejs/vite/packages/create-vite/template-<x> .` + `npm install` |
| `rust-leptos` | Cargo workspace with `crates/server` (Axum) + `crates/web` (Leptos 0.7 SSR+hydrate) + `cargo fetch` |
| `rust-leptos-csr` | Cargo workspace with `crates/server` (Axum) + `crates/web` (Leptos 0.7 CSR) + Trunk.toml + `cargo fetch` |
| `mcp-server-node-ts` | `npm init` + `@modelcontextprotocol/sdk` |
| `mcp-server-python` | `python -m venv .venv` + `pip install mcp[cli]` |

These need a working `composer` / `npm` / `cargo` / `python` / `go`
**somewhere**. There are three ways to provide it — you pick at init time
(prompt below), and the choice is saved in `dare.config.json` so
`dare bootstrap` reuses it later.

```
? Toolchain for scaffolding (composer / npm / cargo / python / go):
  ❯ 🤖 Auto — use native if on PATH, else Docker (recommended)
    🔧 Native only — require the CLI on PATH (faster, no Docker pulls)
    🐳 Docker only — always use the official image (hermetic, no host install)
```

### 🤖 Auto (default)

Tries the native CLI first. If missing, falls back to the official Docker
image automatically. If neither is present, fails fast with both install
links.

```
which composer  → ✓ found?  use native
                → ✗ missing? which docker
                              → ✓ found?  docker run composer:latest …
                              → ✗ missing? error: install Composer or Docker
```

**When:** you don't know exactly what's installed; mixed teams (some
machines have the toolchain, some only have Docker). The same project
config (`dare.config.json` with `toolchain: auto`) works on every machine.

### 🔧 Native only

Requires the CLI on PATH. **Fails immediately** if missing — no Docker
fallback even if Docker is available.

```
which composer → ✓ found?  use native
                → ✗ missing? error: "Install Composer: https://getcomposer.org/"
```

**When:** you already have the toolchain and want **maximum speed** (no
`docker pull`, no bind-mount overhead, no container startup); you're in CI
with the toolchain pre-installed; you want to avoid Docker Desktop edge
cases (Windows volume throttling, Linux uid/gid issues, etc.).

### 🐳 Docker only

**Always** runs the scaffold inside the official Docker image — even if
the native CLI is on PATH. Fails if Docker isn't installed.

```
which docker → ✓ found?  docker run --rm -v ".:/app" composer:latest create-project …
              → ✗ missing? error: "Install Docker Desktop"
```

**When:** you don't want to install PHP / Cargo / Python / Go on the
host (keep host clean); you want **hermetic, reproducible** builds (every
dev uses the exact toolchain version baked into the image); you want to
mirror your CI locally.

### Quick decision table

| Your situation | Pick |
|----------------|------|
| Already have the toolchain installed, want speed | **🔧 Native** |
| Don't want to install PHP/Cargo/Python/Go on the host | **🐳 Docker** |
| Mixed team, varying setups | **🤖 Auto** |
| Just want it to work | **🤖 Auto** |
| Want bit-for-bit toolchain reproducibility | **🐳 Docker** |
| Solo dev with everything installed | **🔧 Native** |

### Override later

```bash
dare bootstrap --toolchain docker          # rerun scaffold inside Docker
dare bootstrap --toolchain native --force  # rerun native, overwriting framework files
dare bootstrap --toolchain auto            # back to auto-detect
```

### ⚠ Important caveat — Ralph Loop

`dare execute --complete` runs the stack's quality gates
(`composer dump-autoload`, `php artisan test`, `cargo build`, etc.)
**directly on the host** — it does **not** automatically wrap them in
Docker even if you picked `docker only` at init time.

If you don't have the native toolchain installed, the agent should run
the gates inside the container created by **task-001** (the Containerize
task), e.g. `docker compose exec app php artisan test`. The skills
shipped with `dare init` already nudge the agent toward that pattern.

---

## Prerequisites

### Required for the CLI itself

| Tool | Why | Install |
|------|-----|---------|
| **Node.js 18+** | runs `dare`, `dare-mcp-server` and the bundled GraphRAG engine | https://nodejs.org/ |

### Required to scaffold the chosen stack

`dare init` runs the **official scaffold** of the stack you pick (e.g.
`composer create-project laravel/laravel`, `npm create vite@latest`,
`go mod init`). It tries the native toolchain first; if it isn't on PATH,
it falls back to running the equivalent **Docker image** automatically.

Pick **one** of the two paths per stack:

| Stack | Native toolchain | Docker fallback (used if native missing) |
|-------|------------------|------------------------------------------|
| `php-laravel` | PHP 8.2+ · Composer 2+ — https://getcomposer.org/ | `composer:latest` |
| `node-nestjs` | Node 18+ (bundles `npx`) | `node:20-alpine` |
| `python-fastapi` | Python 3.11+ — https://www.python.org/downloads/ | `python:3.12-slim` |
| `rust-axum` | Rust 1.83+ (rustup) — https://www.rust-lang.org/tools/install | `rust:1.83` |
| `go-gin` | Go 1.25+ — https://go.dev/dl/ | `golang:1.25` |
| `go-stdlib` | Go 1.22+ — https://go.dev/dl/ | `golang:1.25` |
| `react`, `vue` | Node 18+ (bundles `npm`) | `node:20-alpine` |
| `rust-leptos` | Rust 1.83+ (rustup) + **cargo-leptos 0.2.22** — `cargo install cargo-leptos --version 0.2.22` | `ghcr.io/dewtech-technologies/dare-rust-leptos:1` |
| `rust-leptos-csr` | Rust 1.83+ (rustup) + **trunk** — `cargo install trunk` | `ghcr.io/dewtech-technologies/dare-rust-leptos:1` |
| `mcp-server-node-ts` | Node 18+ | `node:20-alpine` |
| `mcp-server-python` | Python 3.11+ | `python:3.12-slim` |

> **TL;DR:** if you have **Docker Desktop** installed, you don't strictly need
> any other toolchain — `dare init` will pull the right image on demand.
> Native toolchains are faster and don't depend on Docker pulling images.

If neither the native CLI **nor** Docker is available, `dare init` fails
fast with a clear error message — it never falls back to a fake template.

### Choose the toolchain at init time

The 3 modes (`auto` / `native` / `docker`) are explained in detail at the
top of this README — see [⚠ Read this first](#-read-this-first--how-dare-init-runs-the-official-scaffold).

Quick recap:

| Mode | Behavior |
|------|----------|
| `auto` (default) | Native if available, else Docker. Recommended. |
| `native` | Requires the native CLI; fails if missing. |
| `docker` | Always uses the official Docker image. |

The choice is persisted in `dare.config.json` (`"toolchain": "..."`).
Override at any time:

```bash
dare bootstrap --toolchain docker          # rerun scaffold inside Docker
dare bootstrap --toolchain native --force  # rerun native, overwriting
```

### Required for the Ralph Loop (per project)

Once the project is scaffolded, every `dare execute --complete` runs the
stack's gates: `build → test → lint`. The same toolchain (native or Docker)
that scaffolded the project is needed to run those gates. Plan accordingly:
if you chose `php-laravel` and only have Docker, `dare execute --complete`
needs to invoke `php artisan test` somehow — typically by running it inside
your `docker-compose` app service (this is the kind of thing the
`task-001 = Containerize app` task sets up).

## Installation

```bash
npm install -g @dewtech/dare-cli
```

## Commands

### `dare init`

Interactive project initialization — creates the full project structure with DARE methodology files, IDE rules and stack templates.

```bash
dare init my-project
```

Prompts:
- **Structure:** Monorepo · Backend only · Frontend only · **MCP Server** ← new
- **MCP Server:** language (TypeScript / Python), transport (stdio / SSE / HTTP Stream), capabilities (Tools / Resources / Prompts)
- **Backend stack:** Rust/Axum · Node.js/NestJS · Python/FastAPI · PHP/Laravel · Go/Gin · Go/stdlib
- **Frontend stack:** React 18+ · Vue 3+ · Leptos fullstack (Rust SSR+WASM) · Leptos CSR-only (Rust WASM)
- **Cargo workspace layout** *(Monorepo + Rust/Axum + Leptos only)*: Single-crate (`crates/server` + `crates/web`) · Multi-crate (`{prefix}-core` + `{prefix}-server` + `{prefix}-web` + `{prefix}-cli`) — prefix suggested from project initials (e.g. `ai-runtime-securyti-rasp` → `arsr`)
- **IDE / Agent:** Claude Code · Cursor · Antigravity · Hybrid
- **GraphRAG backend:** SQLite · JSON · Neo4j
- **DARE MCP Server:** context query server (saves ~95% tokens)

Generates:
- `dare.config.json` — project config
- `CLAUDE.md` + `.claude/commands/` + `.claude/settings.json` — Claude Code rules and slash commands (includes `/dare-security`)
- `.cursorrules` / `.antigravityrules` — Cursor / Antigravity rules
- `.cursor/rules/*.mdc` — stack-specific skills
- `.cursor/commands/` — Cursor slash commands
- `.agents/skills/` — Antigravity agent skills
- `DARE/` — methodology directory (DESIGN, BLUEPRINT, TASKS, dag)
- Full project template ready to run (MCP server, backend or frontend)

---

### `dare discover` ← new in v0.3.0

Detects an existing project's stack automatically and installs DARE files without touching your source code.

```bash
# Run inside an existing project
cd my-existing-project
dare discover

# Inspect only, no changes
dare discover --check

# Target a specific directory
dare discover --dir ./path/to/project
```

Auto-detects from: `package.json`, `Cargo.toml`, `requirements.txt`, `pyproject.toml`, `composer.json`.

Recognizes: NestJS · React · Vue · Nuxt · Rust/Axum · FastAPI · Laravel · **MCP Server** (`@modelcontextprotocol/sdk`, `FastMCP`).

---

### `dare design`

Generate `DARE/DESIGN.md` from a project description.

```bash
dare design "Build a REST API for user authentication with JWT"
```

---

### `dare blueprint`

Generate `DARE/BLUEPRINT.md` from `DESIGN.md`. Stops here — requires human review and approval before tasks are created.

```bash
dare blueprint
```

---

### `dare tasks`

Generate `DARE/TASKS.md`, `DARE/dare-dag.yaml` and all `DARE/EXECUTION/task-*.md` specs from an approved `BLUEPRINT.md`. Run this only after reviewing and approving the blueprint.

```bash
dare tasks
```

---

### `dare execute`

Orchestrate DAG execution. **The IDE is the executor** (Cursor / Antigravity
/ Claude Code) — `dare execute` only coordinates state, composes prompts
with parent context, updates the live canvas at `DARE/.canvas.md`, and
ingests finished tasks into the knowledge graph.

> **No API keys, no extra token costs.** You use the plan of the IDE you're
> already logged into.

```bash
# Print next executable tasks (with composed prompts)
dare execute --next

# Mark a task DONE after the agent finishes it
dare execute --complete task-001 --output "Created src/auth.ts and tests/auth.test.ts; all tests green."

# Mark a task FAILED — descendants are cascade-skipped automatically
dare execute --fail task-002 --reason "Schema migration conflict in users table"

# Reset a task back to PENDING (for retry)
dare execute --reset task-002

# Show snapshot of canvas + summary (default action)
dare execute --status
```

#### Typical flow inside the IDE agent

```bash
dare execute --next                                # → tasks ready in current rank
# (agent executes each task: code, build, test, lint)
dare execute --complete task-001 --output "…"
dare execute --complete task-002 --output "…"
dare execute --next                                # → next rank
# (repeat until "✅ All tasks resolved")
```

The skills shipped by `dare init` (`.cursor/rules/skill-dag-runner.mdc`,
`.agents/skills/dare-dag-runner/SKILL.md`, `.claude/commands/dare-dag-run.md`)
guide the IDE agent through this loop.

#### Stack-specific skills

`dare init` also ships skills focused on architectural decisions for
specific stacks. As of v2.15.0:

- **`skill-rust-workspace.mdc`** (Cursor) /
  **`dare-rust-workspace/SKILL.md`** (Antigravity) /
  **`/dare-rust-workspace`** (Claude command) — guides the agent on
  whether a Rust project should start single-crate or as a Cargo
  workspace, and gives a step-by-step PR-by-PR migration plan when an
  existing single-crate project has outgrown its layout. Active during
  `/dare-design` and `/dare-blueprint` for `rust-axum` projects, plus on
  demand for migration analysis.

- **`skill-rust-leptos.mdc`** (Cursor) /
  **`dare-rust-leptos/SKILL.md`** (Antigravity) /
  **`/dare-rust-leptos`** (Claude command) — full guide for Leptos
  development: CSR vs fullstack decision table, Leptos 0.7 idioms
  (signals, Resource, Action, Show, For, `#[server]`), shared types with
  `cfg_attr`, mixed workspace configuration (WASM + native crates), and
  antipatterns to avoid (`cargo leptos test` does not exist; no global
  `[build] target` in `.cargo/config.toml`). Ships 3 ready-to-use DARE
  task templates for Leptos projects.

### `dare bootstrap`

Run the official scaffold for a project's stack on **an existing project**
(created in older versions or with `--skip-bootstrap`). Reads
`dare.config.json` and dispatches to:

- `composer create-project laravel/laravel` for `php-laravel`
- `npx @nestjs/cli new` for `node-nestjs`
- `npm create vite` for `react` / `vue`
- `python -m venv` + `pip install` for `python-fastapi`
- `cargo init` + axum-ready `Cargo.toml` for `rust-axum`
- `npm init` + `@modelcontextprotocol/sdk` for `mcp-server-node`

```bash
dare bootstrap          # refuses if vendor/ or node_modules/ already exist
dare bootstrap --force  # runs anyway (may overwrite framework files)
```

Your DARE artifacts (`.cursor/`, `DARE/`, `dare.config.json`, `dare-graph.yml`)
are preserved.

### `dare info`

Read-only diagnostic of the current project: CLI version, platform, presence
of each canonical DARE artifact, active GraphRAG backend, and task progress.

```bash
dare info
```

### `dare validate`

Static checks on `dare-dag.yaml` — ideal for pre-commit hooks and CI.
Verifies unique kebab-case ids, valid `depends_on`, absence of cycles,
non-empty prompts, and parallelism (warning when only one task at rank 0).

```bash
dare validate                # errors fail; warnings printed
dare validate --strict       # warnings also fail (CI-friendly)
```

A pre-commit hook template is shipped at
`templates/hooks/pre-commit-dare-validate` — copy to `.git/hooks/pre-commit`
(or use with husky) to validate the DAG before every commit.

### `dare execute --watch`

Interactive loop: the CLI watches `.dare/state.json` and re-prints the next
ready tasks every time the state changes. Pair with the IDE agent firing
`--complete`/`--fail` from another terminal.

```bash
dare execute --watch
```

### `dare dag`

Inspect and visualize the **static task DAG** declared in `dare-dag.yaml` —
distinct from `dare graph`, which inspects the populated knowledge graph
(only contains tasks already executed).

```bash
dare dag viz                              # Mermaid to stdout
dare dag viz -o DARE/dag-graph.mmd        # Mermaid file
dare dag viz -f dot -o DARE/dag-graph.dot # DOT (Graphviz)
```

The Mermaid output groups tasks into rank subgraphs and colors nodes by
status (`PENDING` / `RUNNING` / `DONE` / `FAILED` / `SKIPPED`), so you can
**see the execution plan before running any task**.

> `dare tasks` writes `DARE/dag-graph.mmd` automatically — open it in
> your editor with a Mermaid preview to see the static graph immediately.

### `dare graph`

Inspect the project's knowledge graph. The graph is populated automatically
by `dare execute --complete/--fail` (task nodes, file nodes, `depends_on` and
`implements` edges). Backend is whatever `dare-graph.yml` declares
(`sqlite` default, `json` available, `neo4j` planned).

```bash
dare graph stats                       # totals + breakdown by type
dare graph query auth                  # search nodes by label/description
dare graph query auth --limit 20

dare graph viz                         # Mermaid to stdout
dare graph viz -f dot                  # DOT for Graphviz
dare graph viz -o docs/graph.mmd       # write to file

dare graph ingest                      # re-sync from dare-dag.yaml + state
```

---

## Full Workflow

```bash
# New project
dare init my-project
cd my-project
dare design "Describe what you're building"
dare blueprint
dare execute --parallel

# Existing project
cd my-existing-project
dare discover
dare design "Describe what you're building"
dare blueprint
dare execute --parallel
```

## Claude Code Workflow

```bash
dare init my-project
# → IDE: Claude Code
# → Structure: Backend / Frontend / MCP Server

cd my-project
# Claude Code slash commands available:
# /dare-design   → generates DARE/DESIGN.md
# /dare-blueprint → generates BLUEPRINT.md + DAG
# /dare-execute task-001 → implements with Ralph Loop
# /dare-tasks    → shows task status table
```

Files generated for Claude Code:
```
CLAUDE.md                    ← main context (stack rules + DARE methodology)
.claude/
  settings.json              ← permissions + Ralph Loop hook
  commands/
    dare-design.md           ← /dare-design
    dare-blueprint.md        ← /dare-blueprint
    dare-execute.md          ← /dare-execute
    dare-tasks.md            ← /dare-tasks
```

---

## MCP Server Workflow

```bash
dare init my-mcp-server
# → Structure: MCP Server
# → Language: TypeScript
# → Transport: stdio
# → Capabilities: Tools, Resources

cd my-mcp-server
npm install
dare design "MCP server that exposes ZIP code lookup tools"
dare blueprint
dare execute --parallel

# Test with MCP Inspector
npm run inspect
```

---

## Performance

| Mode | Estimated Time |
|------|----------------|
| Sequential | ~280 minutes |
| Parallel DAG | ~70 minutes |
| **Improvement** | **75% faster** |

---

## Supported Stacks

| Type | Options |
|------|---------|
| **Backend** | Rust/Axum · Node.js/NestJS · Python/FastAPI · PHP/Laravel · Go/Gin · Go/stdlib |
| **Frontend** | React 18+ · Vue 3+ · Leptos fullstack (Rust SSR+WASM) · Leptos CSR (Rust WASM) |
| **MCP Server** | TypeScript/Node.js · Python — stdio / SSE / HTTP Stream |
| **IDE / Agent** | Claude Code · Cursor · Antigravity · Hybrid |

---

## O que vem com o pacote (v2.0+)

A partir da v2.0 o `@dewtech/dare-cli` é um **pacote único** que inclui todas as
funcionalidades do framework DARE. Você não precisa instalar nada além dele:

```bash
npm install -g @dewtech/dare-cli
```

Isso já dá:

| Componente | O que é |
|------------|---------|
| CLI `dare` | `init`, `design`, `blueprint`, `execute`, `discover` |
| CLI `dare-mcp-server` | Servidor MCP local de contexto (~95% economia de tokens) |
| Engine GraphRAG | Grafo de conhecimento com SQLite + FTS5 |
| DAG Task Runner | Execução paralela de tasks com Kahn's algorithm |
| Tipos e templates | Tudo embutido — sem dependências externas do `@dewtech/*` |

> **Histórico (v1.x):** os pacotes `@dewtech/dare-core`, `@dewtech/dare-graphrag` e
> `@dewtech/dare-mcp-server` foram consolidados em `@dewtech/dare-cli` e estão
> **deprecated** no npm. Não há mais subpacotes para gerenciar.

---

## Links

- [GitHub](https://github.com/dewtech-technologies/dare-method)
- [DARE Methodology](https://github.com/dewtech-technologies/dare-method#-o-método)
- [Dewtech](https://dewtech.tech)
