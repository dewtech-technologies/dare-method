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

**Status:** ⏳ TODO  
**DESIGN:** `docs/design/skills/dare-llm-integration/DESIGN.md`  

- [ ] `LLMProvider` interface + `OpenAIProvider` + `DummyProvider` (para testes)
- [ ] `PromptLoader` com versioning
- [ ] `LLMCache` wrapper (Redis/in-memory)
- [ ] `TokenBucket` rate limiter
- [ ] `OutputValidator` com JSON Schema
- [ ] Testes cobrindo cache hit/miss, rate limit, validation fail
- [ ] `IMPLEMENTATION.md`

---

## TASKS — Semana 2

### dare-frontend-design (Skills Transversal #4)

**Status:** ⏳ TODO (aguarda semana 2)  
**DESIGN:** `docs/design/skills/dare-frontend-design/DESIGN.md`  

- [ ] Templates React/Vue scaffold (componentes, hooks, pages)
- [ ] Linter rule: component > 300 linhas → error
- [ ] Linter rule: fetch() fora de hooks → error
- [ ] Bundle size validator (CI check < 500KB)
- [ ] Testes de templates
- [ ] `IMPLEMENTATION.md`

---

### dare-realtime (Skills Transversal #5)

**Status:** ⏳ TODO  
**DESIGN:** `docs/design/skills/dare-realtime/DESIGN.md`  

- [ ] WebSocket client template (reconnect + backoff)
- [ ] Event schema validator
- [ ] Subscription authorization template
- [ ] Pub/sub backend configurator (Redis)
- [ ] Testes de conexão, reconnect, cleanup
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
