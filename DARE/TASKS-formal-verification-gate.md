# TASKS — Formal Verification Gate (Gate opt-in que PROVA módulos críticos · Dafny default)

> Resumo legível de [dare-dag-formal-verification-gate.yaml](dare-dag-formal-verification-gate.yaml). DAG completo
> (com `depends_on`, `complexity`, `spec_file`, `subtask_prompt`) está no YAML. Specs executáveis por task em
> [`EXECUTION/`](EXECUTION/) (virão em passo seguinte). Derivado de
> [BLUEPRINT-Feature-formal-verification-gate.md](BLUEPRINT-Feature-formal-verification-gate.md). License: MIT.

**Branch:** `feat/formal-verification-gate` · **Target:** v3.8.0 (repo em v3.7.0) · **11 tasks em 6 fases**

> ⚠️ **EMBRIONÁRIO / EXPERIMENTAL (`idea-10`).** Gate **OPT-IN ESTRITO** em **dois níveis** (config
> `verification.formal.enabled` **E** marcação por módulo), escopo single-function <100 LOC, com **degradação
> graciosa** quando a toolchain está ausente. Único **MUST** = comportamento não-invasivo (RNF-01/02); a maioria
> dos RF é SHOULD/COULD. As taxas fim-a-fim de CLEVER (~0,62%) **proíbem qualquer obrigatoriedade**.

---

## Visão Geral

- Total de tasks: **11**
- Tasks no rank 0 (sem dependência): **1** (`task-501` — fundação de tipos; tudo na Fase 1/2 deriva dela).
- **Regra de ouro:** o CLI é 100% **determinístico** — **orquestra o verificador externo** (processo filho via
  `safeSpawn`) e **lê o veredito**; **nunca chama LLM** nem decide a prova. A formalização da spec em Dafny, a
  tradução NL ao humano, a geração de impl+prova e o prompt-repair (PREFACE) vivem nas **skills das IDEs**. O
  solver/toolchain (Dafny/Z3/Verus/Lean) é **EXTERNO** — **não** entra no `package.json` do CLI (RS-05).
- **Extensão, não fork:** é **um aspecto adicional** do `verification-core` (v3.3.0). Pluga no **mesmo** mecanismo
  de aspectos do `runner.ts`, reusa `AspectResult`/`VerificationResult`, o registry de adapters como modelo,
  `safeSpawn` e a política decay-aware. **Não reespecifica** mutation/TDD/best-of-N/decay.
- **Default Dafny** (A-4): Vericoding (arXiv:2509.22908) — **Dafny 82,2% vs. Verus 44,3% vs. Lean 26,8%**.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade dominante |
|---|---|---|---|
| 1 — Foundation (tipos + config + marcação, sem solver) | T-501 a T-503 | parcial (502 ∥ 503 após 501) | MED–HIGH |
| 2 — Backend Dafny (default) + registry + anti-bypass | T-504 a T-506 | parcial (504/506 após 501; 505 após 504) | MED–HIGH |
| 3 — Aspecto no runner + CLI + degradação graciosa | T-507 a T-509 | parcial (508/509 ∥ após 507) | MED–HIGH |
| 5 — Auditoria de segurança / deps (**N-1**) | T-510 | sequencial (junta tudo) | HIGH |
| 6 — Release v3.8.0 (README-aware) | T-511 | sequencial | LOW |

> A "Fase 4" do BLUEPRINT (telemetria + verified-rate em fixtures) está **dobrada na Fase 3** (`task-509`),
> pois reusa telemetria/fail-to-pass do núcleo — mantendo "Fase N-1 = auditoria" e "última = release".

