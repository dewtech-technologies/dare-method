# AGENT 1 — Skills Transversais

**Branch:** `agent/1-skills`  
**Worktree:** `dare-agent-1-skills`  
**Período:** Semana 1-3 do plano de 30 dias  
**Prioridade:** Alta (bloqueado por nenhum agent; libera agent 2 e 3)  

---

## Objetivo

Implementar as 6 skills transversais como código executável no CLI DARE:
- Skill em si (templates, validators, generators)
- Testes automatizados
- Integração com `dare metrics collect`
- Documentação `IMPLEMENTATION.md` junto ao DESIGN.md

---

## Dependências

- **DESIGN.md de cada skill**: já existe em `docs/design/skills/`
- **DECISIONS.md**: consultar antes de qualquer decisão arquitetural
- **Nenhum gate de outro agent**: Agent 1 é paralelo e independente

---

## Gates de Bloqueio

- **Antes de mergear na main:** PR aprovado por Wanderson
- **Antes de tag v1.0:** `rake dare:metrics` passa 100% em main

---

## TASKS — Semana 1

### dare-ax (Skills Transversal #1) — MÁXIMA PRIORIDADE

**Status:** ✅ DONE (2026-05-26)  
**DESIGN:** `docs/design/skills/dare-ax/DESIGN.md`  
**Commit:** `08e4fb5`  

- [x] `dare-ax/generator.ts` — gera `llms.txt` via token-based Jinja2 engine
- [x] `dare-ax/validator.ts` — valida estrutura de `llms.txt` (5 seções obrigatórias + secret detection)
- [x] `dare-ax/metrics.ts` — coleta M-01 a M-04
- [x] `dare-ax/secret-detector.ts` — 16 padrões de secrets (AWS, GitHub, Stripe, OpenAI, etc.)
- [x] `dare-ax/templates/llms.txt.jinja2` — template padrão
- [x] `dare-ax/types.ts` — tipos compartilhados
- [x] `dare-ax/index.ts` — exports principais
- [x] `dare-ax/skill.yml` — metadados
- [x] `dare-ax/tests/generator.spec.ts` — 15 testes
- [x] `dare-ax/tests/validator.spec.ts` — 18 testes
- [x] `dare-ax/tests/metrics.spec.ts` — 23 testes
- [x] Total: **56 testes passando**
- [ ] `IMPLEMENTATION.md` — guia de como usar (pendente)

---

### dare-layered-design (Skills Transversal #2)

**Status:** ✅ DONE (2026-05-26)  
**DESIGN:** `docs/design/skills/dare-layered-design/DESIGN.md`  
**Commit:** `d5b7e19`  

- [x] `dare-layered-design/linter.ts` — static analysis Handler→Repository violations (7 languages)
- [x] `dare-layered-design/generator.ts` — scaffold 5-layer structure + README contracts + examples
- [x] `dare-layered-design/metrics.ts` — coleta M-01 a M-04
- [x] `dare-layered-design/types.ts` — tipos compartilhados
- [x] `dare-layered-design/index.ts` — exports principais
- [x] `dare-layered-design/skill.yml` — metadados
- [x] `dare-layered-design/tests/linter.spec.ts` — 13 testes (TS, Ruby, lintFile)
- [x] `dare-layered-design/tests/generator.spec.ts` — 13 testes (scaffold, examples)
- [x] `dare-layered-design/tests/metrics.spec.ts` — 16 testes (M-01 a M-04)
- [x] Total: **42 testes passando**
- [ ] `IMPLEMENTATION.md` — guia de como usar (pendente)

---

### dare-llm-integration (Skills Transversal #3)

**Status:** ✅ DONE (2026-05-26)  
**DESIGN:** `docs/design/skills/dare-llm-integration/DESIGN.md`  

