# Feature Blueprint: Núcleo de Verificação Confiável (Reliable Verification Core)

> Derivado de [DESIGN-Feature-verification-core.md](DESIGN-Feature-verification-core.md).
> Único entregável desta etapa: este BLUEPRINT. Tasks/DAG/specs de execução virão em `/dare-tasks`.
> Branch proposta: `feat/verification-core` · Target release proposto: **v3.3.0** (o repo já está em v3.2.0; feature nova ⇒ minor bump) · License: MIT.
>
> **Base de evidências:** decisões fundamentadas pelos papers catalogados em
> `pesquisas-estrategicas/papers-dare/` (`idea-1`,`idea-2`,`idea-3`,`idea-9`,`idea-11`). Ancoragem no
> código existente verificada em `packages/cli/src/dag-runner/ralph-loop.ts`, `run_dag.ts`,
> `commands/execute.ts`, `graphrag/*`.

---

## 1. Visão Geral da Arquitetura

### 1.1 Princípio reitor (não-negociável)

**O CLI é 100% determinístico.** Toda inferência por LLM (gerar testes fail-to-pass, gerar candidatos
best-of-N, ranquear execution-free) vive nas **skills das IDEs**, não no CLI. O núcleo de verificação
**orquestra e mede**; nunca chama LLM. Isto recorta a feature em duas metades:

| Responsabilidade | Onde vive | Exemplo |
|---|---|---|
| **Gerar** (semântico, não-determinístico) | Skill da IDE | Skill escreve `task-NNN.tests.ts`; agente gera N candidatos em worktrees |
| **Verificar / medir / decidir** (determinístico) | CLI (`src/verification/**`) | Mutation score, anti-trapaça, fail-to-pass, seletor Pareto, veredito de decay, `dare bench` |

A fronteira é a mesma já usada por `design`/`blueprint`/`review`: o CLI expõe comandos determinísticos;
a skill consome e produz artefatos versionados.

### 1.2 Diagrama

```mermaid
flowchart TB
    agent["Skill da IDE (LLM)<br/>gera testes/candidatos"] -->|"escreve artefatos"| fs[("EXECUTION/task-NNN.tests.*<br/>worktrees/cand-*")]

    cli["dare execute --complete &lt;id&gt;"] --> ralph["ralph-loop.ts<br/>build → test → lint (existente)"]
    ralph -->|"RalphLoopResult.passed"| vrun["verification/runner.ts<br/>(NOVO orquestrador determinístico)"]

    vrun --> ftp["gates/fail-to-pass.ts<br/>RF-02: spec executável falhou antes?"]
    vrun --> tamper["gates/anti-tamper.ts<br/>RF-03: suíte foi enfraquecida?"]
    vrun --> mut["gates/mutation/*<br/>RF-01: Stryker/mutmut/cargo-mutants/Infection"]

    ftp --> verdict["Veredito do gate<br/>VerificationResult"]
    tamper --> verdict
    mut --> verdict

    verdict --> decay["decay/policy.ts<br/>RF-06: CONTINUE/FRESH_START/REPLAN/ESCALATE"]
    decay -->|"persiste tentativa+assinatura"| state[(".dare/state.json<br/>+ .dare/verification/&lt;id&gt;.json")]
    verdict -->|"telemetria"| graph["telemetry.ts → KnowledgeGraph<br/>RF-10: task --verified_by--> gate"]

    subgraph bestofn["dare execute --best-of N (RF-04/05)"]
      bon["best-of-n/runner.ts"] --> wt["best-of-n/worktree.ts<br/>git worktree add/remove"]
      bon --> sel["selector/pareto.ts<br/>ensemble de aspectos + voto"]
      sel -. opcional .-> prerank["selector/prerank.ts<br/>RF-09 exec-free (COULD)"]
    end

    subgraph bench["dare bench (RF-07/08)"]
      bh["bench/harness.ts"] --> fix["bench/report.ts<br/>solve-rate + Fix·Rate"]
      bh --> ci["CI release.yml<br/>regressão > 3pp = ❌"]
    end

    safe["exec/safe-spawn.ts<br/>RS-06 spawn argv, shell:false"] -.->|"usado por"| ralph
    safe -.-> mut
    safe -.-> bh
    psafe["utils/path-safety.ts<br/>RS-01 assertRelativeSafe extraído"] -.-> wt
    psafe -.-> bh
```

`*` Caminhos pontilhados = controles de segurança transversais (Seção 8).

### 1.3 Decisões Arquiteturais (com justificativa)

| # | Decisão | Alternativas consideradas | Justificativa |
|---|---|---|---|
| A-1 | **Núcleo de verificação como módulo novo isolado** `src/verification/**`, plugado **após** `runRalphLoop()` em `handleComplete` | Inflar `ralph-loop.ts` com mutação/decay | `ralph-loop.ts` é o gate binário maduro e testado. Estender ali repetiria o débito C3 do audit (god-file). Módulo separado + registry mantém RNF-03. |
| A-2 | **`verification` é opt-in via `dare.config.json#verification`** | Ligar por default | RNF-06: ausência de `verification.*` mantém comportamento atual (só build/test/lint). Adoção incremental sem quebrar projetos existentes. |
| A-3 | **Adapters de mutação plugáveis por registry** (1 arquivo por ferramenta) | `switch` monolítico em `gatesFor` | RNF-03: cada ferramenta (Stryker/mutmut/…) é unidade testável e substituível; novas linguagens entram sem tocar o núcleo. |
| A-4 | **Política decay-aware é um _advisor_ determinístico**, não um loop autônomo | CLI iterar chamando LLM | Regra de ouro (LLM fora do CLI). O CLI **registra** tentativas+assinatura e **devolve um veredito** (`CONTINUE`/`FRESH_START`/`REPLAN`/`ESCALATE`); quem itera é o agente/skill. Resolve a contradição do cap fixo de `ralph-loop.md` com **uma regra canônica única** (`idea-3`). |
| A-5 | **best-of-N reusa git worktree**, mas a geração dos N candidatos é da skill | CLI gerar candidatos | Worktrees já são usados por `dare-dag-run-parallel`. O CLI cria/limpa worktrees e **seleciona** (determinístico); o agente preenche cada worktree (`idea-2`). |
| A-6 | **Seletor = Pareto sobre aspectos (test/lint/type/mutation)**, empate por mutation score | Voto de maioria simples; reward model | Pareto-dominância é determinística, explicável e não exige treino (out-of-scope v1). Empate por mutation score alinha com `arXiv:2502.20379`. |
| A-7 | **`dare bench` avalia _patches dados_** (golden + candidatos gravados como fixtures), não gera patches | Harness chamar agente/LLM | Mantém o CLI determinístico e reprodutível em CI. `Fix·Rate` e `solve-rate` são funções puras de (patch, fail-to-pass, pass-to-pass) (`idea-9`, `arXiv:2512.18470`). |
| A-8 | **Refatorar `runShell` para `spawn(cmd, args[], { shell:false })`** | Manter `shell:true` | RS-06: elimina injeção via conteúdo de task. Requer `gatesFor` devolver `argv` e resolver o venv Python em JS (não em string de shell). Pré-requisito `kb-task-ralph-shell`. |
| A-9 | **Extrair `assertRelativeSafe` → `utils/path-safety.ts`** e reusar em worktrees/fixtures | Duplicar a checagem | RS-01: hoje só o `dna-emitter.ts` valida paths. Centralizar fecha a inconsistência H3 do audit. |
| A-10 | **Telemetria do gate estende o GraphRAG** com `NodeType: 'gate'` + `EdgeType: 'verified_by'` | Só metadata no nó `task` | RF-10 pede `task --verified_by--> gate` explícito em `dare graph`. Metadata fica como fallback se o backend não migrar. |
| A-11 | **Logger pino compartilhado** em `utils/logger.ts` | Continuar `console.log`+chalk | RNF-04: hoje pino só existe no `mcp-server`. Veredito do gate precisa de log estruturado (task id, score, motivo) sem `console.log` solto. |
| A-12 | **`type-check` vira gate explícito** quando a stack tem type-checker | Deixar implícito no build | DESIGN cita 4 gates; o código tem 3. Adicionado como aspecto do verificador (não do Ralph mínimo), opt-in por stack. |
| A-13 | **Mutação incremental por default** (só arquivos do `git diff` da task) | Mutar projeto inteiro | RNF-01: overhead do gate < 3× o tempo de teste normal. Full-mutation só sob flag explícita. |

