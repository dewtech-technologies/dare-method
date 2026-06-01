# DARE Skills - Indice de paridade

> **v3.0.0** - 32 skills x 3 IDEs = **96 arquivos de skill** em paridade total.
> Toda skill listada aqui esta implementada e funcional nas 3 implementations.

---

## Como ler a tabela

| IDE | Localizacao | Formato |
|---|---|---|
| **Antigravity** | implementations/antigravity/.agents/skills/[name]/SKILL.md | YAML frontmatter + corpo |
| **Claude Code** | implementations/claude/.claude/commands/[name].md | Slash command markdown |
| **Cursor IDE** | implementations/cursor/.cursor/rules/skill-[name].mdc | Rule frontmatter + corpo |

Cliques nas colunas vao direto para os arquivos.

---

## Metodo DARE (6 skills) - fases canonicas

| Skill | Funcao | Antigravity | Claude | Cursor |
|---|---|---|---|---|
| dare-design | Fase 01: gera DESIGN.md a partir de descricao | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-design/SKILL.md) | [dare-design.md](../../implementations/claude/.claude/commands/dare-design.md) | [skill-design.mdc](../../implementations/cursor/.cursor/rules/skill-design.mdc) |
| dare-blueprint | Fase 02: gera BLUEPRINT.md + dare-dag.yaml + TASKS.md | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-blueprint/SKILL.md) | [dare-blueprint.md](../../implementations/claude/.claude/commands/dare-blueprint.md) | [skill-blueprint.mdc](../../implementations/cursor/.cursor/rules/skill-blueprint.mdc) |
| dare-tasks | Status e tracking de tasks | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-tasks/SKILL.md) | [dare-tasks.md](../../implementations/claude/.claude/commands/dare-tasks.md) | [skill-tasks.mdc](../../implementations/cursor/.cursor/rules/skill-tasks.mdc) |
| dare-execute | Fase 04: executa task individual com Ralph Loop | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-execute/SKILL.md) | [dare-execute.md](../../implementations/claude/.claude/commands/dare-execute.md) | [skill-execute.mdc](../../implementations/cursor/.cursor/rules/skill-execute.mdc) |
| dare-review | Gate anti-stub: detecta TODO/FIXME, stubs, mocks fora de tests | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-review/SKILL.md) | [dare-review.md](../../implementations/claude/.claude/commands/dare-review.md) | [skill-review.mdc](../../implementations/cursor/.cursor/rules/skill-review.mdc) |
| dare-refine | Mede complexidade e propoe quebra em sub-tasks | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-refine/SKILL.md) | [dare-refine.md](../../implementations/claude/.claude/commands/dare-refine.md) | [skill-refine.mdc](../../implementations/cursor/.cursor/rules/skill-refine.mdc) |

---

## DAG runner (4 skills) - orquestracao paralela

| Skill | Funcao | Antigravity | Claude | Cursor |
|---|---|---|---|---|
| dare-dag-build | Regenera apenas dare-dag.yaml a partir do BLUEPRINT | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-dag-build/SKILL.md) | [dare-dag-build.md](../../implementations/claude/.claude/commands/dare-dag-build.md) | [skill-dag-build.mdc](../../implementations/cursor/.cursor/rules/skill-dag-build.mdc) |
| dare-dag-run | Executa apenas o grafo ja aprovado (sem regenerar) | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-dag-run/SKILL.md) | [dare-dag-run.md](../../implementations/claude/.claude/commands/dare-dag-run.md) | [skill-dag-run.mdc](../../implementations/cursor/.cursor/rules/skill-dag-run.mdc) |
| dare-dag-runner | Wrapper agregador: build + run + viz num unico comando | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-dag-runner/SKILL.md) | [dare-dag-runner.md](../../implementations/claude/.claude/commands/dare-dag-runner.md) | [skill-dag-runner.mdc](../../implementations/cursor/.cursor/rules/skill-dag-runner.mdc) |
| dare-dag-viz | Diagrama Excalidraw com cores por complexidade | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-dag-viz/SKILL.md) | [dare-dag-viz.md](../../implementations/claude/.claude/commands/dare-dag-viz.md) | [skill-dag-viz.mdc](../../implementations/cursor/.cursor/rules/skill-dag-viz.mdc) |

---

## Transversais (6 skills) - engenharia que se aplica a qualquer stack

