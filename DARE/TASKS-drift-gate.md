# TASKS — Drift Gate (spec ↔ código)

> Resumo legível de [dare-dag-drift-gate.yaml](dare-dag-drift-gate.yaml). DAG completo no YAML;
> specs em [`EXECUTION/`](EXECUTION/). Derivado de [BLUEPRINT-Feature-drift-gate.md](BLUEPRINT-Feature-drift-gate.md). License: MIT.

**Branch:** `feat/drift-gate` · **Target:** v3.10.0 · **6 tasks · bloco de IDs 7xx**

---

## Visão Geral

- Total de tasks: **6**
- Rank 0 (paralelo): **3** (`task-701` detecção · `task-702` ingest-hash · `task-703` config).
- Regra de ouro: gate **100% determinístico** — só travessia do grafo dual, zero LLM.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade |
|---|---|---|---|
| 1 — Detecção + ingest + config | T-701, T-702, T-703 | **sim** (rank 0) | LOW–MED |
| 2 — Comando | T-704 | depende de 701, 703 | MED |
| N-1 — Auditoria + docs | T-705, T-706 | não | MED, LOW |

**Caminho crítico:** `T-701 → T-704 → T-705 → T-706`

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-701 | graphrag/drift.ts — detectDrift + tipos | ⏳ PENDING | — | MED |
| task-702 | requirement-ingest — contentHash + ingestedAt | ⏳ PENDING | — | LOW |
| task-703 | config — bloco drift (zod) | ⏳ PENDING | — | LOW |
| task-704 | dare graph drift — subcomando + exit 7 | ⏳ PENDING | 701, 703 | MED |
| task-705 | auditoria N-1 — drift-regression.test.ts | ⏳ PENDING | 701, 702, 704 | MED |
| task-706 | CHANGELOG + docs (graph drift) | ⏳ PENDING | 705 | LOW |

---

## Tarefas por Fase

### Fase 1 — Detecção + ingest + config (rank 0)
- **T-701** `graphrag/drift.ts`: `detectDrift` reusa `getEdges`/`queryNodes`; 3 kinds (req órfão, código órfão, stale); `staleIndeterminate` quando falta hash.
- **T-702** `requirement-ingest.ts`: grava `contentHash`/`ingestedAt` no nó `requirement` (habilita stale).
- **T-703** config `drift` (zod): `enabled/maxOrphanReqs/maxOrphanCode/failOnStale/ignore[]`; default `enabled:false`.

### Fase 2 — Comando
- **T-704** `dare graph drift`: subcomando de `graph` (não cria skill nova); `--strict/--format/--modules`; **exit 7** acima do limiar.

### Fase N-1 — Auditoria + docs
- **T-705** `drift-regression.test.ts`: 3 kinds, allowlist, stale→WARN sem hash, exit 7 só com `--strict`, determinístico.
- **T-706** CHANGELOG `[3.10.0]` + docs (`graph drift` + bloco `drift` + exit codes `…/7`).

---

## Próximas Etapas

1. Revisar este breakdown e o `dare-dag-drift-gate.yaml`.
2. Executar via `/dare-dag-run` na branch `feat/drift-gate` (ou pelo Cursor).
