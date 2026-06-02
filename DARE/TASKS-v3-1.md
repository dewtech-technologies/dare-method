# TASKS — v3.1 Stack Generators Internalizados

> Resumo legível de [dare-dag-v3-1.yaml](dare-dag-v3-1.yaml). DAG completo (com `depends_on`,
> `parallel_group`, `files`, `gates`) está no YAML. Specs executáveis por task em
> [`EXECUTION/`](EXECUTION/). License: MIT.

**Branch:** `feat/v3.1-stack-generators` · **Target:** v3.1.0 · **30 tasks em 8 fases**

---

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade dominante |
|---|---|---|---|
| 1 — Foundation | T-001 a T-005 | só dentro de T-002/3/4 (dep comum em T-001) | LOW–MED |
| 2 — Rails internalize | T-010 a T-013 | não (sequencial) | LOW–MED |
| 3 — Rails no init | T-020, T-021 | não | HIGH |
| 4 — Backend scaffolders | T-030 a T-035 | **SIM** (6 paralelos) | HIGH |
| 5 — MCP scaffolders | T-040 a T-043 | **SIM** (4 paralelos) | HIGH |
| 6 — Remoção | T-050 a T-052 | não (sequencial) | LOW |
| 7 — Segurança | T-060 a T-063 | sim entre si (dep comum em T-052) | LOW–MED |
| 8 — Release | T-070 a T-076 | T-070/71/72 paralelos | LOW–MED |

**Caminho crítico:** `T-001 → T-002 → T-005 → T-010 → T-011 → T-012 → T-013 → T-020 → T-021 → {T-030..T-043} → T-050 → T-051 → T-052 → T-063 → T-073 → T-076`

Total: **17 saltos sequenciais**, com 10 scaffolders paralelizáveis no meio.

---

## Fase 1 — Foundation (5 tasks)

| ID | Título | Comp. | Arquivos | Dep |
|---|---|---|---|---|
| T-001 | `types.ts` (StackScaffold, ScaffoldOpts, DareDnaArtifact) | LOW | `src/stacks/types.ts` | — |
| T-002 | `registry.ts` (vazio + resolve/list/has + errors) | MED | `src/stacks/registry.ts` + spec | T-001 |
| T-003 | `dna-emitter.ts` (emit + emitDefaults dos 7) | MED | `src/stacks/dna-emitter.ts` + spec | T-001 |
| T-004 | `template-engine.ts` (handlebars + nunjucks + mustache + raw) | MED | `src/stacks/template-engine.ts` + spec | T-001 |
| T-005 | `dna.spec.ts` skeleton (fail-when-empty) | LOW | `src/stacks/__tests__/dna.spec.ts` | T-002, T-003 |

## Fase 2 — Internalizar Rails 8 (4 tasks)

| ID | Título | Comp. | Arquivos | Dep |
|---|---|---|---|---|
| T-010 | Snapshot baseline Rails (fixture) | LOW | `__tests__/parity-rails.fixture.json` | T-005 |
| T-011 | Mover RailsScaffold + templates para `src/stacks/ruby-rails-8/` | MED | `src/stacks/ruby-rails-8/**`, `templates/stacks/ruby-rails-8/**`, ajuste em `new.ts` | T-010 |
| T-012 | Registrar Rails no STACK_REGISTRY | LOW | `src/stacks/registry.ts` | T-011 |
| T-013 | `parity-rails.spec.ts` — diff zero | MED | `__tests__/parity-rails.spec.ts` | T-012 |

## Fase 3 — Rails no `init` (2 tasks)

| ID | Título | Comp. | Arquivos | Dep |
|---|---|---|---|---|
| T-020 | Refatorar `init.ts`: prompt via registry + dispatcher | **HIGH** | `src/commands/init.ts` | T-013 |
| T-021 | `init.integration.spec.ts` cobre Rails via init | MED | `src/commands/__tests__/init.integration.spec.ts` | T-020 |

## Fase 4 — Scaffolders backend (6 tasks paralelas)

Todas dependem **só** de T-021. Após esta fase, `dna.spec.ts` valida 6 stacks (+ Rails = 7).

