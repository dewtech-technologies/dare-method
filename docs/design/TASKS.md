# TASKS.md — Semana 0 do Plano v3.0 (30 dias)

**Data início:** 2026-05-26  
**Data fim esperada:** 2026-06-02  
**Status:** Em andamento  

---

## Semana 0: Design Docs — Antecipação antes dos 5 Agents

Objetivo: Escrever todos os DESIGN.md das 6 skills transversais, 1 stack (Rails), 1 CLI, marketing, e operação. Isso define o contrato que os 5 agents vão seguir a partir da semana 1.

---

## Dia 1-2: 6 DESIGN.md das Skills Transversais

### ✅ dare-ax (Agent Experience)
- **Status:** ✅ COMPLETO
- **Arquivo:** `docs/design/skills/dare-ax/DESIGN.md`
- **Estrutura:** 13 seções (Visão, Problema, RF/RNF/RS, Stakeholders, Métricas Tipo A, Antipatterns, ADR 1-5, Riscos, Dependências, Fora de Escopo, Roadmap v1.1-1.3)
- **Decisões aplicadas:** ADR-01 (RFC 7807), ADR-02 (llms.txt obrigatório), Métricas removidas Tipo B/C, Roadmap Rails first
- **Próximo:** Review e merge no main

---

### ✅ dare-layered-design (Layered Design Pattern)
- **Status:** ✅ COMPLETO
- **Arquivo:** `docs/design/skills/dare-layered-design/DESIGN.md`
- **Descrição:** Padrões arquiteturais em camadas (inspirado em Vladimir Dementyev, Evil Martians)
- **Stack-agnóstico:** Controllers → Services → Repositories → Models
- **Prioridade:** Crítica para Rails (v1.1)
- **Estrutura:** 13 seções, 5 ADRs (Composition, DI, Single Resp, Repository Abstraction, Model Separation)

---

### ✅ dare-llm-integration (LLM-First Development)
- **Status:** ✅ COMPLETO
- **Arquivo:** `docs/design/skills/dare-llm-integration/DESIGN.md`
- **Descrição:** Padrões de integração com LLMs em aplicação (completions, embeddings, streaming)
- **Aplicável a:** Node, Python, Rust principalmente
- **Prioridade:** Alta (plataforma TubeMind depende)
- **Estrutura:** 13 seções, 5 ADRs (LLMProvider, Caching, Prompt Templates, Rate Limit, Output Validation)

---

### ✅ dare-frontend-design (Frontend Architecture)
- **Status:** ✅ COMPLETO
- **Arquivo:** `docs/design/skills/dare-frontend-design/DESIGN.md`
- **Descrição:** Padrões para React/Vue (components, state, routing)
- **Stack-agnóstico:** Agnóstica à UI framework, padrões comportamentais
- **Prioridade:** Média (depois das skills backend)
- **Estrutura:** 13 seções, 5 ADRs (Composition, Custom Hooks, State Levels, Error Boundaries, Loading States)

---

### ✅ dare-realtime (Real-time Features)
- **Status:** ✅ COMPLETO
- **Arquivo:** `docs/design/skills/dare-realtime/DESIGN.md`
- **Descrição:** WebSockets, SSE, polling patterns; integração com Rails via Action Cable, Node via Socket.io
- **Prioridade:** Média (entra em v1.1 via dare-rails-ax)
- **Estrutura:** 13 seções, 5 ADRs (Event-Driven, Subscriptions Auth, Automatic Reconnect, Event Schema, Fallback)

---

### ✅ dare-quality-telemetry (Quality Metrics & CI Integration)
- **Status:** ✅ COMPLETO
- **Arquivo:** `docs/design/skills/dare-quality-telemetry/DESIGN.md`
- **Descrição:** Coleta de M-01 a M-04 em CI, dashboard opcional, alertas de regression
- **Crítico para:** Validar 100% conformidade AX nos repos DARE
- **Prioridade:** Alta (entra logo após dare-ax)
- **Estrutura:** 13 seções, 5 ADRs (Centralized Collector, Time-Series Storage, CI Fail on <100%, Regression Detection, Optional Dashboard)

---

## Dia 3: DESIGN.md da Stack Rails Completa

