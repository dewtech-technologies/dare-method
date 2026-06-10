# Feature Design: Local Telemetry Dashboard (`dare dashboard`)

> Gerado seguindo o próprio Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de avançar ao `/dare-blueprint`. License: MIT.
>
> **Base de evidências:** item 5 do backlog. Os dados já existem no GraphRAG (`verified_by`,
> `proven_by`, custo/tokens, best-of-N, drift, guard); falta a **camada de visualização**. Entrega ~80%
> do "DARE Cloud" do roadmap **sem cloud**. **Target: v3.11.0** (repo em v3.9.0).

## Contexto no Projeto Existente

O GraphRAG já acumula a telemetria de toda a operação do DARE: gates (`verified_by`/`proven_by`),
mutation score, telemetria de custo por task (v3.9.0), best-of-N, e (em breve) drift e guard. Mas o
único consumo é via `dare graph stats`/`query` no terminal. **Não há visão consolidada.** O roadmap
empurra dashboards para o "DARE Cloud", mas dá para entregar um **dashboard local-first** lendo o mesmo
SQLite/JSON — determinístico, offline, zero cloud.

O MCP server já usa **Express** (com o hardening loopback+token da v3.4), então a infraestrutura HTTP
local-first segura **já existe** e é reusável.

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | Visão consolidada da telemetria | `dare dashboard` abre uma página com progresso/gates/custo | página renderiza a partir do grafo real |
| O-02 | Zero cloud / local-first | Bind e dados | `127.0.0.1` only; lê só o grafo do projeto |
| O-03 | Sem dep pesada no core (D-002) | Frontend exige build/bundler pesado? | front estático servido; nenhuma dep de build no core |
| O-04 | Determinístico (LLM-free) | Dashboard chama LLM? | **0** — só lê/agrega o grafo |
| O-05 | Reuso do hardening | Auth/bind | reusa o middleware loopback+token do MCP (v3.4) |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Valor visível da telemetria sem construir cloud |
| Usuário (dev) | Adotantes do DARE | Ver progresso do DAG, custo, gates num lugar só |
| Mantenedores CLI | Dewtech | Mono-pacote; reuso de Express + reads do grafo |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **`dare dashboard [--port N]`** — sobe server local e abre o navegador | MUST | Server em `127.0.0.1:<port>`; página carrega |
| RF-02 | **Painel de progresso do DAG** — tasks por status/rank, caminho crítico | MUST | Lê `state.json`/grafo; reflete PENDING/RUNNING/DONE/FAILED |
| RF-03 | **Painel de gates** — verificação, mutation, formal (`verified_by`/`proven_by`) | MUST | Agrega arestas de gate do grafo |
| RF-04 | **Painel de custo** — tokens/custo por task e total (telemetria v3.9.0) | MUST | Soma os metadados de custo dos nós `task` |
| RF-05 | **Painel best-of-N** — candidatos por task e seleção | SHOULD | Lê telemetria de best-of-N |
| RF-06 | **Painel guard/drift** — vereditos de segurança e drift (quando presentes) | SHOULD | Mostra `dare guard`/`graph drift` se houver dados |
| RF-07 | **API JSON read-only** — `/api/telemetry` serve os dados agregados | MUST | Endpoint reusa as leituras do `KnowledgeGraph` |
| RF-08 | **Front estático** — HTML/CSS/JS vanilla servido de `templates/dashboard/` | MUST | Sem bundler/build pesado; sem framework como dep do core |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Local-first seguro** | bind `127.0.0.1`; reusa auth/token do MCP (v3.4) |
| RNF-02 | **LLM-free** | só leitura/agração do grafo |
| RNF-03 | **Mono-pacote (D-002)** | front estático em `templates/`; nenhuma dep de build no core |
| RNF-04 | **Read-only** | dashboard nunca escreve no grafo/estado |
| RNF-05 | **Performance** | agregação O(V+E); página leve |

## Requisitos de Segurança

| ID | Requisito | Mapeamento |
|---|---|---|
| RS-01 | Bind loopback + token (reuso MCP v3.4) | **A01/A05** |
| RS-02 | Read-only; sem mutação de estado | **A01** |
| RS-03 | Sem segredo no payload/telemetria exposta | **A09** |
| RS-04 | Confinar leitura ao grafo do projeto (path-safety) | **A01/A03** |

## Stack Técnica

| Camada | Tecnologia | Nota |
|---|---|---|
| HTTP | Express (reuso do MCP server) | hardening loopback+token já existe (v3.4) |
| Leitura | `KnowledgeGraph` (`getStatistics`, `queryNodes`, `getEdges`) | reuso |
| Front | HTML + CSS + JS vanilla (+ libs CDN-free embutidas) | `templates/dashboard/`; sem bundler |
| Gráficos | SVG/canvas mínimos ou lib leve embutida | sem dep pesada |

## Integrações Externas

| Sistema | Tipo | Direção | Dados | Responsável |
|---|---|---|---|---|
| Navegador local | cliente | bi | telemetria agregada (JSON) | server local |
| GraphRAG local | store | leitura | nós/arestas/metadados | dashboard |

## Restrições

- **Local-first inegociável:** não vira serviço exposto; loopback + token (reuso do MCP).
- **Mono-pacote:** front estático internalizado em `templates/`; **sem** framework/bundler como dep do core.
- **Read-only:** o dashboard só lê; nunca muta grafo/estado.
- **LLM-free.**

## Fora do Escopo (v1)

- **DARE Cloud / dashboard remoto compartilhado** — continua no roadmap.
- **Edição/ações pela UI** (re-rodar task, etc.) — v1 é só leitura.
- **Histórico cross-projeto / multi-tenant** — fora.
- **Framework SPA pesado (React/Vue)** — vanilla na v1 para respeitar o mono-pacote.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Front vanilla fica limitado | Média | Baixo | Escopo de leitura é simples; libs leves embutidas se preciso |
| Reuso do server MCP acopla demais | Média | Médio | Extrair um app Express compartilhado (dashboard + MCP usam) |
| Exposição acidental na LAN | Baixa | Alto | Reusa bind loopback + token do MCP (RS-01) |
| Dados ausentes (grafo vazio) | Média | Baixo | Estados vazios tratados; aviso "rode dare execute" |

## Checklist de Aprovação

- [ ] `dare dashboard` local-first (Express reusado) é a abordagem certa
- [ ] Front vanilla em `templates/` (sem bundler/framework) é aceitável para a v1
- [ ] Read-only na v1 (sem ações pela UI) é suficiente
- [ ] Reusar auth/bind do MCP (v3.4) é a decisão de segurança aprovada
- [ ] "Fora do escopo" (Cloud, ações, multi-tenant, SPA) é aceitável

---

> **Próximo passo:** após aprovação, `/dare-blueprint` — extrair o app Express compartilhado, o endpoint
> `/api/telemetry` (reusando reads do grafo), e o front estático em `templates/dashboard/`. Target: **v3.11.0**.