| ID | Stack | Comp. | Bibliotecas/templates chave |
|---|---|---|---|
| T-030 | `node-nestjs` | HIGH | NestJS 10 + Prisma + Swagger + Throttler + JWT + class-validator |
| T-031 | `python-fastapi` | HIGH | FastAPI + Pydantic + SQLAlchemy + Alembic + python-jose + slowapi |
| T-032 | `php-laravel` | HIGH | Laravel 11 + Sanctum + FormRequest + Reverb + Pail + Eloquent + ThrottleRequests |
| T-033 | `rust-axum` | HIGH | Axum + tower::limit + utoipa + jsonwebtoken + sqlx + axum::extract::ws |
| T-034 | `go-gin` | HIGH | Gin + sqlc + swag + golang-jwt + gorilla/websocket + gin-contrib/limiter |
| T-035 | `go-stdlib` | HIGH | net/http 1.22 ServeMux + sqlc + golang-jwt + nhooyr/websocket + custom rate limit |

## Fase 5 — Scaffolders MCP (4 tasks paralelas)

Todas dependem **só** de T-021. Após esta fase, `dna.spec.ts` valida 11 stacks (DNA gate completo).

| ID | Stack | Comp. | SDK + transports |
|---|---|---|---|
| T-040 | `mcp-node-ts` | HIGH | `@modelcontextprotocol/sdk` + 3 transports (stdio/sse/http) em arquivos separados |
| T-041 | `mcp-python` | HIGH | `mcp[cli]` + 3 transports |
| T-042 | `mcp-rust` | HIGH | `rmcp` + 3 transports |
| T-043 | `mcp-go` | HIGH | `mark3labs/mcp-go` + 3 transports |

## Fase 6 — Remoção definitiva (3 tasks sequenciais)

| ID | Título | Comp. | Dep |
|---|---|---|---|
| T-050 | Deletar `new.ts` + desregistrar do `bin/dare.ts` | LOW | T-030..T-043 (todos os scaffolders prontos) |
| T-051 | Apagar `packages/stacks/` + remover de `pnpm-workspace.yaml` | LOW | T-050 |
| T-052 | Remover workspace dep do `packages/cli/package.json` | LOW | T-051 |

## Fase 7 — Auditoria de segurança (4 tasks)

Todas dependem só de T-052; paralelas entre si.

| ID | Título | Comp. |
|---|---|---|
| T-060 | Sub-spec DNA: `env-example-no-secrets` (regex contra base64/hex) | MED |
| T-061 | Step de gitleaks sobre `templates/stacks/**` no CI principal | MED |
| T-062 | Sub-spec DNA: `github-ci-has-audit-job` nos 11 stacks gerados | MED |
| T-063 | `pnpm audit --audit-level=high` gate no CI principal | LOW |

## Fase 8 — Docs + bump + release (7 tasks)

| ID | Título | Comp. | Dep |
|---|---|---|---|
| T-070 | README.md tabela de 11 stacks | LOW | T-063 |
| T-071 | ROADMAP.md "(1)" → "(11)" + mover items entregues | LOW | T-063 |
| T-072 | CHANGELOG `[3.1.0]` (added/fixed/breaking/structural) | MED | T-063 |
| T-073 | Bump versions + `files` field | LOW | T-070, T-071, T-072 |
| T-074 | `.github/workflows/publish-smoke.yml` | MED | T-073 |
| T-075 | Validar tarball ≤ 3 MB | LOW | T-073 |
| T-076 | Tag v3.1.0 + push + Release + smoke | MED | T-074, T-075 |

---

## Como rodar

```powershell
# Sequencial (1 task por vez, Ralph Loop):
dare dag-run --dag DARE/dare-dag-v3-1.yaml

# Paralelo nos parallel_groups (worktrees isoladas):
dare dag-run-parallel --dag DARE/dare-dag-v3-1.yaml --rank-only backend-scaffolders
dare dag-run-parallel --dag DARE/dare-dag-v3-1.yaml --rank-only mcp-scaffolders

# Task individual:
dare execute --task task-030 --dag DARE/dare-dag-v3-1.yaml

# Status:
dare dag-viz --dag DARE/dare-dag-v3-1.yaml --format excalidraw
```

## Gates globais (todos os PRs intermediários precisam passar)

- `pnpm -r build` verde
- `pnpm -r test` verde
- `pnpm -r lint` verde
- `tsc --noEmit` verde
- `pnpm audit --audit-level=high` zero matches
- DNA gate atualizado conforme cada fase (Fase 1: registry vazio = fail-when-empty; após Fase 5: 11 stacks = todos verdes)

## Anti-stub (regra de ouro do BLUEPRINT seção 11)

Nenhum PR pode conter: `TODO`, `FIXME`, `XXX`, `// stub`, `# placeholder`, `throw new Error('not implemented')`, `expect(true).toBe(true)`, template com apenas comentário. Lint customizado em pré-commit e CI.
