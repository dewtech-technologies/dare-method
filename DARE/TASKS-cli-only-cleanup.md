# TASKS — Faxina CLI-only (monorepo enxuto)

> Resumo legível de [dare-dag-cli-only-cleanup.yaml](dare-dag-cli-only-cleanup.yaml). Specs em [`EXECUTION/`](EXECUTION/).
> Derivado de [BLUEPRINT-Feature-cli-only-cleanup.md](BLUEPRINT-Feature-cli-only-cleanup.md). License: MIT.

**Branch:** `feat/v3.13-cli-only` · **Target:** v3.13.0 · **6 tasks · bloco de IDs 13xx**

---

## Visão Geral

- Total de tasks: **6**
- Rank 0: **1** (`task-1301` auditoria doc pré-delete).
- Regra de ouro: **zero mudança funcional no CLI** — só remoção estrutural, links e gates.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexity |
|---|---|---|---|
| 1 — Auditoria doc | T-1301 | — | MED |
| 2 — Delete legado | T-1302 | — | LOW |
| 3 — Links + workspace | T-1303, T-1304 | sim | MED, LOW |
| 4 — Invariantes | T-1305 | — | MED |
| N-1 — Regressão + release | T-1306 | — | MED |

**Caminho crítico:** `T-1301 → T-1302 → T-1303 → T-1305 → T-1306`

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-1301 | auditoria doc — paridade packages/docs → docs-site | ⏳ PENDING | — | MED |
| task-1302 | remover packages/docs e packages/website | ⏳ PENDING | 1301 | LOW |
| task-1303 | auditoria de links (README, ROADMAP, implementations) | ⏳ PENDING | 1302 | MED |
| task-1304 | limpar workspaces root (package.json) | ⏳ PENDING | 1302 | LOW |
| task-1305 | cli-only-invariants.test.ts | ⏳ PENDING | 1303, 1304 | MED |
| task-1306 | CHANGELOG + ROADMAP + bump v3.13.0 | ⏳ PENDING | 1305 | MED |

---

## Tarefas por Fase

### Fase 1 — Auditoria doc
- **T-1301** Percorrer checklist DESIGN §RF-08; migrar para `docs-site/` qualquer gap (ex.: publish-a-skill); documentar conclusão.

### Fase 2 — Delete
- **T-1302** `git rm -r packages/docs packages/website`; confirmar zero arquivos rastreados.

### Fase 3 — Links + workspace (paralelo)
- **T-1303** Corrigir referências a paths removidos em README, ROADMAP, `packages/cli/README.md`, `implementations/*/README.md`, DARE/* (exceto histórico).
- **T-1304** Remover `packages/stacks/*` morto de `package.json` workspaces; comentário opcional em `pnpm-workspace.yaml`.

### Fase 4 — Invariantes
- **T-1305** Criar `cli-only-invariants.test.ts` + `cli-only-regression.test.ts` (dirs ausentes, rg zero refs, verify-docs verde).

### Fase N-1 — Release
- **T-1306** CHANGELOG `[3.13.0]`, ROADMAP Shipped, bump root + cli `package.json`; **tag v3.13.0 só após bump**.

---

## Como executar

```bash
dare execute --next --dag DARE/dare-dag-cli-only-cleanup.yaml
```

Paralelo intra-rank (fase 3):
```bash
/dare-dag-run-parallel --dag DARE/dare-dag-cli-only-cleanup.yaml
```

---

*Scaffolded by DARE Framework — 2026-06-20*
