# TASKS — Brownfield Discovery (Auto-Discovery de Padrões + Planejadores Leves)

> Resumo legível de [dare-dag-brownfield-discovery.yaml](dare-dag-brownfield-discovery.yaml). DAG completo
> (com `depends_on`, `complexity`, `spec_file`, `subtask_prompt`) está no YAML. Specs executáveis por task
> em [`EXECUTION/`](EXECUTION/) (virão em passo seguinte). Derivado de
> [BLUEPRINT-Feature-brownfield-discovery.md](BLUEPRINT-Feature-brownfield-discovery.md). License: MIT.

**Branch:** `feat/brownfield-discovery` · **Target:** v3.7.0 (repo em v3.6.0) · **11 tasks em 6 fases**

---

## Visão Geral

- Total de tasks: **11**
- Tasks no rank 0 (sem dependência): **2** (`task-401`, `task-402`)
- **Regra de ouro:** o CLI é 100% **determinístico** — minera FATOS por frequência/co-ocorrência sobre o
  inventário existente (`loadFileInventory`/`dna-facts.json`), emite `patterns-facts.json` + `PATTERNS.md`
  (skeleton `<!-- AGENT -->`). **Nenhum LLM no CLI.** Inferência semântica e personas Analyst/PM/Architect
  vivem nas **skills das IDEs** — 1 passagem, sequencial, só no planejamento (cautela de custo MetaGPT
  31k vs 19k tokens, 2308.00352; "High Operational Costs", 2508.00083). **Zero runtime multi-agente.**
- A feature **estende, não reescreve**: `dna`/`reverse` ficam byte-a-byte inalterados (RNF-06).

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade dominante |
|---|---|---|---|
| 1 — Foundation (tipos + detector + fatos) | T-401 a T-403 | parcial (401 ∥ 402; 403 após 402) | MED–HIGH |
| 2 — Comando `dare patterns` | T-404 | sequencial (após 403) | MED |
| 3 — Grafo + steering | T-405, T-406 | **SIM** (∥ após 401+403) | MED |
| 4 — Questionário + personas (idea-8) | T-407 a T-409 | parcial (408/409 ∥ após 407) | LOW–MED |
| 5 — Auditoria de segurança / deps (N-1) | T-410 | sequencial (junta tudo) | HIGH |
| 6 — Release | T-411 | sequencial | LOW |

**Caminho crítico:** `T-402 → T-403 → T-404 → T-410 → T-411`
(em paralelo após T-401+T-403: `T-405`, `T-406`; após T-403: `T-407 → {T-408, T-409}`;
`T-401` é raiz de fundação para T-405/T-406 mas mais curta que o ramo do detector.)

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-401 | graphrag/types.ts — union += pattern/evidenced_by/exhibits (FUNDAÇÃO) | ⏳ PENDING | — | HIGH |
| task-402 | utils/pattern-detector.ts — contratos + PATTERN_RULES + detectPatterns | ⏳ PENDING | — | HIGH |
| task-403 | utils/pattern-facts.ts — patterns-facts.json + renderPatternsSkeleton | ⏳ PENDING | 402 | MED |
| task-404 | commands/patterns.ts — dare patterns --check/--dir/--modules read-only | ⏳ PENDING | 403 | MED |
| task-405 | graphrag/pattern-ingest.ts — pattern/evidenced_by/exhibits no grafo | ⏳ PENDING | 401, 403 | MED |
| task-406 | steering/loader.ts + graph KNOWN_NODE_TYPES — PATTERNS.md 2ª fonte-base | ⏳ PENDING | 401, 403 | MED |
| task-407 | utils/design-questionnaire.ts — fatos+gaps → PlanningQuestion[] | ⏳ PENDING | 403 | MED |
| task-408 | commands/design.ts — flag --interactive emite questionário | ⏳ PENDING | 407 | LOW |
| task-409 | skills /dare-design (Analyst+PM) + /dare-blueprint (Architect) | ⏳ PENDING | 407 | MED |
| task-410 | Auditoria N-1 — read-only, path-confinement, sem-LLM, .env, deps | ⏳ PENDING | 404, 405, 406, 408, 409 | HIGH |
| task-411 | Release v3.7.0 — CHANGELOG [3.7.0] + bump 3.6.0 → 3.7.0 + README | ⏳ PENDING | 410 | LOW |

