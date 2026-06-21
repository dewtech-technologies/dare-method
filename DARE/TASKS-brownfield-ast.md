# TASKS — Brownfield AST (tree-sitter no `reverse --deep`)

> Resumo legível de [dare-dag-brownfield-ast.yaml](dare-dag-brownfield-ast.yaml). Specs em [`EXECUTION/`](EXECUTION/).
> Derivado de [BLUEPRINT-Feature-brownfield-ast.md](BLUEPRINT-Feature-brownfield-ast.md). License: MIT.

**Branch:** `feat/v3.14-brownfield-ast` · **Target:** v3.14.0 · **10 tasks · bloco de IDs 14xx**

---

## Visão Geral

- Total de tasks: **10**
- Rank 0: **1** (`task-1401` fundação AST).
- Regra de ouro: **regex permanece baseline**; `--ast` produz superset mergeado; zero LLM no core.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexity |
|---|---|---|---|
| 1 — Fundação AST | T-1401, T-1402 | sequencial | MED, MED |
| 2 — Integração + CLI | T-1403, T-1404 | sequencial | HIGH, MED |
| 3 — Linguagens P1 | T-1405, T-1406, T-1407 | sim | HIGH, MED, MED |
| 4 — Linguagens P2 | T-1408 | — | MED |
| N-1 — Regressão + release | T-1409, T-1410 | sequencial | MED, MED |

**Caminho crítico:** `T-1401 → T-1402 → T-1403 → T-1405 → T-1408 → T-1409 → T-1410`

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-1401 | ast/types + loader + deps optional | ⏳ PENDING | — | MED |
| task-1402 | ast/merge.ts — dedupe superset | ⏳ PENDING | 1401 | MED |
| task-1403 | datamodel — pipeline híbrido AST+regex | ⏳ PENDING | 1402 | HIGH |
| task-1404 | reverse.ts — flag --ast + extraction facts | ⏳ PENDING | 1403 | MED |
| task-1405 | ast/languages/typescript — queries P1 | ⏳ PENDING | 1403 | HIGH |
| task-1406 | ast/languages/python — queries P1 | ⏳ PENDING | 1403 | MED |
| task-1407 | ast/languages/php — queries P1 | ⏳ PENDING | 1403 | MED |
| task-1408 | ast/languages P2 — go, ruby, rust | ⏳ PENDING | 1405, 1406, 1407 | MED |
| task-1409 | brownfield-ast-regression + tarball gate | ⏳ PENDING | 1404, 1408 | MED |
| task-1410 | CHANGELOG + ROADMAP + bump v3.14.0 | ⏳ PENDING | 1409 | MED |

---

## Tarefas por Fase

### Fase 1 — Fundação AST
- **T-1401** `ast/types.ts`, `ast/loader.ts`, optionalDeps, build copy WASM.
- **T-1402** `ast/merge.ts` + `normalizeRoute` + testes dedupe.

### Fase 2 — Integração + CLI
- **T-1403** `extractDataModelDetailed`, pipeline híbrido; default sem `--ast` inalterado.
- **T-1404** `--ast` em `reverse.ts`; `reverse-facts.extraction`; `--check --ast` preview.

### Fase 3 — Linguagens P1 (paralelo)
- **T-1405** TypeScript/JS — fixtures F-01, F-02, F-05.
- **T-1406** Python — fixture F-03.
- **T-1407** PHP — fixture F-04.

### Fase 4 — Linguagens P2
- **T-1408** Go, Ruby, Rust — best-effort + fallback regex.

### Fase N-1 — Regressão + release
- **T-1409** `brownfield-ast-regression.test.ts`; Prisma/SQL intactos (F-06); tarball ≤ +10%.
- **T-1410** docs-site brownfield.md, skills `/dare-reverse`, CHANGELOG `[3.14.0]`, bump.

---

## Como executar

```bash
dare execute --next --dag DARE/dare-dag-brownfield-ast.yaml
```

Paralelo intra-rank (fase 3):
```bash
/dare-dag-run-parallel --dag DARE/dare-dag-brownfield-ast.yaml
```

---

*Scaffolded by DARE Framework — 2026-06-21*
