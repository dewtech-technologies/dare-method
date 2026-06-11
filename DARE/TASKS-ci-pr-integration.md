# TASKS — CI/PR Integration (`dare` gates como GitHub Action)

> Resumo legível de [dare-dag-ci-pr-integration.yaml](dare-dag-ci-pr-integration.yaml). DAG completo no YAML;
> specs em [`EXECUTION/`](EXECUTION/). Derivado de [BLUEPRINT-Feature-ci-pr-integration.md](BLUEPRINT-Feature-ci-pr-integration.md). License: MIT.

**Branch:** `feat/v3.11.0` · **Target:** v3.11.0 · **6 tasks · bloco de IDs 11xx**

---

## Visão Geral

- Total de tasks: **6**
- Rank 0: **1** (`task-1101` emitter) — frente mais linear (cada camada depende da anterior).
- Regra de ouro: **sem verificação nova** — só formato (annotations) + post (comentário); determinístico; default `fail-on: none`.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade |
|---|---|---|---|
| 1 — Emitter | T-1101 | rank 0 | MED |
| 2 — Flags nos gates | T-1102 | depende 1101 | MED |
| 3 — Action + dogfood | T-1103, T-1104 | parcial | MED, LOW |
| N-1 — Auditoria + docs | T-1105, T-1106 | não | MED, LOW |

**Caminho crítico:** `T-1101 → T-1102 → T-1103 → T-1105 → T-1106`

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-1101 | reporters/github.ts — emitAnnotations + upsertPrComment | ⏳ PENDING | — | MED |
| task-1102 | flags --format github / --comment / --fail-on nos gates | ⏳ PENDING | 1101 | MED |
| task-1103 | action.yml composite + workflow template | ⏳ PENDING | 1102 | MED |
| task-1104 | dogfood — CI do DARE usa a action | ⏳ PENDING | 1103 | LOW |
| task-1105 | auditoria N-1 — ci-pr-regression.test.ts | ⏳ PENDING | 1102, 1103 | MED |
| task-1106 | CHANGELOG + docs (ci-pr) | ⏳ PENDING | 1105 | LOW |

---

## Tarefas por Fase

### Fase 1 — Emitter
- **T-1101** `reporters/github.ts`: `emitAnnotations` (formato Actions) + `upsertPrComment` (idempotente por marker `<!-- dare-report -->`); sanitiza findings; token nunca logado.

### Fase 2 — Flags nos gates
- **T-1102** `--format github`/`--comment`/`--fail-on` em `review`/`guard`/`graph drift`; exit por `fail-on` (default `none`). Sem verificação nova.

### Fase 3 — Action + dogfood
- **T-1103** `action.yml` composite (`gate`/`args`/`fail-on`/`comment`) + template `dare-pr.yml`; permissões mínimas; pin por SHA.
- **T-1104** dogfood: o CI do próprio DARE usa a action em PRs (`fail-on: none`).

### Fase N-1 — Auditoria + docs
- **T-1105** `ci-pr-regression.test.ts`: annotations formadas, comentário atualiza (não duplica), token não logado, `fail-on none` não bloqueia, findings sanitizados, actions pinadas.
- **T-1106** CHANGELOG `[3.11.0]` + docs (flags + action).

---

## Próximas Etapas

1. Revisar este breakdown e o `dare-dag-ci-pr-integration.yaml`.
2. Executar via `/dare-dag-run` na branch `feat/v3.11.0` (ou pelo Cursor).