---

## 2. Stack Técnica Definida (do CLI — não dos projetos gerados)

| Camada | Tecnologia | Versão | Papel |
|---|---|---|---|
| Runtime | Node.js | ≥18 (já existente) | runtime do CLI |
| Linguagem | TypeScript | 5.x (já existente) | implementação |
| Test runner (núcleo) | Vitest | já existente | testes do próprio CLI (`*.test.ts`/`*.spec.ts`) |
| Cmd parser | commander | já existente | `dare bench`, flags de `execute` |
| FS helper | fs-extra | já existente | IO de worktrees/fixtures/state |
| Logger | **pino** + pino-pretty | já em `package.json` (só usado no MCP) | logger estruturado compartilhado (A-11) |
| Config schema | **zod** | **a adicionar** | validar `verification.*` (hoje não há Zod no CLI) |
| Mutação — JS/TS (**dep npm do CLI**) | **StrykerJS** (`@stryker-mutator/core`) | linha **v8**, pin **exato** via `pnpm-lock.yaml` no install (Fase 4) | adapter `stryker.ts` (process filho) |
| Mutação — Python (**ferramenta externa**) | **mutmut** | mín. suportado **3.2** (instalada no projeto-alvo, não é dep do CLI) | adapter `mutmut.ts` |
| Mutação — Rust (**ferramenta externa**) | **cargo-mutants** | mín. suportado **25.0** | adapter `cargo-mutants.ts` (SHOULD) |
| Mutação — PHP (**ferramenta externa**) | **Infection** | mín. suportado **0.29** | adapter `infection.ts` (SHOULD) |
| Isolamento | git worktrees | git ≥2.5 | best-of-N (reuso de `dare-dag-run-parallel`) |
| Telemetria | GraphRAG (JSON/SQLite) | já existente | RF-10 (evitar Neo4j até C1) |
| Verificador exec-free | API externa **ou** heurística local | — | RF-09 COULD; nunca autoriza DONE (RS-07) |

> **Decisão sobre Zod:** o CLI hoje lê `dare.config.json` com `fs.readJson` sem validação. Para
> `verification.*` (limiares, políticas, N) erros de config silenciosos seriam perigosos (ex.: `minScore: "70"`
> string vs `0.70`). Introduzimos **um** schema Zod restrito ao bloco `verification`, sem reescrever o resto do
> config — `parseVerificationConfig(raw)` com defaults e `safeParse`.

> **Mutação por linguagem (resolve item aberto do DESIGN):** v1 entrega **StrykerJS (JS/TS)** e **mutmut
> (Python)** como MUST; **cargo-mutants (Rust)** e **Infection (PHP)** como SHOULD (adapters com a mesma
> interface, ligados quando a stack casar). Cada ferramenta roda como **processo filho via argv** (RS-06),
> em modo incremental (RNF-01).
>
> **Política de versões (satisfaz "versões fixas" da skill):** só o **StrykerJS** entra no `package.json` do
> CLI — pin **exato** garantido pelo `pnpm-lock.yaml` (a fonte da verdade da versão). As demais (mutmut,
> cargo-mutants, Infection) **não são deps do CLI**: são binários instalados no **projeto-alvo**; o adapter
> declara a **versão mínima suportada** e valida em `isAvailable()`. Logo o `>=`/`mín.` aqui não é range de
> dependência, é contrato de compatibilidade — sem drift no pacote publicado.

---

## 3. Estrutura de Pastas (pós-feature)

```
packages/cli/
├─ package.json                         # + @stryker-mutator/core, zod (deps); scripts inalterados
├─ src/
│  ├─ index.ts                          # re-exporta tipos públicos de verification/
│  ├─ bin/
│  │  └─ dare.ts                        # + program.addCommand(benchCommand)
│  ├─ commands/
│  │  ├─ execute.ts                     # MODIFICADO: chama verification/runner após runRalphLoop;
│  │  │                                 #   novas flags --verify/--best-of/--policy/--prerank
│  │  └─ bench.ts                       # NOVO comando dare bench
│  ├─ dag-runner/
│  │  ├─ ralph-loop.ts                  # MODIFICADO: gatesFor → argv[]; runShell → safeSpawn (RS-06)
│  │  ├─ run_dag.ts                     # inalterado (markDone/markFailed já aceitam graph)
│  │  └─ state-store.ts                 # MODIFICADO: PersistedTaskState += attempts[]
│  ├─ verification/                     # NOVO — núcleo de verificação
│  │  ├─ types.ts                       # VerificationConfig, VerificationResult, LoopVerdict, Aspect…
│  │  ├─ config.ts                      # parseVerificationConfig (zod) + DEFAULTS
│  │  ├─ runner.ts                      # orquestra gates determinísticos após Ralph
│  │  ├─ registry.ts                    # registry de mutation adapters por stack
│  │  ├─ gates/
│  │  │  ├─ fail-to-pass.ts             # RF-02
│  │  │  ├─ anti-tamper.ts              # RF-03
│  │  │  ├─ type-check.ts               # A-12 (aspecto opcional)
│  │  │  └─ mutation/
│  │  │     ├─ adapter.ts               # interface MutationAdapter
│  │  │     ├─ stryker.ts               # JS/TS (MUST)
│  │  │     ├─ mutmut.ts                # Python (MUST)
│  │  │     ├─ cargo-mutants.ts         # Rust (SHOULD)
│  │  │     └─ infection.ts             # PHP (SHOULD)
│  │  ├─ decay/
│  │  │  ├─ policy.ts                   # RF-06 veredito canônico
│  │  │  └─ signature.ts                # hash da assinatura de falha
│  │  ├─ best-of-n/
│  │  │  ├─ runner.ts                   # RF-04 orquestra worktrees
│  │  │  ├─ worktree.ts                 # git worktree add/list/remove (argv)
│  │  │  └─ selector/
│  │  │     ├─ pareto.ts                # RF-05
│  │  │     └─ prerank.ts               # RF-09 (COULD)
│  │  ├─ bench/
│  │  │  ├─ harness.ts                  # RF-07 roda fixtures
│  │  │  ├─ fixtures.ts                 # carrega/valida suite
│  │  │  └─ report.ts                   # solve-rate + Fix·Rate (JSON + tabela)
│  │  ├─ telemetry.ts                   # RF-10 grava no KnowledgeGraph
│  │  └─ __tests__/
│  │     ├─ runner.test.ts
│  │     ├─ decay-policy.test.ts
│  │     ├─ fail-to-pass.test.ts
│  │     ├─ anti-tamper.test.ts
│  │     ├─ mutation-adapter.test.ts
│  │     ├─ selector-pareto.test.ts
│  │     ├─ bench-report.test.ts
│  │     └─ telemetry.test.ts
│  ├─ exec/
│  │  └─ safe-spawn.ts                  # NOVO RS-06: spawn(cmd, args[], { shell:false, env })
│  ├─ utils/
│  │  ├─ path-safety.ts                 # NOVO RS-01: assertRelativeSafe extraído + usado em todo lado
│  │  └─ logger.ts                      # NOVO RNF-04: pino compartilhado
│  └─ graphrag/
│     └─ types.ts                       # MODIFICADO: NodeType += 'gate'; EdgeType += 'verified_by'
├─ fixtures/                            # NOVO — suite do dare bench (versionada)
│  └─ bench/
│     ├─ suite.json                     # índice das fixtures
│     └─ <fixture-id>/
│        ├─ meta.json                   # stack, descrição, baseline
│        ├─ repo/                        # snapshot mínimo do projeto-alvo
│        ├─ patch.diff                   # patch golden (ou candidatos cand-*.diff)
│        ├─ fail_to_pass.txt            # lista de testes que devem passar pós-patch
│        └─ pass_to_pass.txt            # lista de testes que NÃO podem regredir
└─ .github/workflows/
   └─ release.yml                       # MODIFICADO: job dare bench + gate de regressão (RF-08)

.dare/                                  # runtime (gerado no projeto do usuário, gitignored)
├─ state.json                           # + attempts[] por task
└─ verification/
   └─ <task-id>.json                    # histórico de vereditos + fail-to-pass baseline
```

