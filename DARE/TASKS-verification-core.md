# TASKS — Núcleo de Verificação Confiável (Reliable Verification Core)

> Resumo legível de [dare-dag-verification-core.yaml](dare-dag-verification-core.yaml). DAG completo
> (com `depends_on`, `parallel_group`, `files`, `gates`) está no YAML. Specs executáveis por task em
> [`EXECUTION/`](EXECUTION/). Derivado de [BLUEPRINT-Feature-verification-core.md](BLUEPRINT-Feature-verification-core.md). License: MIT.

**Branch:** `feat/verification-core` · **Target:** v3.3.0 (repo já está em v3.2.0) · **35 tasks em 9 fases**

---

## Visão Geral

- Total de tasks: **35**
- Tasks no rank 0 (sem dependência): **5** (`task-001/002/003/004/006`)
- Grupos paralelos: **1 explícito** (`mutation-adapters`: T-031..T-034) + ranks paralelos por construção
- Regra de ouro: **CLI 100% determinístico**; toda inferência LLM (gerar testes/candidatos) vive nas skills.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade dominante |
|---|---|---|---|
| 1 — Foundation | T-001 a T-006 | SIM (5 em rank 0; T-005 após T-001) | LOW–MED |
| 2 — Ralph RS-06 | T-010 | não (depende de safe-spawn) | HIGH |
| 3 — Spec gates (f2p/anti-tamper) | T-020, T-021 | SIM (entre si) | HIGH |
| 4 — Mutation | T-030 a T-035 | **SIM** (T-031..T-034 em worktrees) | MED–HIGH |
| 5 — Decay-aware | T-040, T-041, T-042 | parcial (T-042 ∥ T-040) | MED–HIGH |
| 6 — Runner + wire | T-050, T-051 | não (sequencial) | HIGH |
| 7 — best-of-N | T-060 a T-064 | parcial (T-060/061/063 ∥) | MED–HIGH |
| 8 — bench + telemetria | T-070 a T-075 | SIM (T-070/071/072 ∥) | MED–HIGH |
| 9 — Segurança + CI + docs | T-080 a T-083 | parcial (T-081/082 ∥) | LOW–MED |