**Caminho crítico:** `T-501 → T-504 → T-505 → T-507 → T-508 → T-510 → T-511`
(em paralelo: `T-502`/`T-503` após T-501; `T-506` após T-501; `T-509` após T-505+T-507. T-507 sincroniza
o ramo do marker (T-503), do Dafny (T-505) e do anti-bypass (T-506).)

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-501 | verification/types.ts — FormalGateConfig/FormalBackend/FormalVerdict/CriticalModuleMarker + Aspect += 'formal' (FUNDAÇÃO) | ⏳ PENDING | — | HIGH |
| task-502 | verification/config.ts — bloco zod `formal` + FORMAL_DEFAULTS (ausente ⇒ enabled:false) | ⏳ PENDING | 501 | MED |
| task-503 | gates/formal/marker.ts — resolveFormalTargets (tag @dare-formal + config.modules; assertRelativeSafe) | ⏳ PENDING | 501 | MED |
| task-504 | gates/formal/backend.ts + registry.ts — FormalBackend + erros tipados + backendForConfig lazy-load | ⏳ PENDING | 501 | MED |
| task-505 | gates/formal/dafny.ts — backend DEFAULT (isAvailable + run via safeSpawn, parse de veredito real) | ⏳ PENDING | 504 | HIGH |
| task-506 | gates/formal/anti-bypass.ts — detectBypass (assume(false)/ensures true/vazamento); reprova mesmo com exit 0 | ⏳ PENDING | 501 | MED |
| task-507 | gates/formal/runner.ts — checkFormal (marker→isAvailable→run→anti-bypass→AspectResult) | ⏳ PENDING | 503, 505, 506 | HIGH |
| task-508 | runner.ts + execute-verification.ts — plug após mutation, flags --formal/--no-formal/--formal-backend, exit 5 | ⏳ PENDING | 502, 507 | MED |
| task-509 | gates/formal/verus.ts + lean.ts (SHOULD) + telemetria recordFormalProof (proven_by) + fixtures/verified-rate | ⏳ PENDING | 505, 507 | MED |
| task-510 | Auditoria N-1 — anti-bypass (rejeita exit 0), specs não-computáveis, sandbox toolchain, sem-segredos, sem-dep-formal | ⏳ PENDING | 508, 509 | HIGH |
| task-511 | Release v3.8.0 — CHANGELOG [3.8.0] + bump raiz+CLI 3.7.0→3.8.0 + BANNER/seções/roadmap README + nota CLI README | ⏳ PENDING | 510 | LOW |

---

## Tarefas por Fase

### Fase 1 — Foundation (contratos, config e marcação, sem solver)
- **task-501**: Estender `verification/types.ts` — `FormalBackend`/`FormalStage`/`FormalGateConfig`/
  `CriticalModuleMarker`/`FormalVerdict`; `Aspect += 'formal'`; `VerificationConfig.formal` retrocompatível
  **sem mudar a forma** de `AspectResult`/`VerificationResult`. **Fundação — raiz das demais** (A-1/A-2/A-9; §4.1).
- **task-502**: Estender `verification/config.ts` — sub-schema zod `formal` (`.strict()`) + `FORMAL_DEFAULTS`;
  bloco **ausente ⇒ `enabled:false`** (deps: 501; A-2/RNF-01; §5.1).
- **task-503**: Criar `gates/formal/marker.ts` — `resolveFormalTargets` une tag `@dare-formal` + `config.modules`,
  valida cada path com `assertRelativeSafe`; lista vazia ⇒ SKIP (deps: 501; A-11/RF-01/RS-01/O-03; §5.3.3).

### Fase 2 — Backend Dafny (default) + registry + anti-bypass
- **task-504**: Criar `gates/formal/backend.ts` (interface `FormalBackend` + `FormalToolNotFoundError`/
  `FormalBackendError`/`UnknownFormalBackendError`) + `registry.ts` `backendForConfig` lazy-load, espelhando
  `MutationAdapter`/`registry.ts` do núcleo (deps: 501; A-3/A-5; §5.3.1/§5.3.2).
- **task-505**: Criar `gates/formal/dafny.ts` — backend **DEFAULT** (A-4): `isAvailable()` checa binário;
  `run()` via `safeSpawn` (argv, `shell:false`) e **parseia o veredito real** do Dafny (fixtures, **proibido**
  `verified:true` hardcoded) (deps: 504; RF-02/§7.2; §5.3.1).