| Skill | Funcao | Antigravity | Claude | Cursor |
|---|---|---|---|---|
| dare-ax | Agent Experience: llms.txt, OpenAPI, --json, rate limits | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-ax/SKILL.md) | [dare-ax.md](../../implementations/claude/.claude/commands/dare-ax.md) | [skill-ax.mdc](../../implementations/cursor/.cursor/rules/skill-ax.mdc) |
| dare-layered-design | Arquitetura em 4 camadas (Handler -> Service -> Repository -> Model) | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-layered-design/SKILL.md) | [dare-layered-design.md](../../implementations/claude/.claude/commands/dare-layered-design.md) | [skill-layered-design.mdc](../../implementations/cursor/.cursor/rules/skill-layered-design.mdc) |
| dare-llm-integration | Providers LLM, cache de prompt, rate limit, templates versionados | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-llm-integration/SKILL.md) | [dare-llm-integration.md](../../implementations/claude/.claude/commands/dare-llm-integration.md) | [skill-llm-integration.mdc](../../implementations/cursor/.cursor/rules/skill-llm-integration.mdc) |
| dare-frontend-design | Componentes, state, error boundaries, design system first | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-frontend-design/SKILL.md) | [dare-frontend-design.md](../../implementations/claude/.claude/commands/dare-frontend-design.md) | [skill-frontend-design.mdc](../../implementations/cursor/.cursor/rules/skill-frontend-design.mdc) |
| dare-realtime | WebSocket/SSE, reconnect, subscription manager | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-realtime/SKILL.md) | [dare-realtime.md](../../implementations/claude/.claude/commands/dare-realtime.md) | [skill-realtime.mdc](../../implementations/cursor/.cursor/rules/skill-realtime.mdc) |
| dare-quality-telemetry | Metricas M-01..M-04, deteccao de regressao, gates CI | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-quality-telemetry/SKILL.md) | [dare-quality-telemetry.md](../../implementations/claude/.claude/commands/dare-quality-telemetry.md) | [skill-quality-telemetry.mdc](../../implementations/cursor/.cursor/rules/skill-quality-telemetry.mdc) |

---

## Stack / Tools (8 skills) - escopo especifico

| Skill | Funcao | Antigravity | Claude | Cursor |
|---|---|---|---|---|
| dare-bugfix-design | Flow estruturado para bug fix em legado | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-bugfix-design/SKILL.md) | [dare-bugfix-design.md](../../implementations/claude/.claude/commands/dare-bugfix-design.md) | [skill-bugfix-design.mdc](../../implementations/cursor/.cursor/rules/skill-bugfix-design.mdc) |
| dare-feature-design | Flow estruturado para nova feature em legado | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-feature-design/SKILL.md) | [dare-feature-design.md](../../implementations/claude/.claude/commands/dare-feature-design.md) | [skill-feature-design.mdc](../../implementations/cursor/.cursor/rules/skill-feature-design.mdc) |
| dare-docker | Dockerfile + docker-compose por stack | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-docker/SKILL.md) | [dare-docker.md](../../implementations/claude/.claude/commands/dare-docker.md) | [skill-docker.mdc](../../implementations/cursor/.cursor/rules/skill-docker.mdc) |
| dare-security | OWASP A01..A10 - controles obrigatorios em cada feature | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-security/SKILL.md) | [dare-security.md](../../implementations/claude/.claude/commands/dare-security.md) | [skill-security.mdc](../../implementations/cursor/.cursor/rules/skill-security.mdc) |
| dare-telemetry | Relatorio de tokens, modelos, custo por task | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-telemetry/SKILL.md) | [dare-telemetry.md](../../implementations/claude/.claude/commands/dare-telemetry.md) | [skill-telemetry.mdc](../../implementations/cursor/.cursor/rules/skill-telemetry.mdc) |
| dare-rust-workspace | Decisao single-crate vs multi-crate | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-rust-workspace/SKILL.md) | [dare-rust-workspace.md](../../implementations/claude/.claude/commands/dare-rust-workspace.md) | [skill-rust-workspace.mdc](../../implementations/cursor/.cursor/rules/skill-rust-workspace.mdc) |
| dare-rust-leptos | Leptos SSR/CSR - convencoes | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-rust-leptos/SKILL.md) | [dare-rust-leptos.md](../../implementations/claude/.claude/commands/dare-rust-leptos.md) | [skill-rust-leptos.mdc](../../implementations/cursor/.cursor/rules/skill-rust-leptos.mdc) |
| dare-laravel-api | Laravel 11 + Eloquent + Sanctum | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-laravel-api/SKILL.md) | [dare-laravel-api.md](../../implementations/claude/.claude/commands/dare-laravel-api.md) | [skill-laravel-api.mdc](../../implementations/cursor/.cursor/rules/skill-laravel-api.mdc) |