- [x] `LLMProvider` interface (types.ts)
- [x] `OpenAIProvider` — fetch-based, cache + rate limit + token usage logging
- [x] `AnthropicProvider` — Anthropic Messages API, mesmo contrato
- [x] `DummyProvider` — para testes, sem rede, histórico de chamadas
- [x] `LLMCache` — in-memory Map com TTL, hitRate, purgeExpired
- [x] `TokenBucket` — rate limiter com acquire() bloqueante e tryAcquire() não-bloqueante
- [x] `PromptLoader` — templates .jinja2 versionados (engine igual dare-ax)
- [x] `OutputValidator` — valida JSON output contra JSON Schema (zero deps externas)
- [x] `metrics.ts` — M-01 a M-04
- [x] `index.ts`, `skill.yml`, `tsconfig.json`, `package.json`
- [x] Total: **65 testes passando**
- [ ] `IMPLEMENTATION.md`

---

## TASKS — Semana 2

### dare-frontend-design (Skills Transversal #4)

**Status:** ✅ DONE (2026-05-26)  
**DESIGN:** `docs/design/skills/dare-frontend-design/DESIGN.md`  

- [x] `FrontendLinter` — detecta componentes > 300 linhas e fetch inline em JSX/template (.tsx/.vue)
- [x] `FrontendGenerator` — scaffold React (components/hooks/pages/store/api) e Vue (components/composables/pages/stores/api)
- [x] Templates: ErrorBoundary, LoadingSpinner, useFetch, NotFoundPage, API client, store
- [x] `metrics.ts` — M-01 a M-04
- [x] `index.ts`, `skill.yml`, `tsconfig.json`, `package.json`
- [x] Total: **35 testes passando**
- [ ] `IMPLEMENTATION.md`

---

### dare-realtime (Skills Transversal #5)

**Status:** ✅ DONE (2026-05-26)  
**DESIGN:** `docs/design/skills/dare-realtime/DESIGN.md`  

- [x] `SchemaValidator` — valida payload de evento contra JSON Schema (zero deps)
- [x] `EventRegistry` — registro de tipos de evento com schema; validate(), getSchema(), listTypes()
- [x] `ReconnectStrategy` — exponential backoff: 1s, 2s, 4s … cap 30s, reset(), jitter opcional
- [x] `SubscriptionManager` — subscribe() retorna unsub fn; unsubscribeAll(); zero ghost listeners garantido
- [x] `metrics.ts` — M-01 a M-04
- [x] `index.ts`, `skill.yml`, `tsconfig.json`, `package.json`
- [x] Total: **48 testes passando**
- [ ] `IMPLEMENTATION.md`

---

## TASKS — Semana 3

### dare-quality-telemetry (Skills Transversal #6)

**Status:** ⏳ TODO  
**DESIGN:** `docs/design/skills/dare-quality-telemetry/DESIGN.md`  

- [ ] `dare metrics collect` CLI command
- [ ] Collectors individuais para cada skill (dare-ax, dare-layered-design, etc.)
- [ ] JSON output com timestamp + commit
- [ ] Regression detection (compare vs. baseline)
- [ ] GitHub Actions workflow template
- [ ] Testes de cada collector
- [ ] `IMPLEMENTATION.md`

---

## Convenções de Código

- TypeScript strict mode
- `dare-ax` M-01 a M-04 devem passar em todo PR
- Testes unitários sem DB ou rede
- Cada skill em `packages/skills/<skill-name>/`
- Sem dependências circulares entre skills

## Perguntas / Blockers

Registrar qualquer blocker no `docs/design/DECISIONS.md` e pinger Wanderson.

## Histórico

| Data | Status | Notas |
|------|--------|-------|
| 2026-05-26 | Criado | Semana 0 — setup inicial |
| 2026-05-26 | dare-ax DONE | 56 testes passando — commit 08e4fb5 |
| 2026-05-26 | dare-layered-design DONE | 42 testes passando — commit d5b7e19 |
| 2026-05-26 | dare-llm-integration DONE | 65 testes passando |
| 2026-05-26 | dare-frontend-design DONE | 35 testes passando |
| 2026-05-26 | dare-realtime DONE | 48 testes passando |
