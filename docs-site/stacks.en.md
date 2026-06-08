# Stacks & DNA DARE

DARE generates **greenfield** projects from a catalog of **11 stacks** — 7 backend and 4 MCP servers. Each generator (`StackScaffold`) is registered **lazily** in the registry (`packages/cli/src/stacks/registry.ts`): the module is only loaded when you choose that stack, keeping `dare --help` cold and fast.

Regardless of the stack, every generator delivers the same invariant set of 7 artifacts — the **DNA DARE** — validated in a test (`dna.spec.ts`).

## The 11 stacks

### Backend (7)

| Stack | Status | Framework | Main libs |
|---|---|---|---|
| `ruby-rails-8` | stable | Rails 8 | rswag (OpenAPI), Action Cable (WS), RFC 7807 Problem Details, ActiveRecord, `rake dare:metrics` |
| `node-nestjs` | stable | NestJS 10 | Prisma + Postgres, JWT auth, Swagger at `/openapi.json`, Throttler (rate limit), class-validator + class-transformer, Pino |
| `python-fastapi` | stable | FastAPI | Pydantic v2, SQLAlchemy 2.0 + Alembic, slowapi (rate limit), uvicorn[standard] |
| `php-laravel` | stable | Laravel 11 | Sanctum + FormRequest, Eloquent, Reverb (WS) + Pail, ThrottleRequests, l5-swagger, LlmProvider (Dummy + OpenAI), Pest |
| `rust-axum` | stable | Axum 0.7 | Tokio, tower-http (CORS/trace) + tower-governor (rate limit), utoipa (OpenAPI), sqlx + Postgres, `axum::extract::ws` |
| `go-gin` | stable | Gin | sqlc + pgx, golang-jwt + bcrypt, gorilla/websocket, `golang.org/x/time/rate`, swag (OpenAPI) |
| `go-stdlib` | stable | net/http 1.22 ServeMux | pgx + sqlc-compatible schema, golang-jwt + bcrypt, `golang.org/x/time/rate`, `github.com/coder/websocket` (minimal-deps philosophy) |

### MCP — Model Context Protocol (4)

| Stack | Status | SDK / Runtime | Transports |
|---|---|---|---|
| `mcp-node-ts` | stable | `@modelcontextprotocol/sdk` (TypeScript) | stdio · sse · http (Streamable HTTP) |
| `mcp-python` | stable | `mcp[cli]` (FastMCP, Python 3.11+) | stdio · sse · http (via uvicorn) |
| `mcp-rust` | beta | `rmcp` (official Rust SDK) | stdio · sse · http (via axum) |
| `mcp-go` | beta | `github.com/mark3labs/mcp-go` (community SDK) | stdio · sse · http |

!!! note "MCP transport"
    All three transports come together in every MCP generator. The effective transport is chosen at runtime by the `--transport` flag or the `MCP_TRANSPORT` env; the generator pre-selects the user's default (`opts.mcp.transport`) so that `start` "just works".

!!! tip "Registry ordering"
    `list()` sorts by category (`backend` before `mcp`) and then by id, deterministically. `resolve(id)` does the lazy import and memoizes it; an invalid id raises `UnknownStackError` with the list of available ids.

---

## The DNA DARE — 7 invariant artifacts

Every `StackScaffold` calls `emitDefaults()` early in `generate()` to satisfy the DNA contract and then **overrides** each artifact with the stack-specific version. The `DareDnaArtifact` type and the `DARE_DNA` constant (in `stacks/types.ts`) list the 7; the `dna.spec.ts` test fails if any is missing.

