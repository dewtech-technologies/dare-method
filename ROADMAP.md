# DARE Method — Roadmap

> **Status atual:** v3.0.0 (em release)
> **Última atualização:** 2026-05
> **Licença:** MIT (D-001 — MIT permanente)

Este documento descreve o que está **shipped**, o que está **em desenvolvimento ativo** e o que está **planejado**. Tudo o que aparece aqui é executável — não inclui ideias vagas.

---

## ✅ Shipped — v3.0.0

### Skills em paridade nas 3 IDEs (29/29)

Toda skill listada existe em formato nativo de Antigravity (`.agents/skills/<name>/SKILL.md`), Claude Code (`.claude/commands/<name>.md`) e Cursor (`.cursor/rules/skill-<name>.mdc`). Ver [`docs/skills/INDEX.md`](docs/skills/INDEX.md) para tabela cruzada.

**Método DARE (6):** `dare-design` · `dare-blueprint` · `dare-tasks` · `dare-execute` · `dare-review` · `dare-refine`

**DAG runner (4):** `dare-dag-build` · `dare-dag-run` · `dare-dag-runner` · `dare-dag-viz`

**Transversais (6):** `dare-ax` · `dare-layered-design` · `dare-llm-integration` · `dare-frontend-design` · `dare-realtime` · `dare-quality-telemetry`

**Stack/Tools (8):** `dare-bugfix-design` · `dare-feature-design` · `dare-docker` · `dare-security` · `dare-telemetry` · `dare-rust-workspace` · `dare-rust-leptos` · `dare-laravel-api`

**Stacks novas (5):** `dare-nestjs-api` · `dare-fastapi-api` · `dare-go-gin-api` · `dare-mcp-server` · `dare-rails-api`

### Implementations (3)

- ✅ **Antigravity** — Google Antigravity IDE com Agent Manager nativo
- ✅ **Claude Code** — Anthropic Claude Code CLI com slash commands
- ✅ **Cursor IDE** — Cursor com rules + commands

### Stacks com gerador completo (1)

- ✅ **Ruby on Rails 8** — `packages/stacks/ruby-rails-8/` com PostgreSQL, Solid Queue, Action Cable, ViewComponent, Kamal 2

### Engine

- ✅ **CLI `dare`** consolidado em `@dewtech/dare-cli` (era 4 pacotes na v1.x)
- ✅ **GraphRAG** com SQLite + FTS5
- ✅ **DAG runner** com Kahn's algorithm para paralelismo lógico
- ✅ **MCP server** local (`dare-mcp-server`)
- ✅ **Anti-stub gates** — `dare review` e `dare refine` no Ralph Loop
- ✅ **`dare update`** — sincroniza projetos antigos com a versão atual sem perder DESIGN/BLUEPRINT/TASKS

---

## 🚧 Em desenvolvimento ativo — v3.1.x

Próximas releases minor que **não quebram nada**.

### Stacks com gerador completo (além do Ruby on Rails 8)

Stacks atualmente disponíveis **só como skill de IDE** (`dare-*-api`) precisam virar **stack de scaffold** em `packages/stacks/`:

- [ ] **node-nestjs** — gerador completo com Prisma + Swagger
- [ ] **python-fastapi** — gerador com SQLAlchemy + Alembic
- [ ] **go-gin** — gerador com sqlc + zerolog
- [ ] **mcp-server** — TypeScript e Python templates
- [ ] **php-laravel** — gerador com Eloquent + Sanctum

A diferença: hoje você pode usar a skill para gerar código consistente; com a stack, `dare init --stack node-nestjs` provisiona projeto inteiro.

### Frontend stacks

- [ ] **react** stack completa (Vite + Zustand + React Query)
- [ ] **vue** stack completa (Vite + Pinia + Vue Query)
- [ ] **rust-leptos** / **rust-leptos-csr** já existem como skill; falta finalizar como stack

### Registry remoto