---

## 4. Modelo de Dados (contratos TypeScript — não há banco)

Esta feature persiste **estado de runtime em JSON** (`.dare/`) e **telemetria no GraphRAG**. "Modelo" =
contratos TS que governam config, veredito e persistência.

### 4.1 `src/verification/types.ts`

```ts
/* ── Config (validada por zod em config.ts) ─────────────────────────── */

export type LoopPolicy = 'decay' | 'fixed';
export type SaturationAction = 'fresh-start' | 'replan' | 'escalate';
export type MutationTool = 'stryker' | 'mutmut' | 'cargo-mutants' | 'infection';

export interface MutationConfig {
  readonly enabled: boolean;
  /** 0..1. Bloqueia DONE se score < minScore. Default 0.70. */
  readonly minScore: number;
  /** Só muta arquivos do git diff da task. Default true (RNF-01). */
  readonly incremental: boolean;
  /** Teto de mutantes por execução. Default 200. */
  readonly maxMutants: number;
  /** Timeout total do gate de mutação, em segundos. Default 900. */
  readonly timeoutSeconds: number;
}

export interface LoopConfig {
  readonly policy: LoopPolicy;            // default 'decay'
  /** Teto duro de tentativas. Veredito ESCALATE ao atingir. Default 5. */
  readonly maxAttempts: number;
  /** Nº de tentativas com a MESMA assinatura → saturado. Default 3 (≤3, idea-3). */
  readonly saturationWindow: number;
  /** Ação ao saturar antes do teto. Default 'fresh-start'. */
  readonly onSaturation: SaturationAction;
}

export interface BestOfNConfig {
  readonly default: number;               // default 1 (single-shot)
  readonly max: number;                   // default 5
  /** Orçamento de tokens (null = sem teto no CLI; agente respeita). */
  readonly budgetTokens: number | null;
}

export interface VerificationConfig {
  readonly enabled: boolean;              // ausência do bloco ⇒ false (RNF-06)
  readonly mutation: MutationConfig;
  readonly failToPass: { readonly required: boolean };   // default true (RF-02)
  readonly antiTamper: { readonly enabled: boolean };    // default true (RF-03)
  readonly typeCheck: { readonly enabled: boolean };     // default false (A-12)
  readonly loop: LoopConfig;
  readonly bestOfN: BestOfNConfig;
  readonly prerank: { readonly enabled: boolean };       // default false (RF-09)
}

/* ── Resultado de verificação ───────────────────────────────────────── */

export type Aspect = 'build' | 'test' | 'lint' | 'type' | 'fail-to-pass' | 'anti-tamper' | 'mutation';
export type Verdict = 'PASS' | 'FAIL' | 'SKIP';

export interface AspectResult {
  readonly aspect: Aspect;
  readonly verdict: Verdict;
  /** Numérico quando aplicável (mutation score 0..1; demais undefined). */
  readonly score?: number;
  /** Motivo legível e estável (testável). */
  readonly reason: string;
  readonly durationMs: number;
}

export interface VerificationResult {
  readonly taskId: string;
  readonly passed: boolean;               // true sse todo AspectResult não-SKIP é PASS
  readonly aspects: ReadonlyArray<AspectResult>;
  readonly mutationScore?: number;
  readonly durationMs: number;
}

/* ── Política decay-aware (RF-06) ───────────────────────────────────── */

export type LoopAction = 'CONTINUE' | 'FRESH_START' | 'REPLAN' | 'ESCALATE' | 'DONE';

export interface AttemptRecord {
  readonly n: number;                     // 1-based
  readonly at: string;                    // ISO timestamp
  readonly passed: boolean;
  /** Hash estável da falha (gate + frames normalizados). undefined se passou. */
  readonly failureSignature?: string;
  readonly failedAspect?: Aspect;
}

export interface LoopVerdict {
  readonly action: LoopAction;
  readonly attempt: number;
  readonly saturated: boolean;
  /** Mensagem canônica e única (resolve contradição de ralph-loop.md). */
  readonly reason: string;
  readonly failureSignature?: string;
}
```

### 4.2 `.dare/state.json` — extensão de `PersistedTaskState`

O `state-store.ts` já persiste `status`, `output`, `error`, `tokens`, `duration`. Adicionamos:

```ts
// Campo adicionado a PersistedTaskState (retrocompatível: ausente ⇒ [])
export interface PersistedTaskState {
  // … campos existentes …
  attempts?: AttemptRecord[];
}
```

`.dare/verification/<task-id>.json` guarda o detalhe completo (não polui `state.json`):

```jsonc
{
  "taskId": "task-001",
  "failToPassBaseline": {            // RF-02: prova que a spec falhou ANTES do código
    "recordedAt": "2026-06-04T20:00:00Z",
    "ranAgainst": "HEAD~spec",       // commit/estado pré-implementação
    "failed": ["test/foo.spec.ts::deve somar"],
    "allFailed": true
  },
  "tamperSnapshot": {                // RF-03: contagem de asserções/cobertura na spec
    "assertionCount": 12,
    "testFiles": ["test/foo.spec.ts"],
    "coveragePct": 84.2
  },
  "verdicts": [ /* LoopVerdict[] */ ],
  "attempts": [ /* AttemptRecord[] */ ]
}
```

### 4.3 Invariantes

| Invariante | Como é garantido |
|---|---|
| `VerificationConfig` sempre tem defaults | `parseVerificationConfig` aplica `DEFAULTS` antes do `safeParse` (Seção 5.2.2) |
| `enabled === false` ⇒ núcleo no-op | `runner.ts` retorna `{ passed: true, aspects: [] }` cedo (RNF-06) |
| `mutationScore` só presente se mutação rodou | `AspectResult.score` definido apenas no aspecto `mutation` |
| `attempts` monotônico | `n` estritamente crescente; `decay/policy.ts` é a única escritora |
| paths de fixtures/worktrees seguros | `assertRelativeSafe` (path-safety.ts) em toda entrada externa (RS-01) |
| nenhum processo com `shell:true` no caminho de verificação | lint custom proíbe `shell: true` fora de testes; `safeSpawn` é a única porta |

