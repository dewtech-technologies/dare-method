# AGENT 2 — Stack Rails 8 ⚠️ PRIORIDADE MÁXIMA

**Branch:** `agent/2-rails`  
**Worktree:** `dare-agent-2-rails`  
**Período:** Semana 1-2 do plano de 30 dias  
**Prioridade:** ⚠️ MÁXIMA — qualquer conflito de bandwidth, Agent 2 ganha  

---

## Objetivo

Implementar `ruby-rails-8` como stack completa e funcional: scaffold de novo projeto Rails via `dare new --stack rails` gera projeto com todas as 6 skills transversais integradas.

---

## Dependências

- **DESIGN.md principal:** `docs/design/stacks/ruby-rails-8/DESIGN.md` ← LER INTEIRO antes de começar
- **DECISIONS.md:** consultar antes de qualquer decisão arquitetural
- **Bloqueado por:** Agent 1 terminar dare-ax e dare-layered-design (pelo menos v0.1 funcional)

---

## Gates de Bloqueio

- **dare-ax v0.1** rodando (Agent 1) — gerador de llms.txt
- **dare-layered-design v0.1** rodando (Agent 1) — scaffold de pastas
- **Antes de PR para main:** `rake dare:metrics` passa 100% + Wanderson aprova

---

## TASKS — Semana 1

### Estrutura Base (Dias 1-3)

**Status:** ⏳ TODO — COMEÇAR AQUI

- [ ] Criar `packages/stacks/ruby-rails-8/` no worktree
- [ ] Implementar `RailsScaffold` (main generator class)
- [ ] Template `Gemfile` com todas as gems necessárias (vide ADR em DESIGN.md)
- [ ] Template `config/initializers/dare.rb` (configuração central)
- [ ] Template `config/dare.yml` (providers, settings)
- [ ] Template `.dare/skills.yml` (manifest inicial com skills instaladas)

### Estrutura de Pastas Layered Design (Dias 2-4)

- [ ] Generator: cria `app/handlers/`, `app/services/`, `app/repositories/`, `app/models/`
- [ ] Generator: cria `app/presenters/`, `app/llm/`, `app/middleware/`
- [ ] Generator: cria `app/channels/application_cable/connection.rb` com auth
- [ ] Template `ApplicationController` com concerns básicos
- [ ] Exemplo User (Handler + Service + Repository + Model completos)

### OpenAPI via rswag (Dias 3-5)

- [ ] Adicionar `rswag-api`, `rswag-ui` ao Gemfile template
- [ ] Configurar `config/initializers/rswag_api.rb`
- [ ] Template spec helper para rswag
- [ ] Rake task `dare:openapi` que regenera `public/openapi.json`
- [ ] Verificar que `/openapi.json` está no routes

---

## TASKS — Semana 2

### LLM Integration (Dias 1-3)

- [ ] Criar `app/llm/providers/llm_provider.rb` (interface)
- [ ] Criar `app/llm/providers/openai_provider.rb` (implementação)
- [ ] Criar `app/llm/providers/dummy_provider.rb` (para testes)
- [ ] Criar `app/llm/prompts/prompt_loader.rb` (lê .jinja2)
- [ ] Criar `app/llm/validators/validator.rb` (JSON Schema)
- [ ] Criar `app/llm/cache/llm_cache.rb` (Redis wrapper)
- [ ] Criar `app/llm/rate_limit/token_bucket.rb`
- [ ] Inicializador que configura LLMProvider.instance via config

### Action Cable + Real-time (Dias 2-4)

- [ ] `app/channels/application_cable/connection.rb` com cookie auth
- [ ] Template de channel genérico `app/channels/dare_updates_channel.rb`
- [ ] `app/services/realtime_service.rb` (pub/sub broadcaster)
- [ ] Event validator com JSON Schema
- [ ] Redis pub/sub configurado para multi-server

### rake dare:metrics (Dias 4-5)

- [ ] Implementar `lib/tasks/dare.rake`
- [ ] Collectors: M-01 (llms.txt), M-02 (openapi), M-03 (rate limit), M-04 (--json CLI)
- [ ] Output JSON salvo em `tmp/dare_metrics.json`
- [ ] CI config: falha se qualquer métrica < 100%

---

## TASKS — Semana 2 (finalização)

### Testes Completos (Dias 5-7)

- [ ] `spec/services/` — 100% de Services com testes unitários (sem DB)
- [ ] `spec/handlers/` — testa HTTP responses
- [ ] `spec/channels/` — testa auth e subscriptions
- [ ] `spec/api/` — rswag specs para todos endpoints
- [ ] Factory Bot factories para User, Post, etc.
- [ ] CI: `bundle exec rspec` passa a verde

### Exemplo Completo — Summarize Document

- [ ] Implementar o exemplo do Apêndice B do DESIGN.md (SummarizeDocumentService)
- [ ] Handler, Service, Repository, Spec completos
- [ ] Real-time event `document.summarized`
- [ ] rswag spec do endpoint
- [ ] README no worktree com "how to run example"

---

## llms.txt Template (gerado no scaffold)

Conteúdo padrão que deve ser gerado:

```
# llms.txt — Project Context for AI Agents

## Project Overview
[Rails 8 application built with DARE v3.0 methodology]

## Tech Stack
- Language: Ruby 3.3+
- Framework: Rails 8.0+ (Omakase)
- Database: PostgreSQL 14+
- Real-time: Action Cable + Redis
- Background: Solid Queue
- Deploy: Kamal

## Architecture (Layered Design)
- app/handlers/    — HTTP handlers (thin controllers)
- app/services/    — Business logic (one class per operation)
- app/repositories/ — Data access (interface + implementations)
- app/models/      — Domain objects (no callbacks)
- app/presenters/  — Serializers (Model → JSON)
- app/llm/         — LLM patterns (providers, prompts, validators)
- app/channels/    — Real-time (Action Cable)
- app/jobs/        — Background jobs (Solid Queue)

## Key Endpoints
- See GET /openapi.json for complete API documentation

## Getting Started
bundle exec rails server

## Rate Limits
- Public endpoints: 100 req/min per IP (rack-attack)
- Auth endpoints: 10 req/min per IP

## For AI Agents
- OpenAPI: GET /openapi.json
- CLI: bundle exec rails --help
- DARE metrics: bundle exec rake dare:metrics
```

---

## Convenções

- Rails 8 conventions first; DARE patterns layered on top (not replacing)
- Nenhuma gem duplicada (verificar Gemfile.lock)
- `dare:metrics` deve passar a 100% antes de qualquer PR
- Testes com RSpec; FactoryBot para fixtures; sem fixtures YAML
- Erros sempre via RFC 7807 (ver DECISIONS.md D-006)

## Perguntas / Blockers

Registrar no `docs/design/DECISIONS.md` e pinger Wanderson.

## Histórico

| Data | Status | Notas |
|------|--------|-------|
| 2026-05-26 | Criado | Semana 0 — setup inicial |
