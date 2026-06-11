# TASKS — Dynamic DAG (nested sub-DAGs + replan estrutural)

> Resumo legível de [dare-dag-dynamic-dag.yaml](dare-dag-dynamic-dag.yaml). DAG completo no YAML;
> specs em [`EXECUTION/`](EXECUTION/). Derivado de [BLUEPRINT-Feature-dynamic-dag.md](BLUEPRINT-Feature-dynamic-dag.md). License: MIT.

**Branch:** `feat/v3.11.0` · **Target:** v3.11.0 · **7 tasks · bloco de IDs 9xx**

---

## Visão Geral

- Total de tasks: **7**
- Rank 0 (paralelo): **2** (`task-901` splice · `task-902` config maxDepth).
- Regra de ouro: splice/topo-sort/limite **determinísticos**; LLM só no `AgentDriver` da sub-task.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade |
|---|---|---|---|
| 1 — Splice + config | T-901, T-902 | sim (rank 0) | MED, LOW |
| 2 — Integração REPLAN + refine manual | T-903, T-904 | parcial | HIGH, MED |
| 3 — Persistência + viz | T-905 | depende 901/903 | MED |
| N-1 — Auditoria + docs | T-906, T-907 | não | MED, LOW |

**Caminho crítico:** `T-901 → T-903 → T-905 → T-906 → T-907`

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-901 | dag-runner/sub-dag.ts — spliceSubDag + tipos | ✅ DONE | — | MED |
| task-902 | config — loop.maxDepth (zod) | ✅ DONE | — | LOW |
| task-903 | execute.ts — REPLAN → splice | ✅ DONE | 901, 902 | HIGH |
| task-904 | refine --split --apply no DAG ativo | ✅ DONE | 901 | MED |
| task-905 | persistência (state.json) + dag viz nesting | ✅ DONE | 901, 903 | MED |
| task-906 | auditoria N-1 — dynamic-dag-regression.test.ts | ✅ DONE | 903, 904, 905 | MED |
| task-907 | CHANGELOG + docs (dynamic DAG) | ✅ DONE | 906 | LOW |

---

## Tarefas por Fase

### Fase 1 — Splice + config (rank 0)
- **T-901** `sub-dag.ts`: `spliceSubDag` (aciclicidade + idempotência), `nestingDepth`, `CycleError`/`MaxDepthError`.
- **T-902** config `loop.maxDepth` (zod, default 2).

### Fase 2 — Integração
- **T-903** `execute.ts`: `REPLAN` → `refine --split` + `spliceSubDag`; `MaxDepth`/`Cycle` → `ESCALATE`; reusa `decideNextAction`.
- **T-904** `refine --split --apply`: injeta sub-DAG no DAG ativo (modo manual).

### Fase 3 — Persistência + viz
- **T-905** nesting persistido em `state.json`; `dag viz` agrupa sub-tasks sob o pai.

### Fase N-1 — Auditoria + docs
- **T-906** `dynamic-dag-regression.test.ts`: replan via sub-DAG, sem ciclo, maxDepth→ESCALATE, flat inalterado, determinístico.
- **T-907** CHANGELOG `[3.11.0]` + docs (maxDepth + nesting do viz).

---

## Próximas Etapas

1. Revisar este breakdown e o `dare-dag-dynamic-dag.yaml`.
2. Executar via `/dare-dag-run` na branch `feat/v3.11.0` (ou pelo Cursor).