---

## 5. Contratos de "API" (CLI + funções públicas)

Este projeto **não expõe HTTP**. Contratos = (a) CLI surface, (b) funções públicas determinísticas.

### 5.1 CLI surface

#### 5.1.1 `dare execute` (modificado)

Flags **adicionadas** (as existentes — `--complete`, `--fail`, `--reset`, `--no-graph` etc. — permanecem):

| Flag | Tipo | Default | Validação |
|---|---|---|---|
| `--verify` | boolean | herda `verification.enabled` | Liga o núcleo determinístico após o Ralph Loop |
| `--no-verify` | boolean | — | Desliga o núcleo nesta execução (mesmo com config on) |
| `--best-of <n>` | int ≥1 | `verification.bestOfN.default` | `1 ≤ n ≤ bestOfN.max`; fora do range → exit 1 |
| `--policy <p>` | `decay\|fixed` | `verification.loop.policy` | Valor fora do enum → exit 1 |
| `--prerank` | boolean | `verification.prerank.enabled` | Só ordena candidatos; nunca autoriza DONE (RS-07) |
| `--full-mutation` | boolean | `false` | Desliga modo incremental (muta projeto inteiro) |
| `--verdict-json` | boolean | `false` | Emite `LoopVerdict` em JSON no stdout (para a skill consumir) |

**Fluxo em `handleComplete` (modificado):**

1. `resolveStackFromConfig(cwd)` → stack (existente).
2. `runRalphLoop({ stack, cwd, onProgress })` → `RalphLoopResult` (existente).
3. Se `!passed` → registra `AttemptRecord` (falha = gate Ralph), calcula `LoopVerdict`, `markFailed`, imprime veredito, `process.exit(1)`.
4. Se `passed` **e** verificação ligada → `runVerification({ taskId, stack, cwd, config })` (Seção 5.2.1).
5. Se `VerificationResult.passed === false` → registra attempt, `LoopVerdict`, `markFailed`, `exit(1)`.
6. Se tudo PASS → `telemetry.recordVerification(graph, …)` (RF-10) → `markDone`.

**Exit codes:**

| Exit | Quando |
|---|---|
| 0 | Ralph + verificação PASS → task DONE |
| 1 | Gate falhou (Ralph ou verificação) **ou** flag inválida |
| 3 | Ferramenta de mutação ausente em modo `native` sem fallback (não pula gate silenciosamente) |
| 4 | fail-to-pass baseline ausente quando `failToPass.required` (RF-02) |

**Veredito impresso (e em `--verdict-json`):**

```jsonc
{ "action": "FRESH_START", "attempt": 3, "saturated": true,
  "reason": "same failure signature 'a1b2c3' for 3 attempts; resetting context per loop.onSaturation",
  "failureSignature": "a1b2c3" }
```

**Mensagens de erro — strings exatas (para teste):**

| Caso | stderr |
|---|---|
| `--best-of` fora do range | `Error: --best-of must be between 1 and <max> (got <n>)` |
| Política inválida | `Error: --policy must be 'decay' or 'fixed' (got '<p>')` |
| Mutação sem ferramenta | `Error: mutation tool '<tool>' not found on PATH for stack '<stack>'. Install it or set verification.mutation.enabled=false.` |
| fail-to-pass faltando | `Error: fail-to-pass spec required but no baseline recorded for '<id>'. Generate EXECUTION/<id>.tests.* first.` |
| Config inválida | `Error: invalid verification config: <zod issue path>: <message>` |

#### 5.1.2 `dare bench` (NOVO)

> **Nota de escopo (esclarece O-05/O-06 do DESIGN):** `dare bench` mede a **corretude de patches dados**
> contra suítes fail-to-pass/pass-to-pass de fixtures versionadas — é um **guard de regressão determinístico
> e reprodutível** da *qualidade dos gates* (proxy de O-06). Ele **não** mede o *solve-rate do loop
> ponta-a-ponta* (DESIGN O-05/O-06 no sentido "a IA resolve a task sozinha"), porque isso exigiria o agente
> LLM dentro do loop — o que, pela regra de ouro da casa, vive na **camada de skill da IDE**, não no CLI
> determinístico. O solve-rate ponta-a-ponta é instrumentado **fora** do `bench`, via telemetria
> (`--verdict-json` + `recordVerification`) coletada quando o agente roda o loop. Resumo: `bench` = "os gates
> aprovam o patch certo e reprovam o errado?"; telemetria = "quantas tasks o agente fechou e a que custo?".

| Aspecto | Valor |
|---|---|
| Invocação | `dare bench [--suite <dir>] [--json] [--baseline <file>] [--fail-on-regression <pp>] [--filter <glob>]` |
| `--suite` | dir com `suite.json` (default `fixtures/bench/`) |
| `--json` | emite relatório JSON em stdout (default: tabela legível) |
| `--baseline` | JSON do release anterior; habilita comparação de regressão (RF-08) |
| `--fail-on-regression` | pp de queda de `solve-rate` que falha o processo (default 3) |
| `--filter` | roda só fixtures cujo id casa o glob |

**Saída JSON (schema):**

```jsonc
{
  "schemaVersion": 1,
  "ranAt": "2026-06-04T20:00:00Z",
  "suite": "fixtures/bench",
  "totals": { "fixtures": 20, "solved": 17, "solveRate": 0.85 },
  "results": [
    { "id": "fix-001", "stack": "node-nestjs",
      "fixRate": 1.0, "passToPassRegressed": false, "solved": true,
      "failToPass": { "passed": 8, "total": 8 },
      "passToPass": { "passed": 30, "total": 30 }, "durationMs": 4210 }
  ],
  "regression": { "baselineSolveRate": 0.86, "deltaPp": -1.0, "failed": false }
}
```

**Exit codes:** `0` = sem regressão; `1` = `solve-rate` caiu > `--fail-on-regression` pp; `2` = suite inválida/ausente.

#### 5.1.3 `dare graph` (sem novo subcomando)

RF-10 reusa `dare graph viz`/`query`; a feature só **escreve** nós `gate` e arestas `verified_by` via `telemetry.ts`.

### 5.2 Funções públicas — assinaturas executáveis

#### 5.2.1 `src/verification/runner.ts`

```ts
import type { VerificationConfig, VerificationResult } from './types';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph';

export interface RunVerificationOptions {
  readonly taskId: string;
  readonly stack: string;          // de resolveStackFromConfig
  readonly cwd: string;
  readonly config: VerificationConfig;
  /** Arquivos tocados pela task (git diff). Vazio ⇒ mutação incremental no-op. */
  readonly changedFiles: ReadonlyArray<string>;
  readonly onProgress?: (e: { aspect: string; phase: 'start' | 'pass' | 'fail' | 'skip' }) => void;
}

/**
 * Orquestra os aspectos determinísticos APÓS o Ralph Loop ter passado.
 *
 * Ordem (curto-circuita na 1ª falha barata):
 *   1. fail-to-pass (RF-02)  — barato
 *   2. anti-tamper (RF-03)   — barato
 *   3. type-check (A-12)     — médio, se typeCheck.enabled
 *   4. mutation (RF-01)      — caro, por último
 *
 * Pré-condições:
 *   - config.enabled === true (caller checa; senão runner retorna no-op PASS)
 *   - cwd é um worktree/dir válido com dare.config.json
 *
 * Pós-condições:
 *   - Retorna VerificationResult com 1 AspectResult por aspecto avaliado (SKIP se desligado)
 *   - Nenhuma escrita em disco além de logs (decisão de DONE é do caller)
 *
 * Erros:
 *   - MutationToolNotFoundError (exit 3 no caller) quando mutation.enabled e tool ausente em 'native'
 *   - FailToPassMissingError (exit 4) quando failToPass.required e baseline ausente
 *
 * Concorrência: stateless; seguro chamar em paralelo em cwds distintos (best-of-N).
 */
export async function runVerification(opts: RunVerificationOptions): Promise<VerificationResult>;
```