---

## Stacks novas - v3.0.0 (5 skills)

| Skill | Funcao | Antigravity | Claude | Cursor |
|---|---|---|---|---|
| dare-nestjs-api | Node.js + NestJS + Prisma + Swagger | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-nestjs-api/SKILL.md) | [dare-nestjs-api.md](../../implementations/claude/.claude/commands/dare-nestjs-api.md) | [skill-nestjs-api.mdc](../../implementations/cursor/.cursor/rules/skill-nestjs-api.mdc) |
| dare-fastapi-api | Python + FastAPI + Pydantic + uvicorn | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-fastapi-api/SKILL.md) | [dare-fastapi-api.md](../../implementations/claude/.claude/commands/dare-fastapi-api.md) | [skill-fastapi-api.mdc](../../implementations/cursor/.cursor/rules/skill-fastapi-api.mdc) |
| dare-go-gin-api | Go + Gin/stdlib + sqlc | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-go-gin-api/SKILL.md) | [dare-go-gin-api.md](../../implementations/claude/.claude/commands/dare-go-gin-api.md) | [skill-go-gin-api.mdc](../../implementations/cursor/.cursor/rules/skill-go-gin-api.mdc) |
| dare-mcp-server | MCP Server (TS ou Python; stdio/SSE/HTTP) | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-mcp-server/SKILL.md) | [dare-mcp-server.md](../../implementations/claude/.claude/commands/dare-mcp-server.md) | [skill-mcp-server.mdc](../../implementations/cursor/.cursor/rules/skill-mcp-server.mdc) |
| dare-rails-api | Ruby + Rails 8 + Solid Queue + Action Cable | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-rails-api/SKILL.md) | [dare-rails-api.md](../../implementations/claude/.claude/commands/dare-rails-api.md) | [skill-rails-api.mdc](../../implementations/cursor/.cursor/rules/skill-rails-api.mdc) |

---

## Brownfield (3 skills) - projetos legados

| Skill | Funcao | Antigravity | Claude | Cursor |
|---|---|---|---|---|
| dare-reverse | Fase 0: camada semantica da engenharia reversa - preenche IDEIA.md + module-*.md (pareia com o comando `dare reverse`) | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-reverse/SKILL.md) | [dare-reverse.md](../../implementations/claude/.claude/commands/dare-reverse.md) | [skill-reverse.mdc](../../implementations/cursor/.cursor/rules/skill-reverse.mdc) |
| dare-dna | Camada semantica do DNA: transforma fatos de convencao em regras acionaveis no PROJECT-DNA.md (pareia com o comando `dare dna`) | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-dna/SKILL.md) | [dare-dna.md](../../implementations/claude/.claude/commands/dare-dna.md) | [skill-dna.mdc](../../implementations/cursor/.cursor/rules/skill-dna.mdc) |
| dare-migrate | Fase 2: plano de migracao + Gherkin de paridade no DARE/MIGRATION/ (pareia com o comando `dare migrate`) | [SKILL.md](../../implementations/antigravity/.agents/skills/dare-migrate/SKILL.md) | [dare-migrate.md](../../implementations/claude/.claude/commands/dare-migrate.md) | [skill-migrate.mdc](../../implementations/cursor/.cursor/rules/skill-migrate.mdc) |

---

## Skills por categoria - totais

| Categoria | Skills | Arquivos (x3 IDEs) |
|---|---|---|
| Metodo DARE | 6 | 18 |
| DAG runner | 4 | 12 |
| Transversais | 6 | 18 |
| Stack / Tools | 8 | 24 |
| Stacks novas v3.0.0 | 5 | 15 |
| Brownfield | 3 | 9 |
| **Total** | **32** | **96** |

---

## Publicando sua propria skill

Skills da comunidade entram via registry remoto (em planejamento). Veja contributing/publish-a-skill.md para o passo a passo.

---

**Licenca:** MIT (D-001 - MIT permanente).
