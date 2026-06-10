# TASKS — Secure Autonomous Executor

> Resumo legível de [dare-dag-secure-autonomous-executor.yaml](dare-dag-secure-autonomous-executor.yaml).
> DAG completo (com `depends_on`, `spec_file`, `subtask_prompt`) está no YAML. Specs executáveis por
> task em [`EXECUTION/`](EXECUTION/). Derivado de
> [BLUEPRINT-Feature-secure-autonomous-executor.md](BLUEPRINT-Feature-secure-autonomous-executor.md). License: MIT.

**Branch:** `feat/secure-autonomous-executor` · **Target:** v3.9.0 (executor) + v3.10.0 (gate) · **17 tasks em 5 fases**

> **Bloco de IDs:** `6xx` (verification-core=0xx, security-hardening=1xx, dual-graph=2xx,
> agent-hooks-steering=3xx, brownfield=4xx, formal-verification=5xx). Renumerado de 2xx→6xx para
> evitar colisão com dual-graph.

---

## Visão Geral

- Total de tasks: **17**
- Tasks no rank 0 (sem dependência): **2** (`task-601` executor-foundation ∥ `task-610` guard-foundation) — as duas partes arrancam em paralelo.
- Regra de ouro: **motor de decisão 100% determinístico**; LLM confinado ao `AgentDriver` (D-002); guard LLM-free.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade dominante | Target |
|---|---|---|---|---|
| 1 — AgentDriver foundation | T-601 a T-603 | parcial (602 ∥ 603) | LOW | v3.9.0 |
| 2 — Executor autônomo (`--agent`) | T-604 a T-608 | parcial | MED–HIGH | v3.9.0 |
| 3 — `dare guard` core | T-610 a T-613 | parcial (611 ∥ 612) | MED | v3.10.0 |
| 4 — Proveniência + boundaries + integração | T-614 a T-617 | parcial | MED–HIGH | v3.10.0 |
| 5 — Auditoria N-1 + release | T-620, T-621 | não | HIGH–LOW | v3.10.0 |

**Caminho crítico (executor):** `T-601 → T-605 → T-606 → T-617 → T-620 → T-621`
**Caminho paralelo (guard):** `T-610 → T-614 → T-615 → T-617`

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-601 | agent/driver.ts — interface AgentDriver + tipos | ⏳ PENDING | — | LOW |
| task-602 | drivers mock.ts + noop.ts (determinísticos) | ⏳ PENDING | 601 | LOW |
| task-603 | agent/budget.ts — BudgetTracker (soma best-of-N) | ⏳ PENDING | 601 | LOW |
| task-604 | no-llm-in-core.test.ts (gate de arquitetura) | ⏳ PENDING | 605 | LOW |
| task-605 | drivers/claude.ts — lazy import + optionalDependency | ⏳ PENDING | 601 | MED |
| task-606 | execute --agent — loop, flags, resolveDriver, decay reuse | ⏳ PENDING | 602, 603, 605 | HIGH |
| task-607 | telemetria de custo → GraphRAG (metadados nó task) | ⏳ PENDING | 606 | MED |
| task-608 | --require-approval rank — gating por fronteira de rank | ⏳ PENDING | 606 | MED |
| task-610 | guard/types.ts — GuardResult/Finding/Artifact | ⏳ PENDING | — | LOW |
| task-611 | guard/unicode.ts — audit strip/block | ⏳ PENDING | 610 | MED |
| task-612 | guard/scan.ts + rules/scan-rules.json | ⏳ PENDING | 610 | MED |
| task-613 | commands/guard.ts — comando, PASS\|WARN\|FAIL, exit 6 | ⏳ PENDING | 611, 612 | MED |
| task-614 | guard/provenance.ts — digest + Ed25519 (minisign-compat) | ⏳ PENDING | 610 | HIGH |
| task-615 | guard/boundary.ts — control/data enforcement | ⏳ PENDING | 610, 614 | MED |
| task-616 | config — bloco guard (zod) em dare.config.json | ⏳ PENDING | 610 | LOW |
| task-617 | integração: guard --sign + pré-flight no execute --agent | ⏳ PENDING | 606, 613, 614, 615, 616 | MED |
| task-620 | auditoria N-1 — secure-executor-regression.test.ts | ⏳ PENDING | 604, 607, 608, 617 | HIGH |
| task-621 | CHANGELOG 3.9.0/3.10.0 + docs/skills + bump | ⏳ PENDING | 620 | LOW |