#### 5.2.2 `src/verification/config.ts`

```ts
import type { VerificationConfig } from './types';

export const DEFAULTS: VerificationConfig; // valores da Seção 4.1

/**
 * Lê e valida o bloco `verification` de dare.config.json.
 *
 * Pré-condições: `raw` é o objeto já parseado de dare.config.json (ou undefined).
 * Pós-condições:
 *   - undefined / bloco ausente ⇒ retorna { ...DEFAULTS, enabled: false } (RNF-06)
 *   - bloco presente ⇒ merge profundo com DEFAULTS, validado por zod
 * Erros:
 *   - throws VerificationConfigError com .issues (lista zod) em valor inválido
 * Pura, sem IO.
 */
export function parseVerificationConfig(raw: unknown): VerificationConfig;

export class VerificationConfigError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;
}
```

#### 5.2.3 `src/verification/decay/policy.ts` (RF-06 — regra canônica única)

```ts
import type { AttemptRecord, LoopConfig, LoopVerdict, VerificationResult } from '../types';

/**
 * Decide a próxima ação do loop a partir do histórico de tentativas.
 * REGRA CANÔNICA ÚNICA (substitui o cap fixo contraditório de ralph-loop.md):
 *
 *   1. result.passed                         → DONE
 *   2. attempt >= loop.maxAttempts           → ESCALATE   (teto duro)
 *   3. saturado (mesma signature por         → onSaturation:
 *        loop.saturationWindow tentativas)        'fresh-start'→FRESH_START
 *                                                  'replan'     →REPLAN
 *                                                  'escalate'   →ESCALATE
 *   4. policy === 'fixed' e attempt < max    → CONTINUE
 *   5. caso contrário                        → CONTINUE
 *
 * Pré-condições: `history` ordenado por n; `current` é a tentativa recém-registrada.
 * Pós-condições: LoopVerdict determinístico (mesma entrada ⇒ mesma saída).
 * Erros: nenhum. Pura.
 */
export function decideNextAction(args: {
  readonly result: VerificationResult | { passed: boolean; failedAspect?: string };
  readonly current: AttemptRecord;
  readonly history: ReadonlyArray<AttemptRecord>;
  readonly loop: LoopConfig;
}): LoopVerdict;

/** Verdadeiro sse os últimos `window` registros têm a MESMA failureSignature não-nula. */
export function isSaturated(history: ReadonlyArray<AttemptRecord>, window: number): boolean;
```

`signature.ts`:

```ts
/**
 * Hash estável e curto (8 hex) da assinatura de falha.
 * Normaliza: minúsculas, remove paths absolutos, timestamps, hashes,
 * números de linha; mantém: gate/aspect + nomes de teste + tipo de erro.
 * Mesma falha semântica ⇒ mesma signature (testável com pares de stderr).
 */
export function failureSignature(input: {
  readonly failedAspect: string;
  readonly stderr: string;
}): string;
```

#### 5.2.4 `src/verification/gates/mutation/adapter.ts` (RF-01)

```ts
export interface MutationRunInput {
  readonly cwd: string;
  readonly changedFiles: ReadonlyArray<string>;  // incremental (RNF-01)
  readonly incremental: boolean;
  readonly maxMutants: number;
  readonly timeoutSeconds: number;
}

export interface MutationRunOutput {
  /** killed/(killed+survived). NaN se 0 mutantes gerados → tratado como SKIP. */
  readonly score: number;
  readonly killed: number;
  readonly survived: number;
  readonly noCoverage: number;
  readonly timedOut: boolean;
  readonly tool: MutationTool;
}

/**
 * Contrato de cada ferramenta de mutação. Implementações: stryker/mutmut/cargo-mutants/infection.
 *
 * - isAvailable(): checa binário no PATH SEM rodar mutação (barato, sync-ish).
 * - run(): executa via safeSpawn (argv, shell:false), parseia o relatório nativo
 *   (Stryker JSON report, mutmut results, etc.) e normaliza para MutationRunOutput.
 *
 * Erros: throws MutationToolNotFoundError se !isAvailable() no run();
 *         BootstrapFailedError com .stderr se a ferramenta retornar ≠0 por config.
 */
export interface MutationAdapter {
  readonly tool: MutationTool;
  readonly stacks: ReadonlyArray<string>;        // stacks que este adapter cobre
  isAvailable(cwd: string): Promise<boolean>;
  run(input: MutationRunInput): Promise<MutationRunOutput>;
}
```

`registry.ts`:

```ts
/** Resolve o adapter de mutação para uma stack. throw UnknownMutationStackError se nenhum. */
export function adapterForStack(stack: string): MutationAdapter;
export function listMutationAdapters(): ReadonlyArray<MutationAdapter>;
```

#### 5.2.5 `src/verification/gates/fail-to-pass.ts` (RF-02) e `anti-tamper.ts` (RF-03)

```ts
// fail-to-pass.ts
export interface FailToPassBaseline {
  readonly recordedAt: string;
  readonly ranAgainst: string;
  readonly failed: ReadonlyArray<string>;
  readonly allFailed: boolean;
}

/** Grava o baseline: roda a spec contra o código PRÉ-implementação; exige que TODOS falhem. */
export async function recordFailToPassBaseline(args: {
  readonly taskId: string; readonly cwd: string; readonly specGlob: string;
}): Promise<FailToPassBaseline>;

/** Verifica no --complete: baseline existe, era allFailed, e agora a mesma spec PASSA. */
export async function checkFailToPass(args: {
  readonly taskId: string; readonly cwd: string;
}): Promise<AspectResult>;

// anti-tamper.ts
export interface TamperSnapshot {
  readonly assertionCount: number;
  readonly testFiles: ReadonlyArray<string>;
  readonly coveragePct?: number;
}

/** Snapshot das asserções/arquivos de teste no momento do baseline. */
export async function snapshotTests(args: {
  readonly cwd: string; readonly testGlob: string;
}): Promise<TamperSnapshot>;

/**
 * RF-03: reprova se a suíte foi enfraquecida pelo executor:
 *   - assertionCount diminuiu, OU
 *   - algum testFile do baseline sumiu / virou skip/only, OU
 *   - coveragePct caiu além de tolerância.
 * Contagem de asserções é AST-lite por stack (chamadas expect/assert/#[test]).
 */
export async function checkAntiTamper(args: {
  readonly baseline: TamperSnapshot; readonly cwd: string; readonly testGlob: string;
}): Promise<AspectResult>;
```

#### 5.2.6 `src/verification/best-of-n/` (RF-04/05) e `selector/pareto.ts`