---

## Tarefas por Fase

### Fase 1 — Foundation (tipos + detector + fatos)
- **task-401**: Estender o union FECHADO `graphrag/types.ts` — `NodeType += 'pattern'`,
  `EdgeType += 'evidenced_by'|'exhibits'`, `ALL_*` atualizados (stats sem NaN). **Task de fundação
  arriscada — raiz de outras** (RF-03/RNF-05).
- **task-402**: Criar `utils/pattern-detector.ts` — contratos (`DiscoveredPattern`/`PatternKind`),
  `PATTERN_RULES` plugáveis (≥5 categorias por co-ocorrência), `detectPatterns` determinístico. Reusa
  `loadFileInventory`/`isTestFile`/`inString` (RF-01/O-01; A-2/A-3/A-4/A-5).
- **task-403**: Criar `utils/pattern-facts.ts` — `patterns-facts.json` + `renderPatternsSkeleton`
  com `<!-- AGENT -->` e "⚠️ Incertezas" (deps: 402; RF-02/RF-07).

### Fase 2 — Comando `dare patterns`
- **task-404**: Criar `commands/patterns.ts` + registrar no `bin/` — `--check`/`--dir`/`--modules`/`--inject`,
  path-safety, read-only espelhando `dna`/`reverse` (deps: 403; RF-08/RS-01/RS-03; A-1/A-11).

### Fase 3 — Grafo + steering
- **task-405**: Criar `graphrag/pattern-ingest.ts` — nó `pattern`, arestas `evidenced_by`/`exhibits`;
  reusa `addNode`/`addEdge`; best-effort (deps: 401, 403; RF-03/O-03; A-6).
- **task-406**: Estender `steering/loader.ts` (`PATTERNS.md` como 2ª fonte-base) + `graph.ts`
  `KNOWN_NODE_TYPES += 'pattern'` + wire `--inject` opt-in idempotente (deps: 401, 403; RF-09/O-03; A-7/RS-04).

### Fase 4 — Questionário + personas (idea-8 leve)
- **task-407**: Criar `utils/design-questionnaire.ts` — `buildDesignQuestionnaire`/`buildBlueprintQuestionnaire`
  determinísticos; gaps→`kind:'gap'`; ancoragem em padrões reais (deps: 403; RF-04/RF-05/RS-05; A-8/A-9/A-10).
- **task-408**: Estender `commands/design.ts` — flag `--interactive` emite o bloco de questionário; sem flag =
  intocado (deps: 407; RF-04/RNF-06; A-10).
- **task-409**: Atualizar skills `/dare-design` (Analyst+PM) e `/dare-blueprint` (Architect) — 1 passagem,
  sequencial, só no planejamento; zero swarm no CLI (deps: 407; RF-04/RF-05/RF-06/O-04/O-05/O-06; A-8/A-9).

### Fase 5 — Auditoria de segurança / deps (N-1)
- **task-410**: Suíte integrada `patterns.test.ts` (O-01…O-07) + testes de segurança (path-confinement,
  `.env`, read-only, `--inject` idempotente), grep sem-LLM/sem-`exec`, determinismo CRLF+LF, `pnpm audit --prod`,
  `dare review` sem HIGH (deps: 404, 405, 406, 408, 409; RS-01..05; RNF-02/RNF-04/RNF-05).

### Fase 6 — Release
- **task-411**: CHANGELOG `[3.7.0]` + bump `3.6.0 → 3.7.0` (raiz + `packages/cli`) + README; retrocompat/opt-in
  100% (deps: 410).

---

## Como rodar

```bash
# Sequência completa seguindo o DAG:
dare execute --dag DARE/dare-dag-brownfield-discovery.yaml --next

# Task isolada:
/dare-execute task-401

# Visualizar o grafo de dependências:
/dare-dag-viz
```

1. Revisar e aprovar este TASKS + o YAML (checklist §12 do BLUEPRINT).
2. Branch `feat/brownfield-discovery`.
3. Executar via `/dare-dag-run` (rank 0 = `task-401` ∥ `task-402`).

> **Nota:** os pré-requisitos v3.5.0 (dual-graph) e v3.6.0 (steering) já estão entregues e são **reusados**,
> não reimplementados (BLUEPRINT §0/§Pré-requisitos). A feature é **opt-in puro**.