---

## Tarefas por Fase

### Fase 1 — AgentDriver foundation (v3.9.0)
- **T-601** `agent/driver.ts`: interfaces `AgentDriver`, `AgentRunInput`, `AgentRunResult`, `TokenUsage` (BLUEPRINT §3.1). Pré/pós-condições documentadas.
- **T-602** `drivers/mock.ts` + `noop.ts`: aplicam patch de fixture / aborted; `usage` zerado; sem rede (RNF-03).
- **T-603** `agent/budget.ts`: `BudgetTracker` somando **todos** os candidatos best-of-N (A-4).

### Fase 2 — Executor autônomo (v3.9.0)
- **T-605** `drivers/claude.ts`: único ponto de `import()` do SDK (lazy); `optionalDependencies` no package.json; `AgentSdkMissingError` acionável.
- **T-604** `no-llm-in-core.test.ts`: falha se `@anthropic-ai` for importado fora de `claude.ts` (O-02/D-002).
- **T-606** `execute --agent`: flags (`--agent/--budget-tokens/--require-approval/--on-fail/--dry-run`), `resolveDriver`, loop reusa **`decideNextAction`** (não reimplementa), pré-flight de guard (stub até T-617).
- **T-607** telemetria de custo: metadados `{inputTokens,outputTokens,costUsd,model,attempts}` no nó `task` via `addNode` (A-5).
- **T-608** `--require-approval rank`: pausa nas fronteiras de rank; default `rank` (O-08).

### Fase 3 — `dare guard` core (v3.10.0)
- **T-610** `guard/types.ts`: `GuardVerdict/Finding/Result`, `GuardedArtifact`, `TrustChannel`.
- **T-611** `guard/unicode.ts`: codepoints da BLUEPRINT §4.2; `strip`/`block`.
- **T-612** `guard/scan.ts` + `rules/scan-rules.json`: regras `instr-override/shell-exec/exfiltration/hidden-directive`; achado isolado → `WARN`.
- **T-613** `commands/guard.ts`: `dare guard <path|--staged|--all>`, veredito, **exit 6** em FAIL, `--format json`, `--strict`.

### Fase 4 — Proveniência + boundaries + integração (v3.10.0)
- **T-614** `guard/provenance.ts`: `computeDigest` (SHA-256), `sign/verifyArtifact` (Ed25519 nativo `node:crypto`, formato minisign-compat — D-003), `classify`.
- **T-615** `guard/boundary.ts`: dado (`channel:'data'`) não invoca shell nem reordena gate; hook só de `control+signed` (RS-02/03).
- **T-616** config `guard` (zod): `enabled/onExecute/unicode/trustedPaths/signing`; default `enabled:false` (RNF-02).
- **T-617** integração: `guard --sign`; guard como pré-flight real no `execute --agent`; artefato assinado **também** passa por unicode+scan.

### Fase 5 — Auditoria N-1 + release (v3.10.0)
- **T-620** `secure-executor-regression.test.ts`: budget nunca estoura; data-channel nunca executa; tamper sempre detectado; 0 import de LLM no caminho determinístico; `pnpm audit --prod` 0 HIGH (inclui optionalDependency).
- **T-621** CHANGELOG `[3.9.0]`+`[3.10.0]`, docs README/skills das flags, bump de versão.

---

## Próximas Etapas

1. **Revisar** este breakdown e o `dare-dag-secure-autonomous-executor.yaml`.
2. Executar via `/dare-dag-run` (ou `/dare-dag-run-parallel`, dado que as duas partes têm rank-0 paralelo) na branch `feat/secure-autonomous-executor` — ou pelo Cursor com o [brief de execução](CURSOR-EXECUTION-BRIEF-secure-autonomous-executor.md).