```ts
// worktree.ts — git via argv (shell:false)
export interface Worktree { readonly id: string; readonly path: string; readonly branch: string; }
export async function createWorktree(repoRoot: string, id: string): Promise<Worktree>;
export async function removeWorktree(repoRoot: string, wt: Worktree): Promise<void>;
export async function listWorktrees(repoRoot: string): Promise<ReadonlyArray<Worktree>>;

// runner.ts
export interface Candidate {
  readonly id: string;                 // 'cand-1'..'cand-N'
  readonly worktree: Worktree;
  readonly verification: VerificationResult;  // já rodado por candidato
}

/**
 * Orquestra best-of-N: cria N worktrees, deixa a SKILL preencher cada um
 * (o CLI NÃO gera código), roda runVerification em cada, seleciona via selector,
 * promove o vencedor para o worktree principal, arquiva/remove os demais.
 *
 * Concorrência: worktrees são isolados; verificação paralela é segura (cwds distintos).
 */
export async function runBestOfN(args: {
  readonly taskId: string; readonly repoRoot: string; readonly n: number;
  readonly config: VerificationConfig;
  readonly fillCandidate: (wt: Worktree) => Promise<void>; // ponte p/ a skill/agente
}): Promise<{ winner: Candidate; discarded: ReadonlyArray<Candidate> }>;

// selector/pareto.ts (RF-05)
/**
 * Escolhe o candidato Pareto-dominante sobre os aspectos (test, lint, type, mutation).
 * Empate (não-dominado) → maior mutationScore; persistindo empate → menor id (determinístico).
 * Candidatos com algum aspecto FAIL são descartados antes do Pareto.
 */
export function selectByPareto(candidates: ReadonlyArray<Candidate>): Candidate;
```

#### 5.2.7 `src/verification/bench/` (RF-07)

```ts
export interface FixtureMeta {
  readonly id: string; readonly stack: string; readonly description: string;
  readonly patch: string;          // 'patch.diff' ou candidato
  readonly failToPass: string;     // 'fail_to_pass.txt'
  readonly passToPass: string;     // 'pass_to_pass.txt'
}

export interface FixtureResult {
  readonly id: string; readonly stack: string;
  readonly fixRate: number;            // #fail-to-pass que passam / |fail-to-pass|
  readonly passToPassRegressed: boolean;
  readonly solved: boolean;            // fixRate === 1 && !passToPassRegressed
  readonly failToPass: { passed: number; total: number };
  readonly passToPass: { passed: number; total: number };
  readonly durationMs: number;
}

/**
 * RF-07: aplica patch da fixture num clone isolado, roda fail-to-pass e pass-to-pass,
 * computa Fix·Rate (zerado se algum pass-to-pass regredir — arXiv:2512.18470).
 * Determinístico: nenhuma chamada a LLM.
 */
export async function runFixture(meta: FixtureMeta, baseDir: string): Promise<FixtureResult>;

/** Agrega solve-rate e compara com baseline (RF-08). */
export function buildReport(results: ReadonlyArray<FixtureResult>, baseline?: BenchReport): BenchReport;
```

#### 5.2.8 `src/verification/telemetry.ts` (RF-10) e `exec/safe-spawn.ts` (RS-06)

```ts
// telemetry.ts
/**
 * Grava o veredito no GraphRAG:
 *   - upsert nó gate:  { id: `gate:${taskId}`, type: 'gate', metadata: { mutationScore, verdict } }
 *   - aresta task --verified_by--> gate
 * Fallback (backend sem 'gate'/'verified_by'): grava em task.metadata.verification.
 */
export function recordVerification(graph: KnowledgeGraph, result: VerificationResult): void;

// exec/safe-spawn.ts (RS-06)
export interface SafeSpawnResult { code: number; stdout: string; stderr: string; timedOut: boolean; }
/**
 * Spawn SEGURO: argv explícito, shell:false, env saneado (sem herdar segredos não-necessários),
 * sem rede por default no caminho de mutação (RS-03), stdout/stderr truncados.
 * NUNCA interpola conteúdo de task em string de shell. Única porta de execução do núcleo.
 */
export async function safeSpawn(
  command: string, args: ReadonlyArray<string>,
  opts: { cwd: string; timeoutSeconds: number; maxChars?: number; env?: NodeJS.ProcessEnv },
): Promise<SafeSpawnResult>;
```

### 5.3 Refatoração do `ralph-loop.ts` (RS-06) — contrato concreto

Para fechar RS-06 sem `shell:true`, `gatesFor` passa a devolver **argv**:

```ts
export interface RalphLoopGate { name: GateName; command: string; args: string[]; }
// ex.: { name: 'test', command: 'npm', args: ['test', '--', '--passWithNoTests'] }
```

- O venv Python (hoje resolvido com `if exist`/`if -x` em string de shell) passa a ser resolvido **em JS**:
  `resolvePythonBin(cwd, tool)` retorna `.venv/Scripts/<tool>.exe` (win) ou `.venv/bin/<tool>` (posix) se existir,
  senão o nome puro; o resultado vira o `command` do `argv`.
- Gates compostos com `&&` (ex.: clippy + fmt do Leptos) viram **dois `RalphLoopGate` sequenciais** (sem shell).
- `runShell` é substituído por `safeSpawn` (Seção 5.2.8). Comportamento observável (pass/fail/stderr truncado/timeout) **idêntico** — coberto pelo teste existente `__tests__/dag-runner/ralph-loop.test.ts` (ajustado para argv).

---

## 6. Plano de Execução (Fases)

> Convenção da skill: Fase 1 = "containerização", Fase N-1 = security audit.
>
> **Adaptação justificada (igual ao BLUEPRINT v3.1):** este artefato não é um serviço — é um núcleo de uma
> **CLI npm**. Não há Dockerfile de produto. Fase 1 = **Foundation determinística** (contratos + config +
> segurança de execução), que é a "fundação" equivalente. Fase N-1 (segurança/deps) é mantida.

### Fase 1 — Foundation: contratos, config, segurança de execução

**Objetivo:** estabelecer tipos, parsing de config e a porta de execução segura **antes** de qualquer gate.

**Critério de DONE (verificável):**
- `src/verification/{types,config}.ts` compilam (`tsc --noEmit`) e `parseVerificationConfig` tem teste cobrindo: bloco ausente ⇒ `enabled:false`; merge com defaults; erro zod com path.
- `src/exec/safe-spawn.ts` existe; teste prova `shell:false`, timeout e truncamento.
- `src/utils/path-safety.ts` (extração de `assertRelativeSafe`) + `dna-emitter.ts` passa a importar dele (sem mudar comportamento; teste de paridade).
- `src/utils/logger.ts` (pino) exportado; sem `console.log` novo no núcleo.
- Lint custom: `shell: true` proibido fora de `__tests__`.

### Fase 2 — Refatoração RS-06 do Ralph Loop (`gatesFor` → argv, `safeSpawn`)

**Objetivo:** eliminar `shell:true` do caminho de gate sem mudar comportamento observável.

**Critério de DONE:**
- `gatesFor(stack)` devolve `{ name, command, args[] }` para **todas** as stacks já suportadas.
- `resolvePythonBin` substitui o `pythonShellPath` baseado em shell.
- Gates com `&&` viram gates sequenciais.
- `__tests__/dag-runner/ralph-loop.test.ts` ajustado e **verde** (pass/fail/timeout/stderr idênticos).
- `dare execute --complete` num projeto de cada stack ainda passa/reprova como antes (paridade).

### Fase 3 — fail-to-pass (RF-02) + anti-trapaça (RF-03)

**Objetivo:** transformar a spec executável em gate, com proteção contra enfraquecimento.

