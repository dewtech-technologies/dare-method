# DARE Method — Roadmap

> **Status atual:** v3.12.0
> **Última atualização:** 2026-06
> **Licença:** MIT (D-001 — MIT permanente)

Este documento descreve o que está **shipped**, o que está **em desenvolvimento ativo** e o que está **planejado**. Tudo o que aparece aqui é executável — não inclui ideias vagas.

---

## ✅ Shipped — v3.12.0

**Terminal Agent Parity** — um comando, dois gatilhos (terminal ↔ chat).

- ✅ **`dare <cmd> --ai`** em 8 comandos semânticos com **`--json`** (`EnrichmentResult`)
- ✅ **Resolução única de provider** — `ai/resolve.ts` (`--provider` > config > default)
- ✅ **Drivers `cursor` e `antigravity`** em `dare execute --agent`
- ✅ **Apply completo** — `migrate --ai` e `review --ai` mesclam artefatos finais
- ✅ **`dare ai doctor`** — capacidade enrichment/execução por provider
- ✅ **Skills `/dare-*`** citam equivalente terminal nas 3 IDEs

## ✅ Shipped — v3.11.0

**Dynamic DAG** — replan estrutural com sub-DAGs aninhados em runtime.

- ✅ **`REPLAN` → splice de sub-DAG** — decay policy gera sub-tasks via `refine --split` e insere no DAG ativo
- ✅ **`verification.loop.maxDepth`** — default `2`; excedeu → `ESCALATE`
- ✅ **`dare refine --split --apply`** — injeção manual de sub-DAG no DAG ativo
- ✅ **`dare dag viz` agrupa sub-DAGs** — nesting visual em Mermaid/DOT/Excalidraw
- ✅ **Persistência** — sub-DAG sobrevive a reinício via `dare-dag.yaml` + `.dare/state.json`

## ✅ Shipped — v3.10.0

**Drift Gate** — detecção determinística spec ↔ código no grafo dual.

- ✅ **`dare graph drift`** — orphan-requirement, orphan-code, stale
- ✅ **Exit code 7** com `--strict` acima dos limiares
- ✅ **Bloco `drift`** opt-in em `dare.config.json`
- ✅ **`contentHash`** no ingest de requirements

## ✅ Shipped — v3.10.0 (semantic search)

**Local Semantic Search** — retrieval híbrido no GraphRAG.

- ✅ **RRF** — keyword + vetor + proximidade no grafo
- ✅ **`graphrag.semantic`** opt-in + `@huggingface/transformers` lazy optionalDep
- ✅ **`dare graph query --semantic`** + fallback keyword
- ✅ **Indexação incremental** por `contentHash`

## ✅ Shipped — v3.9.0

**Secure Autonomous Executor + Agentic-chain Security Gate** — modo autônomo (core determinístico) + gate de segurança da cadeia agêntica.

- ✅ **`dare execute --agent`** — driver plugável (mock/noop/claude), best-of-N, decay policy reutilizada
- ✅ **`--budget-tokens`**, **`--require-approval rank|none`**, **`--dry-run`**
- ✅ **Telemetria de custo** no GraphRAG (nó `task`)
- ✅ **Gate `no-llm-in-core`** — SDK confinado ao driver
- ✅ **`dare guard`** — unicode-audit, scan heurístico, proveniência Ed25519/minisign-compat
- ✅ **Trust boundaries** — control/data channel enforcement
- ✅ **Exit code 6** — FAIL de guard (ou WARN com `--strict`)
- ✅ **Pré-flight** integrado ao `dare execute --agent`

## ✅ Shipped — v3.3.0

**Reliable Verification Core** — núcleo determinístico pós-Ralph Loop (opt-in).

- ✅ **Mutation testing** — Stryker (JS/TS), mutmut (Python), cargo-mutants (Rust), Infection (PHP)
- ✅ **Fail-to-pass + anti-tamper** — RF-02/RF-03; baseline em `.dare/verification/<task-id>.json`
- ✅ **Decay policy** — `decideNextAction` canônico (CONTINUE/FRESH_START/REPLAN/ESCALATE)
- ✅ **Best-of-N** — worktrees git + seletor Pareto + prerank exec-free (RS-07)
- ✅ **`dare bench`** — 6+ fixtures, solve-rate, baseline/regressão CI (RF-07/08)
- ✅ **RS-06** — `safe-spawn` argv, zero `shell:true` no núcleo