**Caminho crítico:** `T-001 → T-005 → T-050 → T-051 → T-064 → T-080 → T-083`
(em paralelo: T-002 → T-010; T-030 → {T-031..T-034}; T-071/072 → T-073 → T-074 → T-081).

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-001 | verification/types.ts (contratos) | ⏳ PENDING | — | MED |
| task-002 | exec/safe-spawn.ts (RS-06) | ⏳ PENDING | — | MED |
| task-003 | utils/path-safety.ts (RS-01) | ⏳ PENDING | — | LOW |
| task-004 | utils/logger.ts (pino, RNF-04) | ⏳ PENDING | — | LOW |
| task-005 | verification/config.ts (zod) | ⏳ PENDING | 001 | MED |
| task-006 | Lint: proibir shell:true | ⏳ PENDING | — | LOW |
| task-010 | ralph-loop → argv + safeSpawn | ⏳ PENDING | 002 | HIGH |
| task-020 | gates/fail-to-pass.ts (RF-02) | ⏳ PENDING | 001, 002 | HIGH |
| task-021 | gates/anti-tamper.ts (RF-03) | ⏳ PENDING | 001, 002 | HIGH |
| task-030 | mutation/adapter + registry | ⏳ PENDING | 001, 002 | MED |
| task-031 | mutation/stryker.ts (JS/TS) | ⏳ PENDING | 030 | HIGH |
| task-032 | mutation/mutmut.ts (Python) | ⏳ PENDING | 030 | HIGH |
| task-033 | mutation/cargo-mutants.ts (Rust) | ⏳ PENDING | 030 | MED |
| task-034 | mutation/infection.ts (PHP) | ⏳ PENDING | 030 | MED |
| task-035 | gates/type-check.ts (A-12) | ⏳ PENDING | 001, 002 | LOW |
| task-040 | decay/signature.ts | ⏳ PENDING | 001 | MED |
| task-041 | decay/policy.ts (regra canônica) | ⏳ PENDING | 001, 040 | HIGH |
| task-042 | state-store attempts[] | ⏳ PENDING | 001 | MED |
| task-050 | verification/runner.ts | ⏳ PENDING | 005, 020, 021, 030, 035 | HIGH |
| task-051 | execute.ts wire + flags + verdict | ⏳ PENDING | 050, 041, 042 | HIGH |
| task-060 | best-of-n/worktree.ts | ⏳ PENDING | 002, 003 | MED |
| task-061 | selector/pareto.ts (RF-05) | ⏳ PENDING | 001 | MED |
| task-062 | best-of-n/runner.ts (RF-04) | ⏳ PENDING | 050, 060, 061 | HIGH |
| task-063 | selector/prerank.ts (RF-09) | ⏳ PENDING | 061 | MED |
| task-064 | execute flags --best-of/--policy | ⏳ PENDING | 051, 062 | MED |
| task-070 | telemetry.ts + graph types (RF-10) | ⏳ PENDING | 001 | MED |
| task-071 | bench/fixtures.ts + fixtures/** | ⏳ PENDING | 001 | HIGH |
| task-072 | bench/report.ts (solve-rate/Fix·Rate) | ⏳ PENDING | 001 | MED |
| task-073 | bench/harness.ts (runFixture) | ⏳ PENDING | 071, 072, 002 | HIGH |
| task-074 | commands/bench.ts + bin | ⏳ PENDING | 073 | MED |
| task-075 | execute grava telemetria no DONE | ⏳ PENDING | 051, 070 | LOW |
| task-080 | Auditoria de segurança (N-1) | ⏳ PENDING | 051, 062, 064 | MED |
| task-081 | release.yml + gate de regressão | ⏳ PENDING | 074 | MED |
| task-082 | config defaults + migration | ⏳ PENDING | 005 | MED |
| task-083 | Docs + bump v3.3.0 | ⏳ PENDING | 080, 081, 082 | LOW |

---

## Tarefas por Fase

### Fase 1 — Foundation
- task-001: verification/types.ts — contratos (Config, Result, LoopVerdict, Aspect)
- task-002: exec/safe-spawn.ts — spawn argv shell:false (RS-06)
- task-003: utils/path-safety.ts — extrair assertRelativeSafe (RS-01)
- task-004: utils/logger.ts — pino compartilhado (RNF-04)
- task-005: verification/config.ts — parseVerificationConfig zod (deps: 001)
- task-006: Lint custom — proibir shell:true fora de testes

### Fase 2 — Ralph RS-06
- task-010: ralph-loop.ts → gatesFor argv[] + resolvePythonBin + safeSpawn (deps: 002)

### Fase 3 — Spec gates
- task-020: gates/fail-to-pass.ts (RF-02) (deps: 001, 002)
- task-021: gates/anti-tamper.ts (RF-03) (deps: 001, 002)

### Fase 4 — Mutation (parallel_group: mutation-adapters)
- task-030: mutation/adapter.ts + registry.ts (deps: 001, 002)
- task-031: mutation/stryker.ts — JS/TS, CANONICAL (deps: 030)
- task-032: mutation/mutmut.ts — Python (deps: 030)
- task-033: mutation/cargo-mutants.ts — Rust, SHOULD (deps: 030)
- task-034: mutation/infection.ts — PHP, SHOULD (deps: 030)
- task-035: gates/type-check.ts — A-12 (deps: 001, 002)

### Fase 5 — Decay-aware
- task-040: decay/signature.ts (deps: 001)
- task-041: decay/policy.ts — decideNextAction (deps: 001, 040)
- task-042: state-store.ts attempts[] (deps: 001)

### Fase 6 — Runner + wire
- task-050: verification/runner.ts (deps: 005, 020, 021, 030, 035)
- task-051: execute.ts wire + flags + verdict (deps: 050, 041, 042)

### Fase 7 — best-of-N
- task-060: best-of-n/worktree.ts (deps: 002, 003)
- task-061: selector/pareto.ts (deps: 001)
- task-062: best-of-n/runner.ts (deps: 050, 060, 061)
- task-063: selector/prerank.ts — RF-09 COULD (deps: 061)
- task-064: execute flags --best-of/--policy/--prerank (deps: 051, 062)

### Fase 8 — bench + telemetria
- task-070: telemetry.ts + graphrag/types.ts (deps: 001)
- task-071: bench/fixtures.ts + fixtures/bench/** (deps: 001)
- task-072: bench/report.ts (deps: 001)
- task-073: bench/harness.ts (deps: 071, 072, 002)
- task-074: commands/bench.ts + bin/dare.ts (deps: 073)
- task-075: execute grava telemetria no DONE (deps: 051, 070)

### Fase 9 — Segurança + CI + docs
- task-080: Auditoria de segurança N-1 (deps: 051, 062, 064)
- task-081: release.yml + gate de regressão RF-08 (deps: 074)
- task-082: config defaults + migration (deps: 005)
- task-083: Docs + bump v3.3.0 (deps: 080, 081, 082)

---

## Como rodar

```powershell
# Sequencial (1 task por vez, Ralph Loop):
dare dag-run --dag DARE/dare-dag-verification-core.yaml

# Paralelo no grupo de adapters de mutação (worktrees isoladas):
dare dag-run-parallel --dag DARE/dare-dag-verification-core.yaml --rank-only mutation-adapters

# Task individual:
dare execute --task task-001 --dag DARE/dare-dag-verification-core.yaml

# Status / visualização:
dare execute --status --dag DARE/dare-dag-verification-core.yaml
dare dag viz --dag DARE/dare-dag-verification-core.yaml -o DARE/dag-graph-verification-core.mmd
```

## Gates globais (todos os PRs intermediários)

- `pnpm -r build` verde
- `pnpm -r test` verde
- `pnpm -r lint` verde (inclui regra custom anti-`shell:true`)
- `tsc --noEmit` verde
- `pnpm audit --audit-level=high` zero HIGH/CRITICAL

## Anti-stub (regra de ouro do BLUEPRINT seção 11)

Nenhum PR pode conter: `TODO`, `FIXME`, `XXX`, `// stub`, `# placeholder`,
`throw new Error('not implemented')`, `expect(true).toBe(true)`, gate que retorna `PASS` sem rodar,
adapter de mutação com score hardcoded, `prerank` autorizando DONE. `dare review <id>` reprova.

## Próximas Etapas

1. Revisar e aprovar este TASKS.md + o DAG (`dag-graph-verification-core.mmd`)
2. Iniciar execução: `dare execute --next --dag DARE/dare-dag-verification-core.yaml`
3. Ou task isolada: `/dare-execute task-001`
