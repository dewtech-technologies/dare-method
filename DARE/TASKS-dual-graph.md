# TASKS — Grafo Dual Requisito↔Código (Dual Graph)

> Resumo legível de [dare-dag-dual-graph.yaml](dare-dag-dual-graph.yaml). DAG completo
> (com `depends_on`, `files`, `gates`) está no YAML. Specs executáveis por task em
> [`EXECUTION/`](EXECUTION/). Derivado de [BLUEPRINT-Feature-dual-graph.md](BLUEPRINT-Feature-dual-graph.md). License: MIT.

**Branch:** `feat/dual-graph` · **Target:** v3.5.0 · **20 tasks em 6 fases**

---

## Visão Geral

- Total de tasks: **20**
- Tasks no rank 0 (sem dependência): **2** (`task-201`, `task-202`)
- Regra de ouro: **grafo dual 100% determinístico** — regex + markdown parser + BFS; nenhum LLM no CLI.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade dominante |
|---|---|---|---|
| 1 — Tipos + extração | T-201 a T-203 | parcial (201/202 ∥) | LOW–MED |
| 2 — Ingestão dual | T-204 a T-206 | parcial (204 ∥ 205 após 203) | MED |
| 3 — Travessia + backends | T-207 a T-209 | parcial | MED–HIGH |
| 4 — Comandos CLI | T-210 a T-212 | **SIM** (3 em rank após 209) | MED |
| 5 — Neo4j C1 | T-213 a T-215 | sequencial | HIGH |
| 6 — Integração + release | T-216 a T-220 | parcial | LOW–HIGH |

**Caminho crítico:** `T-201 → T-203 → T-205 → T-206 → T-219 → T-220`
(em paralelo: `T-207 → T-208 → T-209 → T-210..212`; `T-213 → T-214 → T-215 → T-219`).

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-201 | types.ts — code_symbol, requirement, affects, derives_from | ⏳ PENDING | — | MED |
| task-202 | static-analyzer — export SUPPORTED_EXTENSIONS + inString | ⏳ PENDING | — | LOW |
| task-203 | code-index.ts — extração determinística de símbolos | ⏳ PENDING | 201, 202 | MED |
| task-204 | requirement-ingest.ts — parser markdown RF/O/task | ⏳ PENDING | 201 | MED |
| task-205 | graph-ingest — code_symbol + contains + implements | ⏳ PENDING | 203 | MED |
| task-206 | dare graph ingest — wire requirements + flag | ⏳ PENDING | 204, 205 | LOW |
| task-207 | traverse.ts — BFS tipado + locate() | ⏳ PENDING | 201 | HIGH |
| task-208 | KnowledgeGraph — traverse/locate em json + sqlite | ⏳ PENDING | 207 | MED |
| task-209 | graph-rag — stats tolerante + traverse delegate | ⏳ PENDING | 208 | LOW |
| task-210 | dare graph owners + impact | ⏳ PENDING | 208 | MED |
| task-211 | dare graph trace + locate | ⏳ PENDING | 208 | MED |
| task-212 | fixtures dual-graph (impact, locate, owners) | ⏳ PENDING | 207 | MED |
| task-213 | neo4j-graph — leituras Cypher reais (C1) | ⏳ PENDING | 201 | HIGH |
| task-214 | neo4j-graph — write queue + flush + hydrate init | ⏳ PENDING | 213 | HIGH |
| task-215 | factory — gate neo4j.experimental + contract tests | ⏳ PENDING | 208, 214 | MED |
| task-216 | ralph buildLocateContext pré-patch | ⏳ PENDING | 207, 208 | MED |
| task-217 | MCP graph_locate, graph_map_requirement, graph_traverse | ⏳ PENDING | 210, 211 | MED |
| task-218 | dare graph viz — subgraphs por camada (RF-11) | ⏳ PENDING | 201 | LOW |
| task-219 | dual-graph audit N-1 (O-01…O-07) | ⏳ PENDING | 206, 211, 212, 215 | HIGH |
| task-220 | CHANGELOG v3.5.0 + dare-graph.yml template | ⏳ PENDING | 219 | LOW |

---

## Tarefas por Fase

### Fase 1 — Tipos + extração
- task-201: Estender `graphrag/types.ts` (união fechada + interfaces)
- task-202: Exportar helpers de `static-analyzer.ts`
- task-203: Criar `graphrag/code-index.ts` com snapshot tests (deps: 201, 202)

### Fase 2 — Ingestão dual
- task-204: `requirement-ingest.ts` — parser determinístico (deps: 201)
- task-205: `graph-ingest.ts` — nós `code_symbol` (deps: 203)
- task-206: Wire `dare graph ingest` + `--requirements-only` (deps: 204, 205)

### Fase 3 — Travessia
- task-207: `traverse.ts` — BFS + `locate()` com limites hops/fanout
- task-208: Implementar `traverse`/`locate` em JsonGraph + GraphRAG
- task-209: `getStatistics` sem NaN em todos backends

### Fase 4 — Comandos CLI
- task-210: `dare graph owners` + `dare graph impact`
- task-211: `dare graph trace` + `dare graph locate`
- task-212: Fixtures `fixtures/dual-graph/` para metas O-02/O-03/O-04

### Fase 5 — Neo4j C1
- task-213: Leituras via Cypher parametrizado (RS-01/RS-05)
- task-214: Escritas await/flush; zero `void this.runMany`
- task-215: Gate experimental + contract tests 3 backends

### Fase 6 — Integração + release
- task-216: `buildLocateContext` opcional no execute/ralph
- task-217: MCP tools `graph_*`
- task-218: Viz com subgraphs requirement vs code_symbol
- task-219: Suite `dual-graph.test.ts` integrada
- task-220: CHANGELOG + template `dare-graph.yml`

---

## Próximas Etapas

1. Revisar grafo em `dag-graph-dual-graph.mmd`
2. Executar: `dare execute --dag DARE/dare-dag-dual-graph.yaml --next`
3. Task isolada: `/dare-execute task-201`

> **Nota:** `task-101` (`path-safety-extend`) pertence ao DAG **security-hardening**
> (`dare-dag-security-hardening.yaml`), não a esta feature.