- [ ] Publicar `https://registry.dare.dewtech.tech` em produção (backend Vercel Functions já está em `packages/registry/`)
- [ ] Permitir `dare skill publish --remote --token <github-pat>` de qualquer dev da comunidade

---

## 🔮 Planejado — v3.2.x+

### Novas implementations (IDEs/agentes)

- [ ] **VS Code + Continue** — extensão DARE para o VS Code
- [ ] **JetBrains AI Assistant** — plugin para IntelliJ/PyCharm/WebStorm
- [ ] **Zed Editor** — quando o Agent Mode estabilizar

### Site institucional + docs

- [ ] **dare.dewtech.tech** — landing page (em `ui-dewtech-institucional/dare/`)
- [ ] **docs.dare.dewtech.tech** — MkDocs Material (em `ui-dewtech-institucional/dare-docs/`)
- [ ] Versionamento de docs (v2.x histórico vs v3.x atual)

### DARE Cloud

- [ ] GraphRAG remoto compartilhado entre time
- [ ] DAG distribuído (múltiplos agents executando em paralelo em workers diferentes)
- [ ] Dashboards de telemetria de quality (M-01 a M-04)

---

## ❌ Não está no roadmap (esclarecimento)

- ❌ **Migração para AGPL v3** — RFC formalmente rejeitada. DARE permanece **MIT permanente** (D-001).
- ❌ **Versão paga / pro / enterprise** — toda funcionalidade do CLI continua MIT. Monetização Dewtech é via consultoria, workshops e SaaS (DARE Cloud quando lançar).
- ❌ **Lock-in de IDE** — qualquer IDE/agente que implemente o protocolo de skills pode rodar DARE.

---

## 📚 Histórico de releases

Resumo cronológico de todas as releases. Detalhes completos em [`CHANGELOG.md`](CHANGELOG.md).

### v3.0.0 (2026-05) — Skill parity & stacks novas

Release **major**: 29 skills em paridade total nas 3 IDEs. +45 arquivos de skill em `implementations/`. 5 stacks novas como skill (`dare-nestjs-api`, `dare-fastapi-api`, `dare-go-gin-api`, `dare-mcp-server`, `dare-rails-api`). Split granular do DAG (build/run/runner/viz) padronizado entre IDEs. Purga completa de menções AGPL obsoletas (D-001 ratifica MIT permanente). Novo `ROADMAP.md` e `docs/skills/INDEX.md`.

### v2.17.0 (2026-05) — dare update, dare review, dare refine

Três comandos novos para resolver três problemas reais identificados em uso. `dare update` sincroniza projetos antigos com a versão atual sem reescrever DESIGN/BLUEPRINT/TASKS. `dare review` é gate anti-stub: detecta TODO/FIXME, stubs, mocks fora de tests, funções vazias. `dare refine` é gate anti-monstro: mede complexidade e propõe quebra em sub-tasks. Anti-Stub Contract reforçado nos prompts de geração.

### v2.16.0 (2026-05) — Visualização Excalidraw

`dare dag viz` agora gera diagrama interativo `.excalidraw` a partir de `dare-dag.yaml`: cores por complexidade (LOW azul, MED laranja, HIGH rosa), status visual (PENDING/RUNNING/DONE/FAILED), swim lanes por rank, setas para dependências. Design tokens documentados em `docs/DESIGN-TOKENS-EXCALIDRAW.md`.

### v2.15.0 (2026-05) — Fixes Rust monorepo

Package names corretos por crate em monorepo Rust (sem colisão de nomes). `Cargo.lock` removido após `cargo fetch` em bootstraps Leptos.

### v2.14.0 (2026-05) — Templates sync fix

Fix sync de templates: `dare init` agora instala corretamente os comandos de blueprint com phase separation (tasks só após aprovação humana via `/generate-tasks` / `/dare-tasks`).

### v2.13.0 (2026-05) — Phase separation + Security