**Critério de DONE:**
- `recordFailToPassBaseline` grava `.dare/verification/<id>.json` provando que a spec falhou contra código pré-impl; `checkFailToPass` exige que agora passe.
- `snapshotTests` + `checkAntiTamper` reprovam quando asserções diminuem / teste vira `skip`/`only` / arquivo some.
- Contagem AST-lite de asserções implementada para JS/TS e Python (demais stacks: contagem por regex idiomática, documentada).
- `--complete` com `failToPass.required` e baseline ausente → exit 4 + mensagem exata (5.1.1).
- Testes: par "spec que falha→passa" e "executor que apaga assert" (este reprovado).

### Fase 4 — Mutation testing plugável (RF-01)

**Objetivo:** `mutation score` como gate incremental por stack.

**Critério de DONE:**
- `MutationAdapter` + registry; **StrykerJS (JS/TS)** e **mutmut (Python)** completos (MUST); **cargo-mutants** e **Infection** como adapters SHOULD com `isAvailable`/`run`.
- Modo incremental usa `changedFiles` (git diff); `--full-mutation` desliga.
- `runVerification` curto-circuita: mutação só roda se aspectos baratos passaram.
- Score < `minScore` → aspecto `mutation` FAIL → DONE bloqueado.
- Ferramenta ausente em `native` → exit 3 (não pula gate em silêncio).
- RNF-01: teste mede overhead < 3× o tempo de teste normal numa fixture pequena (com `maxMutants`/timeout).

### Fase 5 — Política decay-aware do Ralph Loop (RF-06)

**Objetivo:** substituir o cap fixo por uma regra canônica única.

**Critério de DONE:**
- `failureSignature` estável (par de stderr "mesma falha" ⇒ mesmo hash; "falha diferente" ⇒ hashes diferentes).
- `decideNextAction` cobre os 5 ramos (DONE/ESCALATE/saturação→ação/CONTINUE) com testes table-driven.
- `state-store.ts` persiste `attempts[]`; `--verdict-json` emite `LoopVerdict`.
- `policy: fixed` reproduz comportamento clássico (cap por `maxAttempts`).
- Doc `ralph-loop.md` atualizada apontando para esta regra única (remove a contradição).

### Fase 6 — best-of-N + seletor por verificador (RF-04/05)

**Objetivo:** usar worktrees para gerar N candidatos e selecionar o melhor.

**Critério de DONE:**
- `worktree.ts` cria/limpa worktrees via git argv (shell:false); paths validados (RS-01).
- `runBestOfN` roda `runVerification` por candidato (paralelo, cwds isolados) e promove o vencedor; descartados arquivados.
- `selectByPareto` escolhe Pareto-dominante; empate por mutation score; determinístico (teste com candidatos sintéticos).
- `dare execute --best-of 3` num fixture eleva pass-rate vs single-shot (meta O-04: +10pp medido na suite de bench).
- A geração de candidatos é da skill (`fillCandidate` é a ponte); CLI não chama LLM.

### Fase 7 — Harness `dare bench` (RF-07) + telemetria (RF-10)

**Objetivo:** medir o método e registrar vereditos no grafo.

**Critério de DONE:**
- `dare bench --suite fixtures/bench` emite JSON + tabela; `Fix·Rate` zera se algum pass-to-pass regride.
- Pelo menos **6 fixtures** internas (≥1 por stack MUST + casos de "patch sabidamente errado" para O-01).
- O-01: ≥90% dos "patches sabidamente errados" (mutantes não mortos) são rejeitados pela suite reforçada.
- `recordVerification` grava nó `gate` + aresta `verified_by`; `dare graph viz` mostra a relação; fallback metadata testado.
- `--baseline` + `--fail-on-regression 3` funcionam (exit 1 em regressão).

### Fase 8 — Auditoria de segurança e dependências (**Fase N-1**)

**Objetivo:** validar que a feature não introduz vulnerabilidade nem vaza segredo.

**Critério de DONE:**
- `pnpm audit --audit-level=high` no CLI: 0 HIGH/CRITICAL (Stryker e deps novas auditadas — RS-04).
- Lint custom confirma **zero** `shell: true` no caminho de verificação (RS-06).
- `safeSpawn` no caminho de mutação roda **sem rede** por default e com env saneado (RS-03/RS-02): teste prova que `.env`/tokens não aparecem em stdout/stderr capturados.
- `assertRelativeSafe` aplicado a toda entrada de fixture/worktree (RS-01): teste com `../` e path absoluto reprova.
- RF-09/RS-07: se `prerank` ligado, teste prova que ele **nunca** transforma um FAIL em DONE (só ordena).
- Segredos do harness (RS-05) lidos só de env var; nenhum credencial em fixture.

### Fase 9 — CI por release (RF-08) + docs + bump

**Objetivo:** plugar o harness no release e documentar.

**Critério de DONE:**
- `.github/workflows/release.yml` roda `dare bench --baseline <prev> --fail-on-regression 3`; workflow falha em regressão > 3pp.
- O-06: relatório de `solve-rate` + `Fix·Rate` **da suíte de fixtures** (qualidade dos gates) publicado como artifact do release (ver nota de escopo em 5.1.2 — não é o solve-rate do loop ponta-a-ponta).
- O-05: solve-rate **ponta-a-ponta** e tokens/task com `policy: decay` vs baseline, medidos **via telemetria** (`--verdict-json` + `recordVerification`) coletada quando o agente roda o loop na IDE — não pelo `bench` (meta −15% tokens, solve-rate ≥ baseline).
- `README.md`/`ROADMAP.md`/`CHANGELOG.md` atualizados; `dare.config.json` de projetos novos ganha bloco `verification` (defaults, `enabled:false`) via `project-generator.ts` + migration em `UPDATE-MANIFEST.json`.
- Bump para v3.3.0 (proposto; o repo já está em v3.2.0).

---

## 7. Validation Gates por Stack

### 7.1 Gates do **próprio CLI** (este projeto)

| Camada | Build | Test | Lint/Audit |
|---|---|---|---|
| Node/TypeScript (`packages/cli/`) | `pnpm --filter @dewtech/dare-cli build` | `pnpm --filter @dewtech/dare-cli test` | `pnpm --filter @dewtech/dare-cli lint && pnpm --filter @dewtech/dare-cli audit --audit-level=high` |

### 7.2 Gates de **mutação** que o núcleo dispara (RF-01) — por stack do projeto-alvo

| Stack alvo | Ferramenta | Comando (argv, incremental) | Relatório parseado |
|---|---|---|---|
| node-nestjs / react / vue / mcp-node-ts | StrykerJS | `npx stryker run --incremental --mutate <changed>` | `reports/mutation/mutation.json` |
| python-fastapi / mcp-python | mutmut | `mutmut run --paths-to-mutate <changed>` | `mutmut results --json` |
| rust-axum / rust-leptos* | cargo-mutants (SHOULD) | `cargo mutants --in-diff <diff> --timeout <t>` | `mutants.out/outcomes.json` |
| php-laravel | Infection (SHOULD) | `vendor/bin/infection --only-covering-test-cases --filter=<changed>` | `infection.log`/JSON |

> Coerência: o mesmo `minScore` configurado em `dare.config.json#verification.mutation.minScore` é o que
> bloqueia o `--complete`. O gate de mutação **não substitui** build/test/lint do Ralph — roda **depois**.

---

## 8. Controles de Segurança

Mapeamento dos RS-* do DESIGN para fases e verificação:

| RS | Controle | Fase | Como é verificado |
|---|---|---|---|
| RS-01 | Validação de paths (OWASP A03) | 1, 6, 7 | `assertRelativeSafe` extraído (`path-safety.ts`) aplicado a fixtures/worktrees; teste com `..`/absoluto reprova |
| RS-02 | Sem segredos em logs/artefatos (A02) | 8 | `safeSpawn` satura env; teste injeta `SECRET` e prova ausência no stdout/stderr/relatório de bench |
| RS-03 | Execução sandboxed, sem rede por default (A01) | 4, 8 | Mutantes/testes rodam no worktree isolado; `safeSpawn` no caminho de mutação sem rede; teste cobre |
| RS-04 | Deps sem CVE HIGH/CRITICAL (A06) | 8, 9 | `pnpm audit --audit-level=high` no CI; Stryker/zod auditados |
| RS-05 | Segredos do harness via env (A05) | 7, 8 | `bench/harness.ts` lê dataset/credencial só de env; nenhuma em fixture; teste falha se hardcoded |
| RS-06 | Sem `shell:true`; spawn argv | 1, 2 | `safeSpawn`; lint custom proíbe `shell:true` fora de testes; `ralph-loop` refatorado |
| RS-07 | Exec-free nunca autoriza DONE | 6, 8 | `prerank` só reordena; teste prova que FAIL nunca vira DONE via prerank |

---

## 9. Estratégia de Testes

### 9.1 Unitários (`src/verification/__tests__/`)
- `config.test.ts` — bloco ausente ⇒ `enabled:false`; defaults; erro zod com path.
- `decay-policy.test.ts` — table-driven dos 5 ramos; `isSaturated`; `failureSignature` (pares mesma/diferente falha).
- `fail-to-pass.test.ts` — baseline allFailed; reprova se baseline ausente; passa quando spec passa pós-impl.
- `anti-tamper.test.ts` — reprova assert removido / `skip` / arquivo deletado; AST-lite JS/TS + Python.
- `mutation-adapter.test.ts` — parse de relatório Stryker/mutmut (fixtures de relatório reais); `isAvailable` false ⇒ erro tipado.
- `selector-pareto.test.ts` — Pareto-dominância; empate por mutation score; determinismo.
- `bench-report.test.ts` — `Fix·Rate` zera com pass-to-pass regredido; agregação solve-rate; regressão vs baseline.
- `telemetry.test.ts` — upsert nó `gate` + aresta `verified_by`; fallback metadata.
- `safe-spawn.test.ts` — shell:false; timeout; truncamento; env saneado.

### 9.2 Integração
- `commands/__tests__/execute.verify.spec.ts` — `--complete --verify` num tmp project: PASS→DONE, mutação baixa→FAIL+exit, `--verdict-json` emite `LoopVerdict`.
- `commands/__tests__/bench.spec.ts` — `dare bench` numa mini-suite (2 fixtures), JSON válido, exit codes.
- `__tests__/dag-runner/ralph-loop.test.ts` — manter verde após refatoração argv/safeSpawn.

### 9.3 Harness (dogfooding — O-01/O-06)
- `fixtures/bench/` versionada com ≥6 fixtures, incluindo casos de "patch que passa em teste fraco" (mutante não morto) para medir O-01 (≥90% rejeitados).
- Job de CI roda `dare bench` e publica relatório; gate de regressão (RF-08).

### 9.4 Cobertura
- RNF-03: cobertura do próprio núcleo `src/verification/**` ≥ 80% (medida no CI do CLI).

---

## 10. Estratégia de Deploy

Mesma do BLUEPRINT v3.1 (biblioteca npm CLI; sem staging/prod):

| Ambiente | Artefato | Branch | Trigger | Infra |
|---|---|---|---|---|
| Pre-release local | tarball (`npm pack`) | `feat/verification-core` | manual | node local |
| Beta (npm tag `next`) | `@dewtech/dare-cli@3.3.0-beta.N` | `feat/verification-core` | `gh workflow run publish.yml --field tag=next` | npm registry |
| Stable | `@dewtech/dare-cli@3.3.0` | `main` | tag `v3.3.0` | npm + GitHub Release |
| Regressão de qualidade | relatório `dare bench` | tag `v*` | automático no `release.yml` | GitHub Actions |

Rollback: `npm dist-tag add @dewtech/dare-cli@3.2.0 latest`. Como `verification` é opt-in (RNF-06),
projetos sem o bloco não são afetados por um eventual bug do núcleo.

---

## 11. Anti-Stub Contract — Aplicação a esta Feature

### 11.1 Checklist por task de verificação (antes de DONE)
- [ ] Cada função pública tem assinatura tipada + pré/pós-condições + erros enumerados no JSDoc (Seção 5.2).
- [ ] Cada gate retorna `AspectResult` com `reason` **string estável** (testável), nunca genérico.
- [ ] `decideNextAction` cobre os 5 ramos — sem ramo "TODO".
- [ ] Adapters de mutação parseiam relatório **real** (fixture de relatório no teste), não devolvem score hardcoded.
- [ ] Mensagens de erro batem **exatamente** as strings da Seção 5.1.1.
- [ ] `dare bench` computa `Fix·Rate` da fórmula (zera com regressão), não estima.
- [ ] Nenhum `shell:true`, `throw new Error('not implemented')`, `expect(true).toBe(true)`, mutação com score fixo.

### 11.2 Anti-padrões proibidos no PR
- `TODO`/`FIXME`/`XXX`/`// stub`/`# placeholder` em código novo.
- Gate que retorna `PASS` sem rodar a verificação.
- Adapter de mutação que ignora `changedFiles` e finge incremental.
- `prerank` autorizando DONE (viola RS-07).

Lint custom (regex) roda em pré-commit + CI, igual ao já adotado no v3.1.

---

## 12. Checklist de Aprovação do BLUEPRINT

Para destravar `/dare-tasks`:

- [ ] Diagrama (1.2) reflete a divisão CLI-determinístico ↔ skill-LLM
- [ ] Decisões A-1…A-13 (1.3) estão alinhadas com o DESIGN e com a regra de ouro da casa
- [ ] Stack de mutação por linguagem (Seção 2): **Stryker+mutmut MUST**, cargo-mutants+Infection SHOULD — aprovado?
- [ ] Tipos de `verification/types.ts` (4.1) são suficientes (config, veredito, attempts)
- [ ] Contratos CLI (5.1) — strings de erro e exit codes fazem sentido
- [ ] Regra canônica do decay (5.2.3) resolve a contradição de `ralph-loop.md`
- [ ] Refatoração RS-06 do Ralph (5.3) é aceitável (argv, gates sequenciais, venv em JS)
- [ ] `dare bench` avaliar **patches dados** (A-7) é o modelo certo para manter determinismo
- [ ] Plano de Fases (6) — Fase 1 (foundation) + Fase N-1 (segurança) cobrem os RS-*
- [ ] Anti-stub (11) é suficiente para impedir gates/adapters vazios

> **Próximo passo:** após sua aprovação, rodar `/dare-tasks` para gerar `DARE/TASKS-verification-core.md`,
> `DARE/dare-dag-verification-core.yaml` e os `DARE/EXECUTION/task-*.md` com a spec executável de cada
> gate/adapter/comando. Fundamentação por paper em `pesquisas-estrategicas/papers-dare/cards/`
> (`idea-1`,`idea-2`,`idea-3`,`idea-9`,`idea-11`).