## ✅ Shipped — v3.2.0

Foco em **qualidade dos artefatos brownfield** + **paridade total CLI ↔ IDE**.

- ✅ **Paridade `/dare-*` nas 3 IDEs** — todos os 18 comandos do CLI são invocáveis como `/dare-<comando>` em Claude Code, Cursor e Antigravity. Cursor normalizado (`generate-*`/`*-task`/`run-dag`/`telemetry-report` → `dare-*`); `reverse`/`dna`/`migrate` promovidos de regra passiva para comando invocável.
- ✅ **Teste `ide-command-parity.test.ts`** trava o contrato: comando novo no CLI sem skill nas 3 IDEs quebra o build.
- ✅ **Coleta determinística por padrão no `dare reverse`** — `extractDataModel()` roda em todo `reverse` (antes só com `--deep`); `IDEIA.md` e specs de módulo passam de esqueleto a tabelas reais de **Superfície de API** + **Modelo de Dados**. `reverse-facts.json` registra contagens de endpoints/entidades.
- ✅ **Correções de extração determinística** (`utils/datamodel.ts`) — rota `@Controller` composta, entidades `@Entity` só-colunas, filtro de DTOs/value-shapes e de palavras-chave SQL.

## ✅ Shipped — v3.1.1

- ✅ **Brownfield instala skills da IDE** — `dare reverse`/`dna`/`migrate` agora instalam os slash-commands/skills (`ensureDareSkills`); antes a 2ª camada (inferência semântica na IDE) não existia, e o passo "Run /dare-reverse in your IDE" apontava para um comando inexistente.

---

## ✅ Shipped — v3.1.0

### Stacks com gerador completo (11)

Todas internalizadas no `@dewtech/dare-cli` (sem pacotes de stack isolados; corrige o erro 404 do `npm install -g`). Cada gerador entrega o **DNA DARE**: `llms.txt`, OpenAPI, `--json`, rate limit, `.env.example` sem segredos, `.dare/skills.yml`, CI com audit/lint/test.

**Backend (7):**
- ✅ **ruby-rails-8** — Rails 8 + Layered Design + Action Cable + LLM
- ✅ **node-nestjs** — NestJS 10 + Prisma + Swagger + Throttler + JWT
- ✅ **python-fastapi** — FastAPI + Pydantic v2 + SQLAlchemy + Alembic + slowapi
- ✅ **php-laravel** — Laravel 11 + Sanctum + FormRequest + Reverb + Pail + l5-swagger
- ✅ **rust-axum** — Axum + Tower + utoipa + jsonwebtoken + argon2 + sqlx
- ✅ **go-gin** — Gin + sqlc + swag + golang-jwt + gorilla/websocket
- ✅ **go-stdlib** — net/http 1.22 (sem framework) + sqlc + coder/websocket

**MCP Server (4 variantes, 3 transports cada):**
- ✅ **mcp-node-ts** — `@modelcontextprotocol/sdk`
- ✅ **mcp-python** — `mcp[cli]` (FastMCP)
- ✅ **mcp-rust** (beta) — `rmcp`
- ✅ **mcp-go** (beta) — `mark3labs/mcp-go`

### Outras mudanças

- ✅ **`dare new` removido** — `dare init` é o único entrypoint de scaffolding
- ✅ **DNA gate** — `dna.spec.ts` valida os 7 artefatos invariantes nos 11 stacks (single-source de paridade)
- ✅ **CI de segurança** — `pnpm audit --prod` + gitleaks sobre `templates/stacks/**`
- ✅ **`packages/stacks/` removido** — tudo internalizado em `packages/cli/`

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

> Atualizado na v3.1.0 → **(11)**. Ver seção abaixo.

### Engine

