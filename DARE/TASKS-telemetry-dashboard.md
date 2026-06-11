# TASKS — Local Telemetry Dashboard

> Resumo legível de [dare-dag-telemetry-dashboard.yaml](dare-dag-telemetry-dashboard.yaml). DAG completo no YAML;
> specs em [`EXECUTION/`](EXECUTION/). Derivado de [BLUEPRINT-Feature-telemetry-dashboard.md](BLUEPRINT-Feature-telemetry-dashboard.md). License: MIT.

**Branch:** `feat/v3.11.0` · **Target:** v3.11.0 · **7 tasks · bloco de IDs 10xx**

---

## Visão Geral

- Total de tasks: **7**
- Rank 0 (paralelo): **2** (`task-1001` aggregator · `task-1002` app compartilhado).
- Regra de ouro: **local-first, read-only, LLM-free**; front vanilla (sem bundler, D-002); reusa Express+hardening do MCP.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade |
|---|---|---|---|
| 1 — Aggregator + app compartilhado | T-1001, T-1002 | sim (rank 0) | MED |
| 2 — Rotas | T-1003 | depende 1001/1002 | MED |
| 3 — Comando + front + skill | T-1004, T-1005 | parcial | MED |
| N-1 — Auditoria + docs | T-1006, T-1007 | não | MED, LOW |

**Caminho crítico:** `T-1001 → T-1003 → T-1004 → T-1006 → T-1007`

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-1001 | telemetry/aggregator.ts — aggregateTelemetry (read-only) | ⏳ PENDING | — | MED |
| task-1002 | http/app.ts — Express compartilhado (refactor MCP) | ⏳ PENDING | — | MED |
| task-1003 | dashboard/routes.ts — /api/telemetry + /dashboard | ⏳ PENDING | 1001, 1002 | MED |
| task-1004 | commands/dashboard.ts — dare dashboard + skill 3 IDEs | ⏳ PENDING | 1003 | MED |
| task-1005 | templates/dashboard — front vanilla | ⏳ PENDING | 1003 | MED |
| task-1006 | auditoria N-1 — dashboard-regression.test.ts | ⏳ PENDING | 1004, 1005 | MED |
| task-1007 | CHANGELOG + docs (dashboard) | ⏳ PENDING | 1006 | LOW |

---

## Tarefas por Fase

### Fase 1 — Aggregator + app (rank 0)
- **T-1001** `aggregator.ts`: `aggregateTelemetry` read-only (DAG/gates/custo/best-of-N/guard/drift); estados vazios.
- **T-1002** `http/app.ts`: `createApp` com middleware do MCP; refatora `mcp-server` para usá-lo (sem mudar contrato).

### Fase 2 — Rotas
- **T-1003** `dashboard/routes.ts`: `/dashboard` (HTML), `/api/telemetry` (JSON), assets confinados; read-only.

### Fase 3 — Comando + front + skill
- **T-1004** `dare dashboard [--port] [--no-open]`: sobe loopback+token, abre browser; skill `/dare-dashboard` nas 3 IDEs (+ `CLI_COMMANDS`).
- **T-1005** `templates/dashboard/` vanilla: painéis (progresso/gates/custo/best-of-N/guard/drift) via SVG inline.

### Fase N-1 — Auditoria + docs
- **T-1006** `dashboard-regression.test.ts`: 401 sem token, read-only, assets confinados, grafo vazio, parity verde.
- **T-1007** CHANGELOG `[3.11.0]` + docs (comando) + paridade.

---

## Próximas Etapas

1. Revisar este breakdown e o `dare-dag-telemetry-dashboard.yaml`.
2. Executar via `/dare-dag-run` na branch `feat/v3.11.0` (ou pelo Cursor).
