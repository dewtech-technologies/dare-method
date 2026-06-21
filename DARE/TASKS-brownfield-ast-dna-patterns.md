# TASKS — Brownfield AST DNA + Patterns (v3.15)

> Resumo legível de [dare-dag-brownfield-ast-dna-patterns.yaml](dare-dag-brownfield-ast-dna-patterns.yaml).
> Specs em [`EXECUTION/`](EXECUTION/). Derivado de [BLUEPRINT-Feature-brownfield-ast-dna-patterns.md](BLUEPRINT-Feature-brownfield-ast-dna-patterns.md).

**Branch:** `feat/v3.15-brownfield-ast-dna-patterns` · **Target:** v3.15.0 · **10 tasks · bloco 15xx**

---

## Visão Geral

- Total de tasks: **10**
- Rank 0: **1** (`task-1501` fundação conventions)
- Regra de ouro: **regex baseline**; `--ast` enriquece DNA/Patterns; reutiliza loader v3.14

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexity |
|---|---|---|---|
| 1 — Fundação conventions | T-1501 | — | MED |
| 2 — DNA track | T-1502, T-1503 | sequencial | HIGH, MED |
| 2 — Patterns track | T-1504, T-1505, T-1506 | 1504∥1502 após 1501 | MED, HIGH, MED |
| 3 — Testes | T-1507, T-1508 | sim após CLI | MED, MED |
| N-1 — Regressão + release | T-1509, T-1510 | sequencial | MED, MED |

**Caminho crítico:** `T-1501 → T-1502 → T-1503 → T-1509 → T-1510`

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-1501 | ast/conventions foundation + merge | ⏳ PENDING | — | MED |
| task-1502 | dna-detector — pipeline híbrido AST | ⏳ PENDING | 1501 | HIGH |
| task-1503 | dna.ts — flag --ast + extraction facts | ⏳ PENDING | 1502 | MED |
| task-1504 | ast/conventions/patterns-extract | ⏳ PENDING | 1501 | MED |
| task-1505 | pattern-detector — pipeline híbrido AST | ⏳ PENDING | 1504 | HIGH |
| task-1506 | patterns.ts — flag --ast + extraction facts | ⏳ PENDING | 1505 | MED |
| task-1507 | dna AST tests + fixtures F-D01..F-D03 | ⏳ PENDING | 1503 | MED |
| task-1508 | patterns AST tests + fixtures F-P01..F-P03 | ⏳ PENDING | 1506 | MED |
| task-1509 | brownfield-ast-dna-patterns-regression | ⏳ PENDING | 1503, 1506 | MED |
| task-1510 | CHANGELOG + ROADMAP + bump v3.15.0 | ⏳ PENDING | 1509 | MED |

---

## Como executar

```bash
dare execute --next --dag DARE/dare-dag-brownfield-ast-dna-patterns.yaml
```

Paralelo intra-rank (após task-1501):
```bash
/dare-dag-run-parallel --dag DARE/dare-dag-brownfield-ast-dna-patterns.yaml
```