- ✅ **CLI `dare`** consolidado em `@dewtech/dare-cli` (era 4 pacotes na v1.x)
- ✅ **GraphRAG** com SQLite + FTS5
- ✅ **DAG runner** com Kahn's algorithm para paralelismo lógico
- ✅ **MCP server** local (`dare-mcp-server`)
- ✅ **Anti-stub gates** — `dare review` e `dare refine` no Ralph Loop
- ✅ **`dare update`** — sincroniza projetos antigos com a versão atual sem perder DESIGN/BLUEPRINT/TASKS

---

## 🔮 Planejado — v3.3.x+

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

## 📚 Histórico de releases

Resumo cronológico de todas as releases. Detalhes completos em [`CHANGELOG.md`](CHANGELOG.md).

### v3.2.0 (2026-06) — Paridade total CLI ↔ IDE + coleta determinística
Todo comando do CLI vira `/dare-*` nas 3 IDEs (teste `ide-command-parity` trava o contrato). `dare reverse`/`dna` coletam dados reais (endpoints/entidades) por padrão — os artefatos brownfield deixam de ser esqueleto. Correções de extração determinística em `utils/datamodel.ts`.

### v3.1.1 (2026-06) — Brownfield instala skills da IDE
`dare reverse`/`dna`/`migrate` passam a instalar os slash-commands/skills da IDE (`ensureDareSkills`), habilitando a 2ª camada (inferência semântica) do workflow.

### v3.1.0 (2026-06) — 11 stacks internalizadas + fix de distribuição
Corrige o 404 do `npm install -g` (tudo num único tarball, sem pacotes de stack isolados) e completa a paridade de stacks prometida na v3.0.0: 11 geradores completos com o DNA DARE. `dare new` removido; DNA gate; `packages/stacks/` removido.

### v3.0.0 (2026-05) — Skill parity & stacks novas

✨ Adicionado — Suíte Brownfield (projetos legados)
Leva o DARE de greenfield-first a também entender, documentar e migrar projetos legados. Três comandos novos + dois modos do reverse, no padrão da casa (CLI determinístico + skill semântica + Ralph Loop). Mecanismos de incerteza/migração inspirados no framework Reversa (Macedo & da Costa, arXiv:2605.18684, MIT) — absorção clean-room, sem copiar código.

Comandos novos:

dare reverse — engenharia reversa (Fase 0): detecta fronteiras de módulo, mede tamanho por LOC, infere o grafo de dependências. Gera DARE/IDEIA.md (pré-arquitetura + mapa de módulos em Mermaid), REVERSE/module-*.md, reverse-facts.json e architecture.excalidraw. Flags --check, --modules, --no-excalidraw.
dare dna — extrai as convenções do codebase (lint/format, nomenclatura, camadas, framework de teste, libs ORM/HTTP/auth/validação, convenção de commits) → PROJECT-DNA.md + dna-facts.json. O agente passa a seguir o padrão da casa, não o default genérico.
dare migrate --to <stack> — plano de migração com paridade: consome IDEIA + DNA, herda os blocking gaps (🔴) como riscos, e gera MIGRATION.md (paradigma, estratégia, risco, arquitetura-alvo, cutover) + cenários Gherkin de paridade (parity/<módulo>.feature).
Modos do dare reverse:

--report — confiança 3-estados por claim (🟢 CONFIRMED com evidência arquivo:linha · 🟡 INFERRED · 🔴 GAP), com índice computado deterministicamente a partir dos marcadores (não auto-avaliado por LLM). Gera confidence-report.md + traceability/code-spec-matrix.md; os 🔴 viram gaps.md e questions.md.
--deep — extração profunda: ERD (erd.md), API surface (api-surface.md), C4 (component determinístico + context/container via skill) e skeletons de domain-rules.md / state-machines.md / permissions.md.
Framework-agnostic por linguagem: o --deep funciona em qualquer projeto de uma linguagem suportada, com ou sem framework — SQL inline (DDL + tabelas de queries), tipos/classes/structs em pastas de modelo (PHP/Python/TS/Go/Ruby/Rust → ERD sem ORM) e rotas multi-dialeto (Express/Nest/Fastify · Laravel/Slim/Symfony · FastAPI/Flask/Django · Rails/Sinatra · Gin/stdlib · Axum). Provado em PHP legado sem Laravel.
3 skills brownfield novas (paridade nas 3 IDEs): dare-reverse, dare-dna, dare-migrate.

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
