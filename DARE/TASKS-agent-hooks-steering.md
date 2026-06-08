# TASKS — Agent Hooks + Steering Files

> Resumo legível de [dare-dag-agent-hooks-steering.yaml](dare-dag-agent-hooks-steering.yaml). DAG completo
> (com `depends_on`, `complexity`, `subtask_prompt`) está no YAML. Specs executáveis por task em
> [`EXECUTION/`](EXECUTION/). Derivado de [BLUEPRINT-Feature-agent-hooks-steering.md](BLUEPRINT-Feature-agent-hooks-steering.md). License: MIT.

**Branch:** `feat/agent-hooks-steering` · **Target:** v3.6.0 · **14 tasks em 6 fases**

---

## Visão Geral

- Total de tasks: **14** (`task-301` … `task-314`)
- Tasks no rank 0 (sem dependência): **1** (`task-301`)
- Regra de ouro: **o CLI é 100% determinístico** — registra, valida, resolve precedência e despacha
  via `spawn(cmd, argv, { shell:false })`; **nunca chama LLM** (RF-10). A semântica vive nas skills das IDEs.

### Escopo travado (BLUEPRINT §0)

- **Hooks por evento:** APENAS **Claude Code** (`settings.json`) + **git `pre-commit`** (universal).
- **Steering files:** nas **3 IDEs** (Claude / Cursor / Antigravity) via **MCP** (`GET /steering`).
- **Hooks nativos de Cursor/Antigravity:** **FORA da v3.6.0** (adiado; fallback `pre-commit` + `dare hooks run` manual).
  Nenhuma task de gatilho nativo Cursor/Antigravity neste DAG.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade dominante |
|---|---|---|---|
| 1 — Foundation (tipos + config + segurança) | T-301 a T-303 | sequencial (302→303 após 301) | MED |
| 2 — Steering (loader + resolver + comando) | T-304 a T-306 | parcial (304 ∥ após 301) | LOW–MED |
| 3 — Hooks (dispatcher + idempotência + telemetria + comando) | T-307 a T-310 | parcial (307/308 ∥) | LOW–HIGH |
| 4 — MCP + adapters IDE | T-311, T-312 | **SIM** (311 ∥ 312) | MED |
| 5 — Auditoria de segurança / deps (N-1) | T-313 | sequencial (sync de tudo) | HIGH |
| 6 — Release | T-314 | sequencial | LOW |

**Caminho crítico:** `T-301 → T-302 → T-303 → T-309 → T-310 → T-313 → T-314`
(em paralelo: `T-301 → T-304 → T-305 → {T-306, T-311}`; `T-301 → {T-307, T-308}` convergem em T-309; `T-310 → T-312`).

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-301 | hooks/types.ts + steering/types.ts — contratos fechados | ⏳ PENDING | — | MED |
| task-302 | hooks/allowlist.ts — ações fechadas + resolveAction | ⏳ PENDING | 301 | MED |
| task-303 | hooks/config.ts — Zod opt-in + seedHooksDefaults | ⏳ PENDING | 301, 302 | MED |
| task-304 | steering/loader.ts — descoberta + PROJECT-DNA base + .env* bloqueado | ⏳ PENDING | 301 | MED |
| task-305 | steering/resolver.ts — precedência determinística | ⏳ PENDING | 304 | MED |
| task-306 | commands/steering.ts — dare steering list\|show | ⏳ PENDING | 305 | LOW |
| task-307 | hooks/idempotency.ts — guard por hash de estado | ⏳ PENDING | 301 | LOW |
| task-308 | hooks/telemetry.ts — addNode/addEdge via graph-ingest | ⏳ PENDING | 301 | LOW |
| task-309 | hooks/dispatcher.ts — valida → spawn(shell:false) → telemetria | ⏳ PENDING | 302, 303, 307, 308 | HIGH |
| task-310 | commands/hooks.ts — dare hooks list\|run\|validate + trust gate | ⏳ PENDING | 309 | MED |
| task-311 | mcp-server — GET /steering?file=<rel> + /tools | ⏳ PENDING | 305 | MED |
| task-312 | Adapters IDE — Claude settings.json + pre-commit; Cursor/Antigravity adiados | ⏳ PENDING | 310 | MED |
| task-313 | Auditoria de segurança N-1 — injeção, shell:false, trust, deps | ⏳ PENDING | 309, 310, 311, 312, 306 | HIGH |
| task-314 | Release v3.6.0 — CHANGELOG + bump + project-generator/README | ⏳ PENDING | 313 | LOW |

---

## Tarefas por Fase

### Fase 1 — Foundation: tipos + config + segurança
- task-301: `hooks/types.ts` (HookEvent fechado, HookConfig, HookResult) + `steering/types.ts` (SteeringFile, SteeringResolution)
- task-302: `hooks/allowlist.ts` — `AllowedActionKey` fechada + `resolveAction` (deps: 301)
- task-303: `hooks/config.ts` — Zod opt-in, `parseHookConfig`, `seedHooksDefaultsIfAbsent` (deps: 301, 302)

### Fase 2 — Steering: loader + resolver
- task-304: `steering/loader.ts` — descobre `.dare/steering/*.md` + lê `PROJECT-DNA.md` (reuso, RF-08); `.env*` bloqueado (deps: 301)
- task-305: `steering/resolver.ts` — precedência base < project < glob < priority < path (A-6/O-07) (deps: 304)
- task-306: `commands/steering.ts` — `dare steering list|show` determinístico (deps: 305)

### Fase 3 — Hooks: dispatcher + comandos
- task-307: `hooks/idempotency.ts` — guard por hash de estado (RNF-02) (deps: 301)
- task-308: `hooks/telemetry.ts` — reuso `graph-ingest` addNode/addEdge (RF-12) (deps: 301)
- task-309: `hooks/dispatcher.ts` — valida → `spawn(shell:false)` → telemetria; trust gate; LLM fora do CLI (deps: 302, 303, 307, 308)
- task-310: `commands/hooks.ts` — `dare hooks list|run|validate`, exit-codes §5.1, trust gate (deps: 309)

### Fase 4 — MCP + adapters IDE
- task-311: `mcp-server/server.ts` — `GET /steering?file=` + `/tools`; auth/loopback herdados (3 IDEs) (deps: 305)
- task-312: Adapters — Claude `settings.example.json` (on-save) + `pre-commit`; Cursor/Antigravity adiados, fallback documentado (deps: 310)

### Fase 5 — Auditoria de segurança / deps (N-1)
- task-313: Testes de injeção/`shell:false`/trust gate (RS-01..06), `pnpm audit --prod`, cobertura núcleo ≥80% (deps: 309, 310, 311, 312, 306)

### Fase 6 — Release
- task-314: CHANGELOG `[3.6.0]`, `seedHooksDefaultsIfAbsent` no init/upgrade, README, bump `3.5.0 → 3.6.0` (deps: 313)

---

## Como rodar

1. Revisar o grafo: `/dare-dag-viz` sobre `DARE/dare-dag-agent-hooks-steering.yaml`.
2. Executar próxima task disponível: `dare execute --dag DARE/dare-dag-agent-hooks-steering.yaml --next`.
3. Task isolada: `/dare-execute task-301`.

> **Nota:** as specs `EXECUTION/task-3NN-*.md` referenciadas em cada `subtask_prompt` serão geradas
> no passo seguinte do `/dare-tasks`. O `subtask_prompt` cita a seção do BLUEPRINT e o arquivo de código real a tocar.
