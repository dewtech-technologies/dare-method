# TASKS — `dare serve` (núcleo unificado + protocolo de fio)

> Resumo legível de [dare-dag-dare-serve-protocol.yaml](dare-dag-dare-serve-protocol.yaml). Specs em [`EXECUTION/`](EXECUTION/).
> Derivado de [BLUEPRINT-Feature-dare-serve-protocol.md](BLUEPRINT-Feature-dare-serve-protocol.md). License: MIT.

**Branch:** `feat/v3.16-serve-protocol` · **Target:** v3.16.0 · **12 tasks · bloco de IDs 16xx**

---

## Visão Geral

- Total de tasks: **12**
- Rank 0 (paralelo): **3** (`1601` protocolo · `1602` extração contexto · `1603` contrato do núcleo).
- Rank 1 (paralelo): **4** (extração dos 8 núcleos, 2 comandos por task).
- Regra de ouro: **zero comando duplicado.** Extrai `run<Cmd>` dos 8 comandos para `core/commands`;
  CLI, chat e serve chamam a **mesma** função. Heurística sempre roda; `facts`/`cwd` server-side;
  `maybeRunAiEnrichment` aposentado.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexity |
|---|---|---|---|
| 1 — Fundação | T-1601, T-1602, T-1603 | sim (rank 0) | MED, HIGH, MED |
| 2 — Extração dos núcleos | T-1604, T-1605, T-1606, T-1607 | sim (rank 1) | HIGH ×4 |
| 3 — Rotas de comando | T-1608 | — | HIGH |
| 4 — Montagem + `dare serve` | T-1609 | — | MED |
| 5 — Testes | T-1610 | — | MED |
| N-1 — Auditoria + release | T-1611, T-1612 | não | MED, MED |

**Caminho crítico:** `T-1603 → T-1604…1607 → T-1608 → T-1609 → T-1610 → T-1611 → T-1612`

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-1601 | serve/protocol.ts — manifest derivado de PARITY_CONTRACTS | ⏳ PENDING | — | MED |
| task-1602 | extrair rotas de contexto p/ serve/routes/context.ts | ⏳ PENDING | — | HIGH |
| task-1603 | core/commands/types.ts — contrato + COMMAND_RUNNERS | ⏳ PENDING | — | MED |
| task-1604 | extrair run<Cmd> de reverse + dna | ⏳ PENDING | 1603 | HIGH |
| task-1605 | extrair run<Cmd> de patterns + migrate | ⏳ PENDING | 1603 | HIGH |
| task-1606 | extrair run<Cmd> de design + blueprint | ⏳ PENDING | 1603 | HIGH |
| task-1607 | extrair run<Cmd> de review + refine | ⏳ PENDING | 1603 | HIGH |
| task-1608 | serve/routes/commands.ts — /protocol, /providers, POST (timeout→504) | ⏳ PENDING | 1601, 1604, 1605, 1606, 1607 | HIGH |
| task-1609 | serve/index.ts + bin/serve.ts + comando `dare serve` | ⏳ PENDING | 1602, 1608 | MED |
| task-1610 | testes — anti-duplicação + heurística + manifest + timeout + providers + cwd | ⏳ PENDING | 1609 | MED |
| task-1611 | auditoria N-1 — regressão CLI + MCP + superfície | ⏳ PENDING | 1610 | MED |
| task-1612 | CHANGELOG + ROADMAP + doc-site + bump v3.16.0 | ⏳ PENDING | 1611 | MED |

---

## Tarefas por Fase

### Fase 1 — Fundação (rank 0)
- **T-1601** `serve/protocol.ts`: `PROTOCOL_VERSION` + `buildManifest()` derivado de `SEMANTIC_COMMANDS` (`heuristicAlwaysRuns`, `requiresInput`, schemas). Sem hardcode.
- **T-1602** Extrair handlers de contexto do `mcp-server/server.ts` para `serve/routes/context.ts`; `createMcpServer` monta o router — **zero regressão**.
- **T-1603** `core/commands/types.ts`: `CommandRunOptions`/`CommandRunResult`/`CommandRunner` + registry `COMMAND_RUNNERS`.

### Fase 2 — Extração dos núcleos (rank 1, paralelo)
- **T-1604** `runReverse` + `runDna` em `core/commands/`; actions viram cascas.
- **T-1605** `runPatterns` + `runMigrate`; idem.
- **T-1606** `runDesign` (input.description) + `runBlueprint` (lê DESIGN.md); idem.
- **T-1607** `runReview` (input.taskId, analisador+verdito) + `runRefine` (input.taskId); idem (preservar exit codes do review na casca).

### Fase 3 — Rotas de comando
- **T-1608** `serve/routes/commands.ts`: `GET /protocol`, `GET /providers` (default sem spawn; `?probe=true` cacheado), `POST /commands/:command` → `COMMAND_RUNNERS[command]` com `cwd=projectRoot`, `AbortController` (teto `DARE_SERVE_RUN_TIMEOUT`=180s), abort ⇒ **504**.

### Fase 4 — Montagem + comando CLI
- **T-1609** `createServeApp` (= `createApp` + 2 routers + `/execute`⇒405) + `bin/serve.ts` + `commands/serve.ts` registrado.

### Fase 5 — Testes
- **T-1610** `protocol-parity`, `heuristic-always`, `commands`, `serve-timeout`, `providers`, `security-cwd` + invariantes (rg: sem `ora/chalk/process.exit` no núcleo; sem `maybeRunAiEnrichment`; sem heurística/enrich em `commands/*`+`serve`).

### Fase N-1 — Auditoria + release
- **T-1611** Suíte completa (CLI+MCP+serve+core), `serve-surface-regression`; confirma 8 runners, cascas, MCP-só-contexto, serve-superset, `/execute`⇒405.
- **T-1612** CHANGELOG `[3.16.0]`, ROADMAP, `docs-site/protocol.md`, bump root+cli; **tag só após bump**.

---

## Como executar

Próxima task pronta:
```bash
dare execute --next --dag DARE/dare-dag-dare-serve-protocol.yaml
```

Paralelo intra-rank (fundação e extração dos núcleos):
```
/dare-dag-run-parallel --dag DARE/dare-dag-dare-serve-protocol.yaml
```

Ou pelo chat da IDE (caminho de 1ª classe, equivalente):
```
/dare-execute
```

---

## Fora de escopo (v3.16 → futuro)

| Item | Fase |
|---|---|
| `POST /execute` que aplica patch no worktree | v3.17 (responde 405) |
| Modelo de job assíncrono / SSE de progresso | v3.17 |
| Transporte stdio/JSON-RPC (estilo Codex App Server) | futuro |
| Extensão VS Code (consumidor gráfico) | v4.0 |

---

*Scaffolded by DARE Framework — 2026-06-21*