| # | Artifact (`DareDnaArtifact`) | What it is | How it is guaranteed |
|---|---|---|---|
| 1 | **Layered Design** | Separation into layers (handlers/controllers → services → repositories → models) | Structure emitted by each generator (common to all 11 stacks). |
| 2 | **`llms.txt`** | Manifest for AI agents (setup, commands, endpoints) | `emit('llms-txt')` → `llms.txt`. |
| 3 | **OpenAPI** | HTTP contract (`openapi.json` / `/openapi.json` at runtime) | `emit('openapi')` → `openapi.json` (3.1.0 skeleton; generator overrides). |
| 4 | **`--json`** | JSON output flag in the generated CLI | **Declarative**: the generator declares it via `dnaEmitted`; validated by a structural grep over the generated source. |
| 5 | **Rate limit** | Per-minute limit middleware, driven by env (`RATE_LIMIT_PER_MIN`) | **Declarative**: same as `--json`; validated by grep. |
| 6 | **`.env.example` without secrets** | Environment example without real credentials | `emit('env-example')` validates each value against `SECRET_PATTERNS` (base64 ≥40, hex ≥32, PEM, `sk-…`, `AKIA…`) and throws `EnvSecretError` if it matches. |
| 7 | **`.dare/skills.yml`** | Registry of the stack skill for the IDE | `emit('skills-yml')` maps stack → skill (e.g.: `skill-nestjs-api`, `skill-fastapi-api`; all MCP → `skill-mcp-server`). |
| — | **`.github/workflows/dare-ci.yml`** | CI (audit + lint + test) | `emit('github-ci')` → workflow with audit/lint/test jobs (per-ecosystem placeholders). |

!!! info "Declarative vs. emitted"
    Five artifacts are **emitted** to disk (`llms-txt`, `openapi`, `env-example`, `skills-yml`, `github-ci`). Two — `cli-json-flag` (the `--json` flag) and `rate-limit` — are **declarative**: the generator returns that it satisfied them in `dnaEmitted`, and `dna.spec.ts` confirms via grep over the generated code. `emitDefaults()` returns the complete `DARE_DNA` set (all 7).

### Secret protection in `.env.example`

`validateEnvExample()` walks the file line by line, ignores comments/empty lines, and rejects any **value** that matches a secret pattern:

```ts
export const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /[A-Za-z0-9+/]{40,}={0,2}/,            // base64 ≥40 chars (provável chave)
  /[a-f0-9]{32,}/,                       // hex ≥32 chars (hash / chave)
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----/, // bloco PEM
  /sk-[A-Za-z0-9]{40,}/,                 // chave estilo OpenAI
  /AKIA[0-9A-Z]{16}/,                    // AWS access key
];
```

Placeholder values (`replace-me-in-prod`, `postgresql://user:pass@localhost...`) pass; real secrets make the build fail with `EnvSecretError` pointing to the line.

---

## Toolchain (`auto` / `native` / `docker`)

Every generator receives a `ScaffoldOpts.toolchain` of type `ToolchainMode`:

| Mode | Behavior |
|---|---|
| `native` | Uses the tools installed locally (Node, Python, Rust, Go, etc.). |
| `docker` | Packages the toolchain in a container — without depending on what is on the machine. |
| `auto` | Decides between `native` and `docker` according to the environment. |

Each `generate()` also receives: `dir` (target directory, already created and empty), `projectName` (kebab-case slug), `features` (subset of `DARE_DNA`, default = the 7), optional `llm` (providers), optional `realtime` (`ws`/`sse`), `mcp` (transport — required for the `mcp` category) and `isMonorepo`. It returns `ScaffoldResult`: `filesWritten`, `postInstallSteps` (commands to run next), `warnings` and `dnaEmitted` (the satisfied DNA artifacts — checked by `dna.spec.ts`).

```mermaid
flowchart TD
    G[generate&#40;opts&#41;] --> E[emitDefaults&#40;&#41;<br/>7 DNA artifacts]
    E --> O[stack-specific overlay<br/>real OpenAPI, llms.txt, etc.]
    O --> R[ScaffoldResult<br/>filesWritten · postInstallSteps · dnaEmitted]
    R --> V[dna.spec.ts validates the 7]
```
