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

## Como contribuir

Para skills novas: ver [`docs/skills/INDEX.md`](docs/skills/INDEX.md) (template padrão por IDE).
Para PRs: ver [`CONTRIBUTING.md`](CONTRIBUTING.md).
Para tracking detalhado: GitHub Issues + Projects.

---

**Filosofia de versionamento (D-002):** Antes de qualquer tag SemVer, este ROADMAP, o `README.md` raiz e o `packages/cli/README.md` são atualizados juntos.