`/dare-blueprint` e `/generate-blueprint` geram apenas `BLUEPRINT.md` (tasks vão para comandos separados). Templates DESIGN/BLUEPRINT reestruturados com RF/RNF/RS numerados, stakeholders, métricas de sucesso, DOD por fase. Ralph Loop expandido com auditoria de dependências (npm/cargo/pip/composer audit) — CVE HIGH/CRITICAL bloqueia task. Skill `/dare-security` reescrita: OWASP A01–A10 completo, supply chain, prompt injection. Prompt `cratePrefix` para layout multi-crate Rust.

### v2.12.0 (2026-05) — Workspace layout

Estrutura Rust monorepo corrigida para `crates/server` + `crates/web` (padrão Cargo workspace). `--vcs none` automático em crates membros. Opção de layout single-crate vs multi-crate no `dare init`.

### v2.11.0 (2026-05) — Leptos 0.7

Suporte a Leptos 0.7 — fullstack (cargo-leptos + Axum) e CSR (trunk). Skill `/dare-rust-leptos` com idioms, antipatterns e templates de tasks.

### v2.10.0 (2026-05) — MCP Server stacks

Tipo de projeto `mcp-server` — templates TypeScript e Python com stdio/SSE/HTTP Stream. `dare discover` detecta projetos MCP existentes. Suporte Claude Code melhorado.

### v2.9.0 (2026-05) — Skill rust-workspace

Skill `rust-workspace` (decisão single-crate vs multi-crate + plano de migração).

### v2.8.0 (2026-05) — Go stdlib

Stack `go-stdlib` (Go puro, sem framework — só `net/http`).

### v2.7.1 (2026-05) — go-gin Docker fix

Corrigido: `dare init` falhava com `go-gin` em modo Docker.

### v2.7.0 (2026-05) — Toolchain choice

Escolha de toolchain no `dare init` e `dare bootstrap`: Auto / Native only / Docker only. Decisão salva em `dare.config.json`.

### v2.6.x (2026-05) — Windows fixes

Fixes para `dare init` em React/Vue (Windows) e Python (Windows).

### v2.5.0 (2026-05) — Docker fallback + Go

Fallback Docker automático no `dare init` e `dare bootstrap` para qualquer stack. Stack `go-gin` adicionada.

### v2.4.x (2026-05) — dag viz + info

`dare dag viz` (visualização do DAG estático em formato Mermaid). `dare info` para diagnóstico do ambiente.

### v2.3.x (2026-05) — graph commands

Comando `dare graph` para explorar o GraphRAG local.

### v2.2.0 (2026-05) — execute orquestrador

**BREAKING**: `dare execute` virou orquestrador puro (sem chamada de LLM própria). A IDE/agente é o executor; o CLI coordena estado e monta prompts.

### v2.1.0 (2026-05) — Melhorias iniciais

Primeiras melhorias pós-consolidação da v2.0.

### v2.0.0 (2026-05) — Consolidação em pacote único

**BREAKING**: 4 pacotes (`@dewtech/dare-cli`, `@dewtech/dare-core`, `@dewtech/dare-graphrag`, `@dewtech/dare-mcp-server`) consolidados em **um único** `@dewtech/dare-cli`. Os 3 antigos viraram deprecated no npm.

### v1.0.0 (2026-04) — Release pública

Primeira release pública do DARE Method como projeto open source. CLI `dare` (`init`, `design`, `blueprint`, `execute`). Templates para Rust/Axum, Node/NestJS, Python/FastAPI, PHP/Laravel. Templates frontend React 18+ e Vue 3+. MCP server local. GraphRAG SQLite. Publicação no npm.

---

## Como contribuir

Para skills novas: ver [`docs/skills/INDEX.md`](docs/skills/INDEX.md) (template padrão por IDE).
Para PRs: ver [`CONTRIBUTING.md`](CONTRIBUTING.md).
Para tracking detalhado: GitHub Issues + Projects.

---

**Filosofia de versionamento (D-002):** Antes de qualquer tag SemVer, este ROADMAP, o `README.md` raiz e o `packages/cli/README.md` são atualizados juntos.