### ✅ ruby-rails-8 (Stack Rails 8) — CRÍTICO
- **Status:** ✅ COMPLETO
- **Arquivo:** `docs/design/stacks/ruby-rails-8/DESIGN.md`
- **Linhas:** 2300+ (conforme estimado)
- **Integração completa:** 
  - Rails 8 com Rails Omakase (Kamal, Solid Cache, Solid Queue, etc.)
  - dare-ax (llms.txt, OpenAPI via rswag, CLI)
  - dare-layered-design (app/handlers/, app/services/, app/repositories/, app/models/)
  - dare-llm-integration (app/llm/providers/, prompts/, validators/)
  - dare-realtime (Action Cable com autorização)
  - dare-frontend-design (React/Vue scaffold)
  - dare-quality-telemetry (rake dare:metrics)
- **Prioridade:** ⚠️ MÁXIMA — Agent 2 depende exclusivamente deste DESIGN.md
- **Estrutura:** 13 seções, 6 ADRs, Example Feature Completo, Scaffold Structure, Metrics Rake Task
- **Criticidade:** Revisão rigorosa necessária antes de merge (documento espinha dorsal)

---

## Dia 4: DESIGN.md do CLI Evoluído

### ⏳ dare-cli-skill-package-system (Skill Package Manager)
- **Status:** ⏳ TODO
- **Features:**
  - `dare skill add <name>` — instalar skill em projeto
  - `dare skill list` — listar skills disponíveis + versões
  - `dare skill publish` — publicar skill para registry
  - `dare skill update` — atualizar skill existente
- **Compatibilidade:** Semver, compatibilidade com versões anteriores
- **Prioridade:** Alta (Agent 3 cria implementação)

---

## Dia 5: DESIGN.md de Marketing e Conteúdo

### ⏳ dare-content-strategy (Landing, Posts, Case Study, Video)
- **Status:** ⏳ TODO
- **Entregáveis:**
  - Landing DARE Cloud (waitlist apenas, sem código backend)
  - Página de consultoria (formulário, pricing sugerido)
  - 3-4 posts técnicos (PT-BR + EN): "LLMs como cidadãos de primeira classe", "Layered Design no Rails 8", etc.
  - Case study sintético (projeto DARE exemplo rodando em produção)
  - Video script para YouTube (2-3 min) explicando v3.0

---

## Dia 6: DESIGN.md de Defesa e Operação

### ⏳ dare-ops-and-defense (Legal, Trademark, Infrastructure)
- **Status:** ⏳ TODO
- **Tarefas:**
  - Registros INPI (Brasil) e USPTO (EUA) da marca "DARE"
  - Contratos-modelo para consultoria (NDA, SOW)
  - MVP arquitetural DARE Cloud (docs/estrutura apenas, sem código)
  - Monitoração de forks não-autorizados

---

## Dia 7: Setup dos 5 Agents + Orquestração

### ⏳ Agent Setup
- **Status:** ⏳ TODO
- **Tasks:**
  - Criar worktrees para cada agent (`agent-1-skills`, `agent-2-rails`, etc.)
  - TASKS.md individual por agent com blockers e gates
  - Acesso compartilhado a DECISIONS.md (central)
  - Validação de dependências cruzadas

---

## Marcos de Qualidade (Semana 0)

- ✅ dare-ax DESIGN.md: assinado off por Wanderson
- ⏳ Todos 5 demais DESIGN.md: revisão técnica
- ⏳ DESIGN.md Rails: assinado off como critical path
- ⏳ Nenhum DESIGN com ambiguidades ou TODOs flutuantes
- ⏳ TASKS.md individual para cada agent pronto

---

## Riscos Semana 0

| Risco | Mitigação |
|-------|-----------|
| Sobrespecificação em DESIGN.md (análise paralisante) | Time-box 3-4h por DESIGN.md; documentar ambiguidades em DECISIONS.md |
| Dependências descobertas tarde (ex: Rails precisa de LLM-integration) | Dependency graph em DECISIONS.md atualizado daily |
| Agent 2 (Rails) bloqueado por outros DESIGN.md | DESIGN Rails é prioritário; outros podem ser paralelos |

---

## Próximo: Semana 1 (Execução dos Agents)

Após Semana 0 fechada, disparam em paralelo:
- Agent 1: Implementa `dare-ax` v1.0 (skills, CLI, validation, template)
- Agent 2: Inicia `dare-rails-ax` v1.1 (scaffold Rails + skills integradas)
- Agent 3: Implementa CLI evoluído (skill add/list/publish/update)
- Agent 4: Landing DARE Cloud + página consultoria + first post
- Agent 5: Processos INPI/USPTO iniciados

Toda segunda-feira: standup com Wanderson para alignment.
