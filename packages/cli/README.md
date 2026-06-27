# @dewtech/dare-cli

CLI tool for the **DARE Framework** — Design, Architect, Review, Execute.

A structured methodology for AI-assisted software development with mandatory human-in-the-loop reviews and parallel task execution.

[![npm](https://img.shields.io/npm/v/@dewtech/dare-cli)](https://www.npmjs.com/package/@dewtech/dare-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/dewtech-technologies/dare-method/blob/main/LICENSE)

---

## ⚠ Read this first — How `dare init` scaffolds a project (v3.2)

`dare init` writes a **complete, DARE-shaped project** from generators
internalized in this package — no shell-out to the framework's official CLI
during init. Each backend + MCP stack lays down its full source tree
(Layered Design, OpenAPI, JWT auth, rate limit, `.env.example`,
`.dare/skills.yml`, CI gates), then prints the install/build steps to run next.

| Stack | What `dare init` writes |
|-------|-------------------------|
| `ruby-rails-8` | Rails 8 + Layered Design + Action Cable + LLM + RSpec |
| `node-nestjs` | NestJS 10 + Prisma + Swagger + Throttler + JWT |
| `python-fastapi` | FastAPI + Pydantic v2 + SQLAlchemy + Alembic + slowapi |
| `php-laravel` | Laravel 11 + Sanctum + FormRequest + Reverb + l5-swagger |
| `rust-axum` | Axum + Tower + utoipa + jsonwebtoken + argon2 + sqlx |
| `go-gin` | Gin + sqlc + swag + golang-jwt + gorilla/websocket |
| `go-stdlib` | net/http 1.22 (no framework) + sqlc + coder/websocket |
| `mcp-node-ts` | MCP server (`@modelcontextprotocol/sdk`) — stdio/sse/http |
| `mcp-python` | MCP server (`mcp[cli]` / FastMCP) — stdio/sse/http |
| `mcp-rust` (beta) | MCP server (`rmcp`) — stdio/sse/http |
| `mcp-go` (beta) | MCP server (`mark3labs/mcp-go`) — stdio/sse/http |
| `react`, `vue` | Vite scaffold + DARE overlay |
| `rust-leptos` / `-csr` | Cargo workspace (Axum server + Leptos web) |

Non-interactive: `dare init <name> --stack <id>` or `dare init <name> --mcp <lang> [--transport stdio\|sse\|http]`.

Generation itself needs **no toolchain**. To build/run the generated project
afterwards you need that stack's `ruby` / `composer` / `npm` / `cargo` / `python` / `go`
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

### Required to build/run the generated project

`dare init` itself needs no stack toolchain — it writes the project from
internalized templates. To **build and run** what it generates, you need that
stack's toolchain (`composer`/`npm`/`cargo`/`go`/`python`/`ruby`). If you don't
have it natively but have Docker, run the build steps inside the stack's
official image (the `.github/workflows/dare-ci.yml` the project ships shows the
exact commands).

Pick **one** of the two paths per stack:

| Stack | Native toolchain | Docker fallback (used if native missing) |
|-------|------------------|------------------------------------------|
| `ruby-rails-8` | Ruby 3.3+ · Bundler 2+ · Rails 8 — https://www.ruby-lang.org/ | `ruby:3.3-slim` |
| `php-laravel` | PHP 8.2+ · Composer 2+ — https://getcomposer.org/ | `composer:latest` |
| `node-nestjs` | Node 18+ (bundles `npx`) | `node:20-alpine` |
| `python-fastapi` | Python 3.11+ — https://www.python.org/downloads/ | `python:3.12-slim` |
| `rust-axum` | Rust 1.83+ (rustup) — https://www.rust-lang.org/tools/install | `rust:1.83` |
| `go-gin` | Go 1.25+ — https://go.dev/dl/ | `golang:1.25` |
| `go-stdlib` | Go 1.22+ — https://go.dev/dl/ | `golang:1.25` |
| `react`, `vue` | Node 18+ (bundles `npm`) | `node:20-alpine` |
| `rust-leptos` | Rust 1.83+ (rustup) + **cargo-leptos 0.2.22** — `cargo install cargo-leptos --version 0.2.22` | `ghcr.io/dewtech-technologies/dare-rust-leptos:1` |
| `rust-leptos-csr` | Rust 1.83+ (rustup) + **trunk** — `cargo install trunk` | `ghcr.io/dewtech-technologies/dare-rust-leptos:1` |
| `mcp-node-ts` | Node 18+ | `node:20-alpine` |
| `mcp-python` | Python 3.11+ | `python:3.12-slim` |
| `mcp-rust` (beta) | Rust 1.78+ (rustup) | `rust:1.83` |
| `mcp-go` (beta) | Go 1.23+ — https://go.dev/dl/ | `golang:1.25` |

> **v3.8.1–3.8.2 (manutenção):** `dare update` passa a entregar os skills/comandos/config das v3.4→v3.8 a projetos existentes (backfill do `UPDATE-MANIFEST`, 3.8.1). O CI ganha um **gate de cobertura de docs** + **redeploy automático da documentação** a cada release (3.8.2).

> **v3.16.0:** **Estrutura MVC (Rails full-stack)** — nova estrutura de projeto **`mvc`** no `dare init`/`discover` (escolhe Rails 8 ou Laravel). MVC + Rails gera um **full application** (views + Propshaft + Hotwire, `ActionController::Base`); `ruby-rails-8` em "Backend only" segue **API-only** (`ActionController::API`). `dare discover` detecta Rails via `Gemfile` e classifica Rails/Laravel como `mvc`.

> **v3.14.0:** **Brownfield AST** — `dare reverse --deep --ast` (tree-sitter WASM opt-in + merge superset com regex); `reverse-facts.json.extraction` metadata.

> **v3.13.0:** **CLI-only cleanup** — legado MkDocs/landing removido; monorepo enxuto; doc canônica em `docs-site/`; testes `cli-only-invariants`.

> **v3.11.0:** **Dynamic DAG** — `REPLAN` splice de sub-DAG em runtime (`refine --split` + `spliceSubDag`); `verification.loop.maxDepth` (default **2**, excedeu → `ESCALATE`); `dare refine --split --apply` (modo manual); `dare dag viz` agrupa sub-DAGs (`subgraph Sub-DAG: <pai>` em Mermaid/DOT/Excalidraw); estado persiste em `dare-dag.yaml` + `.dare/state.json`.

> **v3.10.0:** **Drift Gate** — `dare graph drift` (exit **7** com `--strict`). **Local Semantic Search** — retrieval híbrido RRF, `graphrag.semantic` opt-in, `@huggingface/transformers` optionalDep lazy, `dare graph query --semantic`, indexação incremental por `contentHash`.

> **v3.9.0:** **Secure Autonomous Executor + Agentic-chain Security Gate** — `dare execute --agent` (driver plugável, SDK como `optionalDependency` lazy; `--budget-tokens`, `--require-approval rank|none`, `--on-fail replan|escalate|stop`, `--dry-run`; telemetria de custo no GraphRAG; gate `no-llm-in-core`) **+** `dare guard` (unicode-audit + scan heurístico + proveniência Ed25519/minisign-compat + trust boundaries control/data; exit code **6** em FAIL; pré-flight do `dare execute --agent`; bloco `guard` em `dare.config.json`, opt-in `enabled:false`).

> **v3.8.0:** **Formal Verification Gate** — opt-in strict aspect `verification.formal` (enabled/backend/modules/maxRepairIterations/proofTimeoutSeconds/antiBypass) plus flags `--formal` / `--no-formal` / `--formal-backend <dafny|verus|lean>`. Proves marked critical modules against external Dafny/Verus/Lean toolchain (not an npm dep); exit 5 when toolchain missing on a marked module; anti-bypass rejects `assume(false)`/`ensures true`/leaks even on solver exit 0; telemetry edge `proven_by` → `formal-gate`.

> **v3.7.0:** **Brownfield Discovery** — deterministic auto-discovery of codebase patterns/conventions (`dare patterns`, read-only) fed into the dual graph + steering, plus lightweight planning personas (Analyst/PM/Architect) at planning time only (no runtime swarm). Extends `dare reverse`/`dna`.

> **v3.6.0:** **Agent Hooks + Steering Files** — event-triggered automation (Claude Code hooks + git pre-commit) over a closed action allowlist (`spawn`, no shell), and steering files (project standards reusing PROJECT-DNA) injected to all three IDEs via the MCP server.

> **v3.5.0:** **Dual Graph (Requirement↔Code)** — links spec/task nodes to code symbols in the GraphRAG; adds `dare graph owners|impact|trace|locate` and graph-guided localization; fixes the Neo4j backend (real Cypher reads, gated experimental).

> **v3.4.0:** **Security Hardening** — MCP server bound to 127.0.0.1 with auth + CORS allowlist + helmet; `dare init` path validation; CI publish with provenance, real eslint + coverage gates.

> **v3.3.0:** **Reliable Verification Core** (opt-in via `dare.config.json#verification`) — turns the Ralph Loop's "tests pass" gate into "correct & robust": mutation testing, fail-to-pass specs, anti-tamper, a decay-aware loop policy, best-of-N candidate selection over git worktrees, and a `dare bench` regression harness (solve-rate + Fix·Rate). Absent the `verification` block, behavior is unchanged.

> **v3.2.0:** full **CLI ↔ IDE parity** — every one of the 18 CLI commands is invocable as `/dare-<cmd>` across all three IDEs (Cursor, Claude Code, Antigravity); a parity test fails the build if a command is missing a skill. Brownfield commands now **collect real data by default**: `dare reverse`/`dna` extract endpoints + entities and render them into `IDEIA.md` and the module specs (no more skeleton-only artifacts).

> **v3.1.0:** all **11 stacks** ship a full generator internalized in `@dewtech/dare-cli` — 7 backend (ruby-rails-8, node-nestjs, python-fastapi, php-laravel, rust-axum, go-gin, go-stdlib) + 4 MCP (mcp-node-ts, mcp-python, mcp-rust, mcp-go). No isolated stack packages; everything is in one publishable tarball (fixes the `npm install -g` 404 of earlier releases). `dare new` was removed — `dare init` is the only scaffolding entrypoint.

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
- **Structure:** Monorepo · Backend only · Frontend only · **MVC (Laravel/Rails)** ← new · MCP Server
- **MVC framework** *(Structure = MVC)*: Ruby/Rails 8 (full application) · PHP/Laravel — full-stack server-rendered MVC
- **MCP Server:** language (TypeScript / Python), transport (stdio / SSE / HTTP Stream), capabilities (Tools / Resources / Prompts)
- **Backend stack:** Rust/Axum · Node.js/NestJS · Python/FastAPI · PHP/Laravel · Go/Gin · Go/stdlib *(`ruby-rails-8` aqui = API-only)*
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

Auto-detects from: `package.json`, `Cargo.toml`, `requirements.txt`, `pyproject.toml`, `composer.json`, `Gemfile`.

Recognizes: NestJS · React · Vue · Nuxt · Rust/Axum · FastAPI · **Rails** (`Gemfile`) · Laravel · **MCP Server** (`@modelcontextprotocol/sdk`, `FastMCP`). Rails e Laravel são classificados como estrutura **`mvc`**.

---

### `dare reverse` ← brownfield (Phase 0)

Reverse-engineer an existing codebase into a Phase-0 understanding **without touching the source**.
Deterministically detects module boundaries, sizes them by LOC and infers the dependency graph.

```bash
cd my-legacy-project
dare reverse                 # → DARE/IDEIA.md + REVERSE/module-*.md + reverse-facts.json + architecture.excalidraw
dare reverse --check         # detection only, no files
dare reverse --modules api,auth
dare reverse --no-excalidraw
```

**Confidence & traceability.** The `/dare-reverse` skill marks each claim 🟢 CONFIRMED (with
`file:line` evidence) · 🟡 INFERRED · 🔴 GAP. Then:

```bash
dare reverse --report        # deterministic confidence index from the markers (not LLM self-scored)
```

→ `confidence-report.md` + `traceability/code-spec-matrix.md`; the 🔴 become `gaps.md` + `questions.md`.

**Deep extraction (framework-agnostic per language):**

```bash
dare reverse --deep          # + ERD, API surface, C4, domain-rules, state-machines, permissions
```

The CLI extracts the data model (`erd.md`) and endpoints (`api-surface.md`) deterministically from
**SQL inline (DDL + query tables), Prisma, ORMs and plain types/classes/structs** — so it works on
legacy projects **with or without a framework** (e.g. raw-PDO PHP without Laravel). Routes cover
multiple dialects per language (Express/Nest/Fastify, Laravel/Slim/Symfony, FastAPI/Flask/Django,
Rails/Sinatra, Gin/stdlib, Axum).

---

### `dare dna` ← brownfield

Extract the legacy codebase's **conventions** so the agent follows the house style instead of generic
defaults — for legacy you can't rewrite.

```bash
cd my-legacy-project
dare dna                     # → DARE/PROJECT-DNA.md + dna-facts.json
dare dna --check
```

Detects lint/format tooling, naming conventions, architecture layers, test framework, key libraries
(ORM/HTTP/auth/validation) and commit convention. The `/dare-dna` skill turns the facts into
actionable rules. Reuses `reverse-facts.json` if `dare reverse` already ran.

---

### `dare migrate` ← brownfield (Phase 2)

Plan a **safe migration** to a target stack, with **Gherkin parity scenarios** that guarantee
behavior is preserved. Requires `dare reverse` first.

```bash
cd my-legacy-project
dare migrate --to go-gin     # or rust-axum, node-nestjs, python-fastapi, php-laravel, ruby-rails-8…
dare migrate --check
```

Consumes `IDEIA` + `DNA`, inherits the **blocking gaps** (🔴) as risks, and generates
`DARE/MIGRATION/MIGRATION.md` (paradigm, strategy, risk register, target architecture, cutover) +
`parity/<module>.feature` (the behavioral acceptance contract). The `/dare-migrate` skill fills the
strategy and the real parity scenarios.

> **Brownfield loop:** `reverse` (the *what*) → `dna` (the *how*) → `migrate` (reimplement with
> parity) → `design`/`blueprint`/`execute` on the target stack.

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

#### Autonomous mode (`--agent`)

```bash
dare execute --agent --dry-run --dag DARE/dare-dag.yaml --require-approval none
dare execute --agent --budget-tokens 50000 --best-of 3
```

| Flag | Default | Description |
|------|---------|-------------|
| `--agent` | off | Driver executa cada task (mock/claude) |
| `--budget-tokens <n>` | unlimited | Teto de tokens (soma best-of-N) |
| `--require-approval` | `rank` | `rank` pausa entre ranks; `none` autônomo |
| `--on-fail` | `escalate` | `replan` \| `escalate` \| `stop` |
| `--dry-run` | off | Usa `mockDriver` sem rede |

Exit codes: `6` quando o guard bloqueia no pré-flight (`guard.enabled`).

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

Lay down a stack's DARE-shaped source on **an existing project** (created in
older versions or with `--skip-bootstrap`). Reads `dare.config.json` and runs
the internalized generator for the configured stack — the same one `dare init`
uses. Frontend stacks (`react` / `vue` / `rust-leptos`) still use their Vite /
Cargo scaffold.

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

### `dare review` ← new in v2.17.0

**Anti-stub gate.** Audita os arquivos que uma task tocou e detecta padrões de "fake completeness": `TODO`/`FIXME`, stubs (`throw new Error('not implemented')`, `todo!()`, `NotImplementedError`), funções vazias, retorno-fantasma (`return null` como única statement), mocks fora de testes (`jest.fn`, `vi.mock`, `sinon.stub`, `MagicMock`), comentários-placeholder (`// implement later`).

A camada estática (regex, determinística) é só metade. A IDE agent pode rodar a skill `dare-review` / `review-task` para validar critério-a-critério se a implementação atende a spec, emitir um `SemanticVerdict` JSON, e o CLI funde os dois numa única decisão.

```bash
# Audita os arquivos listados em DARE/EXECUTION/task-034.md
dare review task-034

# Em CI:
dare review task-034 --strict --format json

# Lista explícita de arquivos:
dare review task-034 --files src/auth/login.ts src/auth/register.ts

# Funde com verdito semântico do agente:
dare review task-034 --from-agent .dare/verdict-task-034.json
```

**Gate opt-in no Ralph Loop:** com `review.onComplete: true` em `dare.config.json`, `dare execute --complete <id>` bloqueia DONE se a review falhar. Para projetos novos (`dare init` v2.17+) já vem ligado; projetos legados permanecem off até o dev flipar.

### `dare refine` ← new in v2.17.0

**Anti-monstro.** Mede complexidade de uma task e, opcionalmente, propõe quebra em sub-tasks menores. Heurística determinística pesa # arquivos, # funções/endpoints, # testes, # dependências, keywords "pesadas" (refactor/migrate/integrate/multiple) — produz um score em LOW (0–5) / MED (6–12) / HIGH (13–20) / CRITICAL (21+).

```bash
# Apenas mede e reporta:
dare refine task-034

# Mede + propõe quebra em sub-tasks (task-034a, task-034b, ...):
dare refine task-034 --split

# Anota TASKS.md marcando a task para split (o agente regenera as specs):
dare refine task-034 --split --apply

# Em CI: exit code 2 se HIGH/CRITICAL:
dare refine task-034 --strict
```

A camada determinística agrupa arquivos por diretório raiz. A IDE agent (skills `dare-refine` / `refine-task`) refina o split semanticamente — por camada (Model/Controller/Service), por endpoint, por feature, refactor-then-feature, migration-then-code.

Thresholds configuráveis em `dare.config.json`:

```jsonc
{
  "refine": {
    "thresholds": { "low": 5, "med": 12, "high": 20 }
  }
}
```

### `dare update` ← new in v2.17.0

Sync the **project's DARE setup** (templates, slash commands, skills, schema)
with the version of the CLI currently installed. Useful when you upgrade the
CLI globally (`npm install -g @dewtech/dare-cli@latest`) and want a previous
project to pick up the new improvements — **without touching your DESIGN /
BLUEPRINT / TASKS / dare-dag.yaml artifacts**.

Different from upgrading the CLI itself: `npm update -g @dewtech/dare-cli`
changes the binary on your machine; `dare update` changes the *project files
on disk* to match what that binary now ships.

```bash
dare update                  # interactive (recommended)
dare update --dry-run        # preview: shows changelog + affected files, writes nothing
dare update --yes            # CI: apply, preserve customizations, no prompts
dare update --force          # also overwrite files the dev customized (dangerous)
dare update --target 2.17.0  # update to a specific release instead of the installed CLI
```

**What it does:**

1. Reads `version` from `dare.config.json` (the project's last-known DARE version).
2. Loads `templates/UPDATE-MANIFEST.json` (ships with the CLI) and lists every
   release between the project's version and the CLI's version.
3. Prints the changelog for each pending release and the list of files
   affected for your IDE (cursor / claude-code / antigravity / hybrid).
4. For each file, classifies the situation:
   - **identical** → skip
   - **missing** → create
   - **apply** → file matches the previous template hash, safe to overwrite
   - **customized** → file diverges from the previous template; prompt
     (`keep` / `replace`) unless `--yes` (keep) or `--force` (replace).
5. Backs up every affected file to `.dare/backup-<from-version>/` before
   writing.
6. Runs any schema migrations declared by the release (e.g. renaming a
   config field).
7. Stamps `version` and `updatedAt` in `dare.config.json`.

**Adding entries when you cut a release:** each new CLI version that ships
template changes needs a corresponding entry in `templates/UPDATE-MANIFEST.json`
listing `changes` (added / modified / removed / renamed) and optional
`migrations`. The applier filters changes by `appliesTo: [ide]`, so a
template that's cursor-only won't be installed in a Claude Code project and
vice versa.

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
| **Backend (API-only)** | Ruby on Rails 8 · Rust/Axum · Node.js/NestJS · Python/FastAPI · PHP/Laravel · Go/Gin · Go/stdlib |
| **MVC (full-stack)** | Ruby on Rails 8 (full application) · PHP/Laravel |
| **Frontend** | React 18+ · Vue 3+ · Leptos fullstack (Rust SSR+WASM) · Leptos CSR (Rust WASM) |
| **MCP Server** | TypeScript/Node.js · Python — stdio / SSE / HTTP Stream |
| **IDE / Agent** | Claude Code · Cursor · Antigravity · Hybrid |

---

## Skills disponíveis (v3.0.0)

**32 skills em paridade total** nas 3 IDEs (Antigravity, Claude Code, Cursor). Cada skill existe em formato nativo de cada uma e é entregue por `dare init` / `dare update`.

| Categoria | Skills | Exemplos |
|---|---|---|
| **Método DARE** | 6 | `dare-design`, `dare-blueprint`, `dare-tasks`, `dare-execute`, `dare-review`, `dare-refine` |
| **DAG runner** | 4 | `dare-dag-build`, `dare-dag-run`, `dare-dag-runner`, `dare-dag-viz` |
| **Transversais** | 6 | `dare-ax`, `dare-layered-design`, `dare-llm-integration`, `dare-frontend-design`, `dare-realtime`, `dare-quality-telemetry` |
| **Stack / Tools** | 8 | `dare-docker`, `dare-security`, `dare-telemetry`, `dare-bugfix-design`, `dare-feature-design`, `dare-rust-workspace`, `dare-rust-leptos`, `dare-laravel-api` |
| **Stacks novas v3.0.0** | 5 | `dare-nestjs-api`, `dare-fastapi-api`, `dare-go-gin-api`, `dare-mcp-server`, `dare-rails-api` |
| **Brownfield** | 3 | `dare-reverse`, `dare-dna`, `dare-migrate` |

Ver tabela cruzada completa em [`docs/skills/INDEX.md`](https://github.com/dewtech-technologies/dare-method/blob/main/docs/skills/INDEX.md).

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
| CLI `dare` | `init`, `design`, `blueprint`, `execute`, `discover`, `reverse`, `dna`, `migrate` |
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
