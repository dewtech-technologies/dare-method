# TASKS — Terminal ↔ Chat Parity (assistente de código unificado no terminal)

> Resumo legível de [dare-dag-terminal-agent-parity.yaml](dare-dag-terminal-agent-parity.yaml). DAG completo no YAML;
> specs em [`EXECUTION/`](EXECUTION/). Derivado de [BLUEPRINT-Feature-terminal-agent-parity.md](BLUEPRINT-Feature-terminal-agent-parity.md). License: MIT.

**Branch:** `codex/cli-core-agent-providers` · **Target:** v3.12.0 · **10 tasks · bloco de IDs 12xx**

---

## Visão Geral

- Total de tasks: **10**
- Rank 0 (paralelo): **2** (`task-1201` resolve provider · `task-1202` contrato de paridade).
- Regra de ouro: heurística sempre roda (determinística); IA é camada **opcional e validada por schema**.
  Terminal `dare <cmd> --ai` ≡ chat `/dare-<cmd>`. Sem SDK de LLM no core (só `claude.ts`).

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade |
|---|---|---|---|
| 1 — Fundação (resolve + contrato) | T-1201, T-1202 | sim (rank 0) | MED, MED |
| 2 — Execução multi-provider | T-1203, T-1204 | parcial | HIGH, MED |
| 3 — Apply completo + `--json` | T-1205, T-1206 | parcial | HIGH, MED |
| 4 — Paridade & doutrina | T-1207, T-1208 | parcial | LOW, MED |
| N-1 — Auditoria + docs | T-1209, T-1210 | não | MED, LOW |

**Caminho crítico:** `T-1202 → T-1205 → T-1208 → T-1209 → T-1210`

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-1201 | ai/resolve.ts — resolução única de provider | ⏳ PENDING | — | MED |
| task-1202 | ai/parity.ts — contrato de paridade terminal/chat | ⏳ PENDING | — | MED |
| task-1203 | drivers de execução cursor + antigravity | ⏳ PENDING | 1201 | HIGH |
| task-1204 | execute.ts — selecionar cursor/antigravity | ⏳ PENDING | 1201, 1203 | MED |
| task-1205 | pipeline — apply completo de migrate e review | ⏳ PENDING | 1202 | HIGH |
| task-1206 | --json uniforme + ai doctor capacidade | ⏳ PENDING | 1201, 1205 | MED |
| task-1207 | skills /dare-* citam o equivalente terminal | ⏳ PENDING | 1202 | LOW |
| task-1208 | terminal-parity.test.ts — paridade por capacidade | ⏳ PENDING | 1202, 1205, 1207 | MED |
| task-1209 | auditoria N-1 — terminal-parity-regression | ⏳ PENDING | 1204, 1206, 1208 | MED |
| task-1210 | CHANGELOG + docs (terminal parity) | ⏳ PENDING | 1209 | LOW |

---

## Tarefas por Fase

### Fase 1 — Fundação (rank 0)
- **T-1201** `ai/resolve.ts`: `resolveProviderName` (flag > config > default) + `providerToDriverId`; refatora execute/pipeline.
- **T-1202** `ai/parity.ts`: `PARITY_CONTRACTS` (comando → skill, terminal, artifacts, schemaFields) + `parityFor`.

### Fase 2 — Execução multi-provider
- **T-1203** `agent/drivers/cursor.ts` + `antigravity.ts`: `AgentDriver` via `safeSpawn` (padrão do `codex.ts`).
- **T-1204** `execute.ts`: `--driver cursor|antigravity` selecionável; provider ausente => erro claro; compat preservada.

### Fase 3 — Apply completo + `--json`
- **T-1205** `pipeline`: `applyMigrateEnrichment` (reescreve MIGRATION.md) + `applyReviewEnrichment` (injeta veredito).
- **T-1206** `--json` em todos os `--ai`; `dare ai doctor` reporta capacidade (enrichment + execução).

### Fase 4 — Paridade & doutrina
- **T-1207** skills `/dare-*` citam `dare <cmd> --ai`; nenhuma skill removida (chat 1ª classe).
- **T-1208** `terminal-parity.test.ts`: trava o contrato (skill existe + flags + schemaFields + apply nos artifacts).

### Fase N-1 — Auditoria + docs
- **T-1209** `terminal-parity-regression.test.ts`: heurística sem `--ai`; provider ausente => exit≠0; 4 providers; sem SDK no core; chat sem regressão.
- **T-1210** CHANGELOG `[3.12.0]` + docs-site (contrato de paridade + 4 providers).

---

## Como executar

Próxima task pronta:
```bash
dare execute --next --dag DARE/dare-dag-terminal-agent-parity.yaml
```

Terminal-first com provider (qualquer um dos 4):
```bash
dare execute --agent --driver codex --dag DARE/dare-dag-terminal-agent-parity.yaml
dare execute --agent --driver cursor --dag DARE/dare-dag-terminal-agent-parity.yaml
```

Ou pelo chat da IDE (caminho de 1ª classe, equivalente):
```
/dare-execute
```

---

*Scaffolded by DARE Framework — 2026-06-20*