- **task-506**: Criar `gates/formal/anti-bypass.ts` — `detectBypass` reprova `assume(false)`/`ensures true`/
  vazamento **mesmo com exit 0 do solver** (deps: 501; A-6/RF-06/RS-02; §5.3.4).

### Fase 3 — Aspecto no runner + CLI + degradação graciosa
- **task-507**: Criar `gates/formal/runner.ts` — `checkFormal` orquestra
  `marker → isAvailable → run → anti-bypass → AspectResult`; não-marcado ⇒ SKIP antes de `safeSpawn`; reparo
  PREFACE **fora** do CLI (deps: 503, 505, 506; A-1/A-5/A-8/RF-05/O-03; §5.3.5).
- **task-508**: Plugar `checkFormal` no `runner.ts` após mutation (`computePassed`/`finish` **inalterados**) +
  flags `--formal`/`--no-formal`/`--formal-backend` em `execute-verification.ts`; **exit 5** (toolchain ausente em
  módulo marcado) e strings de erro **exatas** §5.2 (deps: 502, 507; A-1/A-5/RF-05/RNF-05; §5.3.6/§5.2).
- **task-509**: `verus.ts`/`lean.ts` (SHOULD, mesma interface, não default) + `telemetry.ts#recordFormalProof`
  (aresta `task --proven_by--> formal-gate`, fallback metadata) + `fixtures/formal/` (≥6 fixtures Dafny <100 LOC,
  incl. `spec.nl.md` NL-opaco e bypass; verified-rate ≥70% / 100% bypass rejeitado) + RF-08 testes das `ensures`
  no `fail-to-pass.ts` (deps: 505, 507; A-3/A-10/A-12/RF-08/RF-09/O-02/O-06; §5.3.7/§9.3).

### Fase 5 — Auditoria de segurança / deps (N-1)
- **task-510**: Suíte `security-formal.test.ts` (RS-01..RS-06/O-02/O-06): **anti-bypass rejeita prova mesmo com
  exit 0**; **specs não-computáveis** (Prop/quantificadores, CLEVER) como defesa anti-trapaça; veredito
  não-falsificável (só de `backend.run()`, grep zero LLM); **sandbox** (zero `shell:true`, `safeSpawn` única porta);
  sem segredos no veredito/logs (`sanitizeEnv`); paths seguros (`assertRelativeSafe`); **toolchain formal não é dep**
  do CLI + `pnpm audit --audit-level=high` 0 HIGH/CRITICAL; cobertura `gates/formal/**` ≥80% (deps: 508, 509;
  §6 Fase 5/§8/§9/§11).

### Fase 6 — Release v3.8.0
- **task-511**: CHANGELOG `[3.8.0]` + bump **raiz + `packages/cli`** `3.7.0 → 3.8.0` + **README-aware**
  (banner ~linha 17, título "Skills & comandos", roadmap "Shipped" + seção de feature) + nota `> **v3.8.0:** ...`
  no topo do `packages/cli/README.md` + `project-generator/README` conforme couber; opt-in estrito / retrocompat
  100% (deps: 510; §6 Fase 6/§10). **Checkboxes (a)-(e) OBRIGATÓRIOS no aceite** (banner travou em v3.3.0 por 4
  releases — não repetir).

---

## Como rodar

```bash
# Sequência completa seguindo o DAG:
dare execute --dag DARE/dare-dag-formal-verification-gate.yaml --next

# Task isolada:
/dare-execute task-501

# Visualizar o grafo de dependências:
/dare-dag-viz
```

1. Revisar e aprovar este TASKS + o YAML (checklist §12 do BLUEPRINT).
2. Branch `feat/formal-verification-gate`.
3. Executar via `/dare-dag-run` (rank 0 = `task-501`).

> **Nota:** o `verification-core` (v3.3.0) já está entregue e é **reusado** (runner/aspectos, `safeSpawn`,
> `decay/policy`, telemetria, registry como modelo), **não** reimplementado. A toolchain formal é **externa**
> (não dep do CLI). A feature é **opt-in estrito** em dois níveis — sem o bloco `verification.formal` **ou** sem
> marcação, o comportamento é idêntico ao da v3.7.0.
