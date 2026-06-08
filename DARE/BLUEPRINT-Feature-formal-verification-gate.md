# Feature Blueprint: Gate de Verificação Formal (Formal Verification Gate)

> Derivado de [DESIGN-Feature-formal-verification-gate.md](DESIGN-Feature-formal-verification-gate.md).
> Único entregável desta etapa: este BLUEPRINT. Tasks/DAG/specs de execução virão em `/dare-tasks`.
> Branch proposta: `feat/formal-verification-gate` · Target release: **v3.8.0** (repo em **v3.7.0** — confirmado em `package.json:3` e `packages/cli/package.json:3`; v3.3.0→v3.7.0 já entregues; feature nova ⇒ minor bump) · License: MIT.
>
> **⚠️ EMBRIONÁRIO / EXPERIMENTAL (`idea-10`).** Gate **OPT-IN ESTRITO**, só em **módulos marcados**, escopo single-function <100 LOC, com **degradação graciosa** quando a toolchain está ausente. A maioria dos RF é **SHOULD/COULD**; o único **MUST** é o comportamento não-invasivo (RNF-01/02). As taxas fim-a-fim de CLEVER (~0,62%) **proíbem qualquer obrigatoriedade**.
>
> **Extensão, não fork.** Esta feature é **um aspecto adicional** do `verification-core` (v3.3.0). Pluga no **mesmo** mecanismo de aspectos do `runner.ts` (`packages/cli/src/verification/runner.ts:140`), reusa `AspectResult`/`VerificationResult` (`types.ts:59,67`), o registry de adapters como modelo (`registry.ts:5`), `safeSpawn` (`exec/safe-spawn.ts:72`) e a política decay-aware (`decay/policy.ts`). **Não reespecifica** mutation/TDD/best-of-N/decay.
>
> **Base de evidências:** cards em `pesquisas-estrategicas/papers-dare/cards/` (`idea-10`): Vericoding (arXiv:2509.22908 — **Dafny 82,2% vs. Verus 44,3% vs. Lean 26,8%**), CLEVER (arXiv:2505.13938 — fim-a-fim **0,62%**, specs não-computáveis anti-trapaça), PREFACE/Proof2Silicon (arXiv:2509.06239 — **+21%** com prompt-repair sem fine-tune), Dafny-as-IL (arXiv:2501.06283 — humano valida só a NL, nunca o formal).

---

## 1. Visão Geral da Arquitetura

### 1.1 Princípio reitor (não-negociável)

**Regra de ouro da casa, idêntica ao núcleo:** o **CLI é 100% determinístico**. Toda inferência por LLM — formalizar a spec em Dafny, devolver a **tradução NL** ao humano, gerar implementação+prova, reescrever o prompt no reparo (PREFACE) — vive nas **skills das IDEs**, não no CLI. O CLI **orquestra o verificador externo (processo filho via `safeSpawn`) e lê o veredito**; nunca chama LLM nem decide a prova por conta própria (RS-06 do DESIGN).

Três invariantes herdados e endurecidos:

| Princípio | Consequência arquitetural |
|---|---|
| **Opt-in estrito** | Ausência de `verification.formal` **ou** de marcação crítica ⇒ o aspecto é **SKIP** ou nem entra no pipeline. Zero impacto em quem não pediu (RNF-01/02). |
| **Toolchain externa, não dep do CLI** | Dafny/Z3/Verus/Lean são pré-requisito do *ambiente*, instalados no projeto-alvo. **Nada** entra no `package.json` do CLI (contraste com Stryker, que é dep — ver `BLUEPRINT-Feature-verification-core.md` §2). `isAvailable()` decide degradação graciosa (RNF-05). |
| **Verificador externo decide a prova** | "passar" = **PROVADO pelo verificador determinístico**, nunca auto-avaliação do LLM. O CLI parseia o relatório/exit-code nativo, igual ao adapter de mutação faz com o JSON do Stryker (`gates/mutation/stryker.ts:39`). |

### 1.2 Diagrama

```mermaid
flowchart TB
    skill["Skill da IDE (LLM)<br/>formaliza spec · tradução NL · impl+prova · prompt-repair"] -->|"escreve artefatos"| fs[("EXECUTION/&lt;id&gt;.formal/<br/>spec.dfy · impl · spec.nl.md")]

    cli["dare execute --complete &lt;id&gt;"] --> ralph["ralph-loop.ts<br/>build → test → lint"]
    ralph -->|"passed"| run["verification/runner.ts<br/>(núcleo v3.3.0 — INALTERADO em forma)"]

    run --> ftp["fail-to-pass (RF-02 núcleo)"]
    run --> tamper["anti-tamper (RF-03 núcleo)"]
    run --> mut["mutation (RF-01 núcleo)"]
    run --> formal["gates/formal/runner.ts<br/>(NOVO aspecto 'formal')"]

    subgraph formalgate["Aspecto formal — só em módulo MARCADO"]
        formal --> marker["marker.ts<br/>@dare-formal / config.modules"]
        formal --> avail{"backend.isAvailable()?"}
        avail -->|"não + marcado"| hard["FAIL exit 5<br/>(exige instalação explícita)"]
        avail -->|"não + não-marcado"| skip["SKIP (degradação graciosa)"]
        avail -->|"sim"| backend["FormalBackend adapter<br/>dafny.ts (default) · verus.ts · lean.ts"]
        backend -->|"safeSpawn argv, shell:false"| solver[["Dafny + Z3 (externo)"]]
        solver --> verdict2["FormalVerdict<br/>{verified, stage, bypass}"]
        verdict2 --> antibypass["anti-bypass.ts (RF-06/RS-02)<br/>assume(false) · ensures true · vazamento"]
    end

    antibypass --> aspect["AspectResult{ aspect:'formal' }"]
    aspect --> result["VerificationResult (núcleo)"]
    result --> decay["decay/policy.ts (núcleo)<br/>CONTINUE/FRESH_START/REPLAN/ESCALATE"]
    result -->|"telemetria"| graph["telemetry.ts → KnowledgeGraph<br/>task --proven_by--> formal-gate"]

    safe["exec/safe-spawn.ts (núcleo, RS-06)"] -.-> backend
    psafe["utils/path-safety.ts (núcleo, RS-01)"] -.-> marker
```

`*` Caminhos pontilhados = controles de segurança transversais reusados do núcleo (Seção 8).

### 1.3 Decisões Arquiteturais (com justificativa)

| # | Decisão | Alternativas consideradas | Justificativa |
|---|---|---|---|
| A-1 | **Gate formal é mais um `Aspect` no `runner.ts` do núcleo**, não um runner paralelo | Criar `formal-runner.ts` autônomo; forkar `ralph-loop` | RF-05: o `runner.ts` já é o orquestrador de aspectos (`runner.ts:140-256`). Acrescenta-se um bloco `if (config.formal.enabled)` após `mutation`, reusando `AspectResult`/`computePassed`. Forkar repetiria o débito god-file que o núcleo evitou (A-1 do BLUEPRINT-core). |
| A-2 | **`formal` é opt-in em DOIS níveis**: `verification.formal.enabled` **E** marcação por módulo | Ligar por config global; ligar para a stack inteira | RNF-01/02 + O-03: o `mutation` do núcleo já é opt-in por config (`config.ts:6` `enabled:false`); o formal soma um segundo portão (marcação). Função **não-marcada nunca** aciona o solver — diferente de todos os outros aspectos, que rodam no diff inteiro. |
| A-3 | **Backends formais plugáveis por registry**, espelhando `registry.ts` da mutação | `switch` monolítico; só Dafny hardcoded | RNF-04: cada backend (Dafny/Verus/Lean) é um adapter isolado e testável com a mesma interface `FormalBackend`, igual a `MutationAdapter` (`gates/mutation/adapter.ts:21`). Lazy-load por `import()` como `registry.ts:18`. |
| A-4 | **Dafny é o backend DEFAULT** | Lean default (mais expressivo); Verus (Rust nativo) | **Vericoding (2509.22908): Dafny 82,2% vs. Verus 44,3% vs. Lean 26,8%** (~3× mais tratável). Verus/Lean ficam disponíveis (COULD) mas não default. Card §Resultados-chave. |
| A-5 | **Degradação graciosa via `isAvailable()`** | Quebrar o build se Dafny ausente; pular sempre em silêncio | RNF-05 + Vericoding (maturidade da toolchain): solver ausente em módulo **não-marcado** ⇒ `SKIP` com aviso; em módulo **marcado** ⇒ `FAIL` exit 5 (exige instalação explícita — não passa silenciosamente). Reusa o padrão `isAvailable()`/erro tipado do `MutationAdapter`. |
| A-6 | **Sub-gate anti-bypass obrigatório quando o formal está ativo** | Confiar no exit-code do solver | RF-06/RS-02 + Vericoding §detecção-de-trapaça: o solver "aceita" `assume(false)`/`ensures true`/spec vazada na impl. O CLI rejeita o veredito mesmo com exit 0 do Dafny. Determinístico (regex/AST-lite sobre a spec+impl). |
| A-7 | **Spec NL-opaca: humano valida só a tradução NL, nunca o Dafny** | Mostrar o Dafny ao dev | Dafny-as-IL (2501.06283): a skill formaliza, devolve NL, converge por conversa; o **consistency check por reconstrução** (estilo Clover) é confirmado pela skill. O CLI só **lê** o artefato de spec já acordado — a conversa NL vive na skill (regra de ouro). |
| A-8 | **Loop de reparo = heurística PREFACE, NÃO RL** | Treinar SLM PPO (PREFACE puro) | DESIGN "Fora do Escopo": v1 só **consome** o padrão prompt-repair (realimentar o erro do verificador à skill), reusando a política decay-aware do núcleo (`decay/policy.ts`) para abortar/escalar. Ganho-alvo conservador +15pp (vs. +21% do paper, 2509.06239). |
| A-9 | **Diagnóstico granular spec×impl no `FormalVerdict`** | Veredito booleano único | RF-07 + CLEVER: separar "spec não certificada" de "impl não satisfaz spec" dá diagnóstico ao agente. `stage: 'spec' \| 'impl' \| 'both'` no veredito (COULD, mas o tipo já reserva o campo). |
| A-10 | **Telemetria reusa GraphRAG do núcleo**: aresta `task --proven_by--> formal-gate` | Só metadata no nó task | RF-09: análogo a `task --verified_by--> gate` já entregue (`telemetry.ts`). `EdgeType += 'proven_by'`, `NodeType += 'formal-gate'`; fallback em metadata. COULD. |
| A-11 | **Marcação dupla: tag `@dare-formal` no código OU lista em `dare.config.json#verification.formal.modules`** | Só config; só anotação | RF-01: a tag fica perto do alvo (descoberta por regex no diff); a lista de config é versionável e revisável. `resolveFormalTargets()` une as duas fontes e valida paths com `assertRelativeSafe` (RS-01). |
| A-12 | **Geração de testes a partir das `ensures` alimenta o fail-to-pass do núcleo** | Suíte de testes separada | RF-08 (COULD): spec verificada emite testes extras como artefato, consumidos pelo `fail-to-pass.ts` existente. Não cria pipeline novo. |

---

## 2. Stack Técnica Definida (do CLI — não dos projetos gerados)

| Camada | Tecnologia | Versão/Nota | Papel |
|---|---|---|---|
| Orquestração do aspecto | TypeScript + Node | ≥18 (já existente) | aspecto `formal` no `runner.ts` |
| Config schema | **zod** | já dep do CLI (`packages/cli/package.json:49`) | estende `verificationConfigSchema` (`config.ts:33`) com bloco `formal` |
| Execução de processo | `safeSpawn` (núcleo) | `exec/safe-spawn.ts:72` | argv, `shell:false`, env saneado, timeout — única porta para o solver |
| **Backend formal default** | **Dafny** + SMT solver (**Z3**) | **ferramenta externa local** (NÃO dep do CLI); mín. suportado declarado em `dafny.ts#isAvailable` | **alvo pragmático: 82,2% vs. Lean 27%** (Vericoding) |
| Backend formal opcional | **Verus** (Rust) / **Lean 4** | ferramenta externa local; COULD | Verus 44%, Lean 27% — adapters habilitados, não default |
| Loop de reparo | heurística estilo **PREFACE** | realimenta erro do verificador à skill; **sem RL** na v1 | eleva verified-rate (+15pp alvo, O-04) |
| Ponte NL↔formal | Dafny-as-IL (spec opaca) | a skill conversa em NL; CLI lê o artefato acordado | humano nunca vê Dafny (RF-03) |
| Telemetria | GraphRAG (JSON/SQLite) do núcleo | já existente | RF-09 (`task --proven_by--> formal-gate`) |

> **Decisão sobre toolchain (satisfaz "ferramenta externa" do DESIGN):** diferente do StrykerJS — que **é** dep npm do CLI — **nenhum** binário formal entra no `package.json`. Dafny/Z3/Verus/Lean são instalados no **projeto-alvo**; cada `FormalBackend` declara a **versão mínima suportada** e valida em `isAvailable()`. O `>=`/`mín.` aqui é contrato de compatibilidade, não range de dependência — sem drift no pacote publicado e zero CVE herdado do solver (RS-05).

---

## 3. Estrutura de Pastas (pós-feature)

```
packages/cli/
├─ package.json                          # INALTERADO (toolchain formal NÃO é dep)
├─ src/
│  ├─ verification/
│  │  ├─ types.ts                        # MODIFICADO: + FormalGateConfig, FormalBackend, FormalVerdict, CriticalModuleMarker; Aspect += 'formal'
│  │  ├─ config.ts                       # MODIFICADO: + bloco `formal` no zod schema + DEFAULTS.formal (enabled:false)
│  │  ├─ runner.ts                       # MODIFICADO: + bloco aspecto 'formal' após mutation (curto-circuita por último)
│  │  ├─ registry.ts                     # (modelo) — espelhado por gates/formal/registry.ts
│  │  ├─ telemetry.ts                    # MODIFICADO: recordFormalProof → aresta proven_by (RF-09)
│  │  └─ gates/
│  │     └─ formal/                      # NOVO — aspecto de verificação formal
│  │        ├─ backend.ts                # interface FormalBackend + FormalVerdict + erros tipados
│  │        ├─ registry.ts               # backendForConfig() lazy-load (espelha ../../registry.ts)
│  │        ├─ runner.ts                 # checkFormal(): orquestra marker→backend→anti-bypass→AspectResult
│  │        ├─ marker.ts                 # RF-01: resolveFormalTargets() (tag @dare-formal + config.modules)
│  │        ├─ anti-bypass.ts            # RF-06/RS-02: detecta assume(false)/ensures true/vazamento
│  │        ├─ dafny.ts                  # backend DEFAULT (A-4) — argv via safeSpawn, parseia veredito
│  │        ├─ verus.ts                  # backend opcional (COULD)
│  │        ├─ lean.ts                   # backend opcional (COULD)
│  │        └─ __tests__/
│  │           ├─ marker.test.ts
│  │           ├─ anti-bypass.test.ts
│  │           ├─ dafny-parse.test.ts    # parse de veredito real (fixture de saída do Dafny)
│  │           ├─ registry.test.ts
│  │           ├─ runner-formal.test.ts  # SKIP não-marcado, FAIL exit5 marcado sem toolchain, PASS
│  │           ├─ fixtures/
│  │           │  ├─ dafny.verified.txt  # saída real "verified" do Dafny
│  │           │  ├─ dafny.failed.txt    # saída real de prova rejeitada
│  │           │  └─ bypass.spec.dfy     # spec com assume(false) (deve ser rejeitada)
│  │           └─ telemetry-formal.test.ts
│  └─ commands/
│     └─ execute-verification.ts         # MODIFICADO: erro/exit 5 (formal sem toolchain em módulo marcado)
├─ fixtures/
│  └─ formal/                            # NOVO — fixtures Dafny single-function <100 LOC para verified-rate (O-02)
│     ├─ suite.json
│     └─ <fix-id>/{spec.dfy, spec.nl.md, impl.*, expected.json}
└─ DARE/
   └─ BLUEPRINT-Feature-formal-verification-gate.md   # este artefato

EXECUTION/                               # gerado pela SKILL (LLM), versionado
└─ <task-id>.formal/
   ├─ spec.dfy                           # spec formal opaca (CLI NÃO mostra ao usuário)
   ├─ spec.nl.md                         # tradução NL acordada (humano valida ESTA — RF-03)
   └─ impl.<ext>                         # implementação alvo (Go/Python/…)

.dare/                                   # runtime, gitignored
└─ verification/
   └─ <task-id>.json                     # + bloco formalProof: { backend, verified, stage, verifiedRate, repairIterations }
```

---

## 4. Modelo de Dados (contratos TypeScript)

### 4.1 Extensão de `src/verification/types.ts`

```ts
/* ── Backends formais ──────────────────────────────────────────────── */
export type FormalBackend = 'dafny' | 'verus' | 'lean';

/** Em qual obrigação a prova falhou (CLEVER §spec/impl certification, RF-07). */
export type FormalStage = 'spec' | 'impl' | 'both' | 'none';

/* ── Config (validada por zod, encaixa em VerificationConfig) ───────── */
export interface FormalGateConfig {
  /** Ausência do bloco ⇒ false (RNF-01). Segundo portão além da marcação. */
  readonly enabled: boolean;
  /** Backend default 'dafny' (A-4 — 82% vs. Lean 27%, Vericoding). */
  readonly backend: FormalBackend;
  /** Módulos/funções críticas marcadas (RF-01). Vazio + sem @dare-formal ⇒ aspecto nunca roda. */
  readonly modules: ReadonlyArray<string>;
  /** Teto de iterações do loop de reparo PREFACE (RF-04). Default 5 (10 para BigNum). */
  readonly maxRepairIterations: number;
  /** Timeout por prova, em segundos (RNF-03 — SMT é caro). Default 120. */
  readonly proofTimeoutSeconds: number;
  /** Sub-gate anti-trapaça obrigatório quando enabled (RF-06/RS-02). Default true. */
  readonly antiBypass: boolean;
}

/** Marcação resolvida de um alvo crítico (A-11). */
export interface CriticalModuleMarker {
  readonly file: string;          // path relativo, validado por assertRelativeSafe (RS-01)
  readonly symbol?: string;       // função específica (single-function <100 LOC)
  readonly source: 'tag' | 'config';
}

/** Veredito determinístico do verificador externo (NUNCA do LLM — RS-06). */
export interface FormalVerdict {
  readonly backend: FormalBackend;
  readonly verified: boolean;             // true sse o solver provou E anti-bypass passou
  readonly stage: FormalStage;            // diagnóstico granular spec×impl (RF-07/CLEVER)
  readonly bypassDetected: boolean;       // RF-06: assume(false)/ensures true/vazamento
  readonly repairIterations: number;      // quantos passos PREFACE até este veredito
  readonly solverExitCode: number;        // exit-code cru do Dafny/Verus/Lean
  readonly reason: string;                // string estável (testável)
  readonly durationMs: number;
}
```

**Encaixe em `VerificationConfig` (`types.ts:36`)** — campo adicionado, retrocompatível (ausente ⇒ default `enabled:false`):

```ts
export interface VerificationConfig {
  // … campos existentes (mutation, failToPass, antiTamper, typeCheck, loop, bestOfN, prerank) …
  readonly formal: FormalGateConfig;      // NOVO
}
```

**Encaixe em `Aspect` (`types.ts:49`)** — `'formal'` somado ao union; o aspecto formal emite um `AspectResult` comum (`types.ts:59`), de modo que `computePassed` (`runner.ts:69`) e `VerificationResult` (`types.ts:67`) **não mudam de forma**. O detalhe rico vive em `FormalVerdict`, persistido no artefato `.dare/verification/<id>.json`.

### 4.2 Invariantes

| Invariante | Como é garantido |
|---|---|
| `formal.enabled === false` ⇒ aspecto no-op | `runner.ts` só entra no bloco formal se `config.formal.enabled` (igual a `mutation.enabled`, `runner.ts:238`) |
| função não-marcada nunca aciona o solver | `resolveFormalTargets()` retorna `[]` ⇒ aspecto `SKIP` antes de qualquer `safeSpawn` (O-03) |
| `verified === true` exige prova **E** anti-bypass | `FormalVerdict.verified = solverPassed && !bypassDetected` — `verified` nunca derivado de auto-avaliação do LLM (RS-06) |
| veredito vem só do verificador externo | único caminho de execução é `backend.run()` via `safeSpawn`; nenhuma chamada LLM no CLI |
| paths de marcação seguros | `assertRelativeSafe` (núcleo, `utils/path-safety.ts`) em todo `CriticalModuleMarker.file` (RS-01) |
| degradação graciosa não vira falso-PASS | toolchain ausente ⇒ `SKIP` (não-marcado) ou `FAIL` exit 5 (marcado), **nunca** `PASS` |

---

## 5. Contratos de "API" (CLI + funções públicas)

Sem HTTP. Contratos = (a) config, (b) CLI surface, (c) funções determinísticas públicas.

### 5.1 Config — `dare.config.json#verification.formal`

```jsonc
{
  "verification": {
    "enabled": true,
    "formal": {
      "enabled": true,                  // segundo portão (default false)
      "backend": "dafny",               // 'dafny' | 'verus' | 'lean' — default 'dafny' (A-4)
      "modules": ["src/crypto/sign.ts::verifySignature"],  // RF-01 — vazio ⇒ só tags @dare-formal
      "maxRepairIterations": 5,         // RF-04 (PREFACE)
      "proofTimeoutSeconds": 120,       // RNF-03
      "antiBypass": true                // RF-06/RS-02
    }
  }
}
```

Validação por zod estende `verificationConfigSchema` (`config.ts:33`), `.strict()`, com `DEFAULTS.formal` aplicado antes do `safeParse` (mesmo padrão de `config.ts:174`):

```ts
// DEFAULTS.formal — ausência do bloco ⇒ enabled:false (RNF-01)
export const FORMAL_DEFAULTS: FormalGateConfig = {
  enabled: false, backend: 'dafny', modules: [],
  maxRepairIterations: 5, proofTimeoutSeconds: 120, antiBypass: true,
};
```

### 5.2 CLI surface — `dare execute` (flags adicionadas)

| Flag | Tipo | Default | Validação / erro exato |
|---|---|---|---|
| `--formal` | boolean | herda `verification.formal.enabled` | liga o aspecto formal nesta execução |
| `--no-formal` | boolean | — | desliga o aspecto mesmo com config on |
| `--formal-backend <b>` | `dafny\|verus\|lean` | `formal.backend` | fora do enum → `Error: --formal-backend must be 'dafny', 'verus' or 'lean' (got '<b>')` → exit 1 |

**Exit codes (estende a tabela do núcleo, `execute-verification.ts`):**

| Exit | Quando |
|---|---|
| 0 | Ralph + verificação (incl. formal) PASS → DONE |
| 1 | Gate falhou (qualquer aspecto, incl. prova rejeitada) ou flag inválida |
| 3 | Ferramenta de **mutação** ausente (núcleo, inalterado) |
| 4 | fail-to-pass baseline ausente (núcleo, inalterado) |
| **5** | **Toolchain formal ausente em módulo MARCADO** (não pula gate em silêncio — A-5/RNF-05) |

**Mensagens de erro — strings exatas (para teste), no padrão de `execute-verification.ts:25`:**

| Caso | stderr |
|---|---|
| Toolchain ausente em módulo marcado | `Error: formal backend '<backend>' not found for marked module '<target>'. Install the toolchain or unmark the module.` |
| Backend desconhecido na config | `Error: unknown formal backend '<backend>'. Supported: dafny, verus, lean.` |
| Bypass detectado | `Error: formal proof rejected — bypass pattern '<pattern>' detected in spec/impl for '<target>'.` |

### 5.3 Funções públicas — assinaturas executáveis

#### 5.3.1 `gates/formal/backend.ts` (espelha `MutationAdapter`, `gates/mutation/adapter.ts:21`)

```ts
export interface FormalRunInput {
  readonly cwd: string;
  readonly target: CriticalModuleMarker;     // single-function <100 LOC
  readonly specPath: string;                  // EXECUTION/<id>.formal/spec.dfy
  readonly implPath: string;
  readonly proofTimeoutSeconds: number;
}

/**
 * Contrato de cada backend formal. Implementações: dafny (default) / verus / lean.
 *
 * - isAvailable(cwd): checa o binário no PATH SEM rodar prova (degradação graciosa, A-5).
 * - run(input): executa o verificador via safeSpawn (argv, shell:false), parseia o
 *   relatório/exit-code NATIVO e normaliza para FormalVerdict. NUNCA chama LLM.
 *
 * Erros: throws FormalToolNotFoundError se !isAvailable() no run();
 *         FormalBackendError com .stderr se o solver falhar por config (≠ prova rejeitada).
 */
export interface FormalBackend {
  readonly backend: import('../../types.js').FormalBackend;
  readonly minVersion: string;                 // contrato de compat (não dep npm)
  isAvailable(cwd: string): Promise<boolean>;
  run(input: FormalRunInput): Promise<FormalVerdict>;
}

export class FormalToolNotFoundError extends Error { readonly backend: string; }
export class FormalBackendError extends Error { readonly stderr: string; }
```

#### 5.3.2 `gates/formal/registry.ts` (espelha `registry.ts:50`)

```ts
/** Resolve o backend formal por config; lazy-load por import(). throws UnknownFormalBackendError. */
export function backendForConfig(cfg: FormalGateConfig): Promise<FormalBackend>;
export function listFormalBackends(): Promise<ReadonlyArray<FormalBackend>>;
```

#### 5.3.3 `gates/formal/marker.ts` (RF-01)

```ts
/**
 * Une marcação por tag (@dare-formal no código, descoberta por regex no changedFiles)
 * e por config (verification.formal.modules). Valida cada file com assertRelativeSafe (RS-01).
 * Pós: lista de alvos críticos; VAZIA ⇒ aspecto formal vira SKIP (O-03 — não toca não-marcado).
 * Pura sobre (changedFiles, cwd, config); sem LLM.
 */
export async function resolveFormalTargets(args: {
  readonly cwd: string;
  readonly changedFiles: ReadonlyArray<string>;
  readonly config: FormalGateConfig;
}): Promise<ReadonlyArray<CriticalModuleMarker>>;
```

#### 5.3.4 `gates/formal/anti-bypass.ts` (RF-06/RS-02)

```ts
/**
 * Detecta padrões de trapaça (Vericoding §detecção-de-trapaça) na spec+impl:
 *   - assume(false) / assume false
 *   - ensures true (postcondição trivial)
 *   - vazamento da spec copiada na implementação
 * Determinístico (regex + AST-lite). Reprova MESMO que o solver tenha aceitado.
 * Pós: { bypassDetected, pattern? }. Sem IO de rede; sem LLM.
 */
export function detectBypass(args: {
  readonly specSource: string;
  readonly implSource: string;
}): { readonly bypassDetected: boolean; readonly pattern?: string };
```

#### 5.3.5 `gates/formal/runner.ts` — o aspecto plugado no núcleo

```ts
/**
 * Aspecto 'formal' chamado por verification/runner.ts APÓS os aspectos do núcleo.
 *
 * Ordem interna:
 *   1. resolveFormalTargets() — VAZIO ⇒ AspectResult{ verdict:'SKIP', reason:'no marked module' } (O-03)
 *   2. backend.isAvailable()  — false + marcado ⇒ throw FormalToolNotFoundError (exit 5);
 *                               (não-marcado já saiu em SKIP no passo 1)
 *   3. backend.run()          — prova via safeSpawn; FormalVerdict do verificador externo
 *   4. detectBypass()         — se antiBypass: bypass ⇒ verified=false (RF-06)
 *   5. mapeia para AspectResult{ aspect:'formal', verdict, reason, durationMs }
 *
 * Pré: config.formal.enabled === true (runner.ts checa, igual a mutation.enabled).
 * Pós: AspectResult comum; detalhe rico persistido como formalProof no artefato.
 *      O loop de reparo PREFACE NÃO roda aqui — a SKILL itera fora do CLI, reusando
 *      a política decay-aware (decay/policy.ts) para abortar/escalar (A-8).
 */
export async function checkFormal(args: {
  readonly taskId: string; readonly stack: string; readonly cwd: string;
  readonly config: FormalGateConfig; readonly changedFiles: ReadonlyArray<string>;
}): Promise<AspectResult>;
```

#### 5.3.6 Integração mínima no `verification/runner.ts` (após o bloco mutation, `runner.ts:238-252`)

```ts
if (config.formal.enabled) {
  notify(opts.onProgress, 'formal', 'start');
  const fm = await checkFormal({ taskId, stack: opts.stack, cwd, config: config.formal, changedFiles });
  aspects.push(fm);
  logAspect(fm);
  notify(opts.onProgress, 'formal', fm.verdict === 'PASS' ? 'pass' : fm.verdict === 'SKIP' ? 'skip' : 'fail');
}
```

`computePassed` (`runner.ts:69`) e `finish` (`runner.ts:75`) **não mudam**: o aspecto formal entra como mais um `AspectResult` que precisa ser `PASS` ou `SKIP`.

#### 5.3.7 `telemetry.ts` (RF-09)

```ts
/** Grava aresta task --proven_by--> formal-gate; fallback em task.metadata.formalProof. */
export function recordFormalProof(graph: KnowledgeGraph, taskId: string, verdict: FormalVerdict): void;
```

---

## 6. Plano de Execução (Fases)

> Convenção da skill: Fase 1 = Foundation; Fase N-1 = security audit; última fase = RELEASE.
>
> **Adaptação justificada (igual ao BLUEPRINT-core §6):** não é um serviço — é um aspecto de uma CLI npm. Fase 1 = **Foundation determinística** (contratos + config + marker, sem solver). Como o aspecto **reusa** runner/safeSpawn/decay/telemetria do núcleo, há **menos fases** que o núcleo.

### Fase 1 — Foundation: contratos, config e marcação (sem solver)

**Objetivo:** tipos, parsing de config e resolução de alvos críticos antes de qualquer execução do verificador.

**Critério de DONE:**
- `types.ts` ganha `FormalBackend`, `FormalStage`, `FormalGateConfig`, `CriticalModuleMarker`, `FormalVerdict`; `Aspect += 'formal'`; compila (`tsc --noEmit`).
- `config.ts`: bloco `formal` no zod schema + `FORMAL_DEFAULTS`; teste cobre bloco ausente ⇒ `enabled:false`, merge com defaults, erro zod com path.
- `marker.ts#resolveFormalTargets`: tag `@dare-formal` + `config.modules`; paths validados por `assertRelativeSafe`; lista vazia ⇒ SKIP; teste com `../`/absoluto reprova.
- Nenhum `safeSpawn` ainda; nenhum LLM.

### Fase 2 — Backend Dafny (default) + registry + anti-bypass

**Objetivo:** prova real via Dafny e rejeição de trapaça.

**Critério de DONE:**
- `backend.ts` (interface + erros tipados); `registry.ts#backendForConfig` lazy-load (espelha `../../registry.ts`).
- `dafny.ts`: `isAvailable()` checa binário; `run()` via `safeSpawn` (argv, `shell:false`), parseia veredito **real** (fixtures `dafny.verified.txt`/`dafny.failed.txt` no teste — não score hardcoded).
- `anti-bypass.ts`: detecta `assume(false)`/`ensures true`/vazamento; teste com `bypass.spec.dfy` é **rejeitado** mesmo com solver aceitando (RF-06).
- `FormalVerdict.verified = solverPassed && !bypassDetected`.

### Fase 3 — Aspecto no runner + CLI + degradação graciosa

**Objetivo:** plugar `checkFormal` no `runner.ts` e fechar exit 5.

**Critério de DONE:**
- `runner.ts` chama `checkFormal` após mutation; `computePassed`/`finish` inalterados; teste prova que aspecto formal entra no `VerificationResult`.
- Flags `--formal`/`--no-formal`/`--formal-backend` + validação (strings exatas de 5.2); backend inválido → exit 1.
- Módulo **não-marcado** ⇒ SKIP; módulo **marcado** sem toolchain ⇒ **exit 5** + mensagem exata; PASS quando prova aceita.
- `verus.ts`/`lean.ts` como adapters SHOULD (`isAvailable`/`run` com a mesma interface).

### Fase 4 — Telemetria + verified-rate em fixtures (O-02/RF-09)

**Objetivo:** medir o método e registrar a prova no grafo.

**Critério de DONE:**
- `recordFormalProof`: aresta `task --proven_by--> formal-gate`; fallback metadata testado.
- `fixtures/formal/` com ≥6 fixtures Dafny single-function <100 LOC (incl. casos `spec.nl.md` para o fluxo NL-opaco e casos de bypass que devem reprovar).
- O-02: `verified-rate` ≥ 70% na suíte de fixtures (alinhado a Dafny 82% + reparo); O-06: 100% dos padrões de bypass rejeitados.
- RF-08 (COULD): testes derivados das `ensures` registrados como artefato e consumidos pelo `fail-to-pass.ts`.

### Fase 5 — Auditoria de segurança e dependências (**Fase N-1**)

**Objetivo:** garantir que o aspecto não introduz vulnerabilidade nem vaza segredo, e que a toolchain externa nunca é confiada cegamente.

**Critério de DONE:**
- `pnpm audit --audit-level=high` no CLI: 0 HIGH/CRITICAL (lembrar: a toolchain formal **não** é dep do CLI — RS-05).
- Lint custom confirma **zero** `shell:true` no caminho formal; `safeSpawn` é a única porta (RS-04/RS-06 — herdado de `no-shell-true.test.ts`).
- Teste injeta `SECRET`/`TOKEN` no env e prova ausência em spec/prova/logs/veredito (RS-03 — reusa `sanitizeEnv`, `safe-spawn.ts:52`).
- `assertRelativeSafe` aplicado a todo `CriticalModuleMarker.file` (RS-01): `../`/absoluto reprova.
- RS-06: teste prova que `FormalVerdict.verified` **nunca** vem de auto-avaliação — só de `backend.run()`; spec com `assume(false)` reprovada apesar do exit 0 do solver (RS-01-anti-trapaça).
- Specs não-computáveis (`Prop`/quantificadores, CLEVER) documentadas como recomendação anti-trapaça (RS-01).

### Fase 6 — RELEASE v3.8.0 (docs + bump + banner)

**Objetivo:** publicar a feature e **corrigir o débito histórico do banner do README** (travado em v3.3.0 por 4 releases — confirmado em `README.md:17,313,791`).

**Critério de DONE (OBRIGATÓRIO — releases anteriores esqueceram isto):**
- **(a) CHANGELOG:** entrada `[3.8.0]` descrevendo o Formal Verification Gate (opt-in estrito, Dafny default, degradação graciosa).
- **(b) Bump de versão:** `package.json` raiz `3.7.0 → 3.8.0` (`package.json:3`) **e** `packages/cli/package.json` `3.7.0 → 3.8.0` (`packages/cli/package.json:3`).
- **(c) README raiz** (`README.md`):
  - **Banner** — atualizar a linha `> 🚀 **v3.3.0** — …` (`README.md:17`) para `> 🚀 **v3.8.0** — Formal Verification Gate: gate opt-in que prova (não só testa) módulos críticos marcados contra spec Dafny/Verus/Lean …`.
  - **Seção "Skills & comandos"** — atualizar o título `## 🔌 Skills & comandos (v3.3.0)` (`README.md:313`) para `(v3.8.0)` e listar as flags `--formal`/`--formal-backend`.
  - **Roadmap "Shipped"** — atualizar `README.md:791` para refletir v3.8.0 (Formal Verification Gate) além das versões intermediárias v3.4.0–v3.7.0; adicionar nova seção `## 🔒 Formal Verification Gate (v3.8)` no corpo (padrão das seções de feature, ex. `README.md:183`).
- **(d) README do CLI** (`packages/cli/README.md`): nota da versão nova com o bloco `verification.formal` e as flags.
- CI release roda os gates do CLI verdes; tag `v3.8.0`.

---

## 7. Validation Gates por Stack

### 7.1 Gates do próprio CLI (este projeto)

| Camada | Build | Test | Lint/Audit |
|---|---|---|---|
| Node/TypeScript (`packages/cli/`) | `pnpm --filter @dewtech/dare-cli build` | `pnpm --filter @dewtech/dare-cli test` | `pnpm --filter @dewtech/dare-cli lint && pnpm --filter @dewtech/dare-cli audit --audit-level=high` |

### 7.2 Backends formais que o aspecto dispara (RF-02) — por config

| Backend | Comando (argv via `safeSpawn`, `shell:false`) | Veredito parseado | Prioridade |
|---|---|---|---|
| **Dafny** (default) | `dafny verify <spec.dfy> --solver-path z3 --verification-time-limit <t>` | exit 0 + `verified` na saída; `n errors`/`assertion might not hold` ⇒ rejeitado | **default (82%)** |
| Verus (Rust) | `verus <spec.rs> --time-limit <t>` | exit 0 + `verification results: N verified, 0 errors` | COULD (44%) |
| Lean 4 | `lake env lean <spec.lean>` | exit 0 sem `sorry`/`error` no type-checker | COULD (27%) |

> O `proofTimeoutSeconds` configurado é o que limita cada prova (RNF-03). O aspecto formal **não** substitui build/test/lint/mutation — roda **depois**, só em módulo marcado.

---

## 8. Controles de Segurança

Mapeamento dos RS-* do DESIGN para fases e verificação:

| RS | Controle | Fase | Como é verificado |
|---|---|---|---|
| RS-01 | **Specs não-computáveis anti-trapaça** (CLEVER) + paths seguros | 1, 5 | Doc recomenda `Prop`/quantificadores; `assertRelativeSafe` em todo marker (`../`/absoluto reprova) |
| RS-02 | **Detecção de padrões de bypass** como sub-gate obrigatório | 2, 5 | `detectBypass` reprova `assume(false)`/`ensures true`/vazamento mesmo com solver aceitando (Vericoding) |
| RS-03 | **Sem segredos** em spec/prova/logs/telemetria | 5 | `sanitizeEnv` (`safe-spawn.ts:52`); teste injeta `SECRET` e prova ausência no veredito/stderr |
| RS-04 | **Execução sandboxed** — solver no worktree, sem rede por default | 2, 5 | `safeSpawn` (argv, `shell:false`, env saneado); herda RS-03/RS-06 do núcleo |
| RS-05 | **Dependência formal auditada** — toolchain externa, não dep do CLI | 5, 6 | `pnpm audit` no CLI (toolchain fora do `package.json` ⇒ zero CVE herdado do solver) |
| RS-06 | **Prova não falsificável pela skill** — veredito só do verificador externo | 2, 5 | `verified` só de `backend.run()`; teste prova que auto-avaliação do LLM nunca vira PASS |

---

## 9. Estratégia de Testes

### 9.1 Unitários (`gates/formal/__tests__/`)
- `marker.test.ts` — tag + config; lista vazia ⇒ SKIP; `../`/absoluto reprova.
- `anti-bypass.test.ts` — `assume(false)`/`ensures true`/vazamento detectados; spec honesta passa.
- `dafny-parse.test.ts` — parse de veredito **real** (fixtures `dafny.verified.txt`/`dafny.failed.txt`); nunca score hardcoded.
- `registry.test.ts` — `backendForConfig` lazy-load; backend desconhecido ⇒ erro tipado.
- `runner-formal.test.ts` — não-marcado ⇒ SKIP; marcado sem toolchain ⇒ FormalToolNotFoundError (exit 5); prova aceita ⇒ PASS; bypass ⇒ FAIL.
- `telemetry-formal.test.ts` — aresta `proven_by` + fallback metadata.

### 9.2 Integração
- `commands/__tests__/execute.formal.spec.ts` — `--complete --formal` em tmp project: SKIP (não-marcado), exit 5 (marcado sem toolchain), PASS (prova aceita).

### 9.3 Harness / fixtures (dogfooding — O-02/O-06)
- `fixtures/formal/` ≥6 fixtures Dafny single-function <100 LOC, incl. casos de bypass (devem reprovar) e `spec.nl.md` (fluxo NL-opaco).
- `verified-rate` ≥ 70% (O-02); 100% dos bypass rejeitados (O-06). Roda só onde a toolchain está disponível (RNF-06).

### 9.4 Cobertura
- RNF-04: cobertura de `gates/formal/**` ≥ 80% (medida no CI do CLI).

---

## 10. Estratégia de Deploy

Mesma do BLUEPRINT-core §10 (biblioteca npm CLI; sem staging/prod):

| Ambiente | Artefato | Branch | Trigger | Infra |
|---|---|---|---|---|
| Pre-release local | tarball (`npm pack`) | `feat/formal-verification-gate` | manual | node local |
| Beta (npm tag `next`) | `@dewtech/dare-cli@3.8.0-beta.N` | `feat/formal-verification-gate` | `gh workflow run publish.yml --field tag=next` | npm registry |
| Stable | `@dewtech/dare-cli@3.8.0` | `main` | tag `v3.8.0` | npm + GitHub Release (provenance `--provenance`) |

Rollback: `npm dist-tag add @dewtech/dare-cli@3.7.0 latest`. Como `formal` é opt-in em dois níveis (RNF-01/02), projetos sem o bloco/sem marcação **não** são afetados por um eventual bug do aspecto.

---

## 11. Anti-Stub Contract — Aplicação a esta Feature

### 11.1 Checklist por task (antes de DONE)
- [ ] Cada função pública tem assinatura tipada + pré/pós-condições + erros enumerados (Seção 5.3).
- [ ] `dafny.ts#run` parseia o veredito **real** do solver (fixture de saída no teste); **proibido** `verified: true` hardcoded.
- [ ] `checkFormal` chama de fato `backend.run()` via `safeSpawn` — **proibido** gate que retorna PASS sem rodar o solver.
- [ ] `detectBypass` reprova `assume(false)`/`ensures true`/vazamento — **proibido** anti-bypass que sempre passa.
- [ ] Mensagens de erro batem **exatamente** as strings da Seção 5.2.
- [ ] Módulo não-marcado **nunca** dispara o solver (teste prova SKIP antes de qualquer `safeSpawn`).

### 11.2 Anti-padrões proibidos no PR
- `verified = true` hardcoded; `FormalVerdict` com score/exit fixo.
- Gate formal que retorna PASS **sem** executar o verificador externo.
- Anti-bypass desligado em módulo marcado, ou que ignora o conteúdo da spec.
- `shell:true`, `TODO`/`FIXME`/`// stub`, `throw new Error('not implemented')` em código novo.
- Toolchain formal adicionada como **dep do `package.json`** do CLI (viola "ferramenta externa").

Lint custom (regex) roda em pré-commit + CI, igual ao já adotado no núcleo (`no-shell-true.test.ts`).

---

## 12. Checklist de Aprovação do BLUEPRINT

Para destravar `/dare-tasks`:

- [ ] Diagrama (1.2) reflete a divisão CLI-determinístico ↔ skill-LLM e o gate como **aspecto** do núcleo
- [ ] Decisões A-1…A-12 (1.3) alinhadas ao DESIGN e à regra de ouro (LLM nas skills; CLI orquestra/lê veredito)
- [ ] **Dafny como default** (A-4) justificado pelos números (82% vs. Verus 44% vs. Lean 27%, Vericoding)
- [ ] Opt-in **estrito em dois níveis** (config `formal.enabled` + marcação) e degradação graciosa (exit 5 só em módulo marcado) aceitos
- [ ] `FormalGateConfig`/`FormalVerdict`/`CriticalModuleMarker` (4.1) encaixam em `VerificationConfig`/`AspectResult` sem mudar a forma do núcleo
- [ ] Sub-gate anti-bypass (RF-06) e veredito só do verificador externo (RS-06) são suficientes contra falso-provado
- [ ] Fluxo **NL-opaco** (humano não vê o formal — Dafny-as-IL) e loop PREFACE como **heurística sem RL** aceitos
- [ ] Fase 6 RELEASE lista explicitamente CHANGELOG [3.8.0], bump raiz+CLI, **atualização do banner+seções+roadmap do README** e README do CLI

> **Próximo passo:** após aprovação — e com a `verification-core` (v3.3.0) já estabelecida — rodar `/dare-tasks` para gerar `DARE/TASKS-formal-verification-gate.md`, `DARE/dare-dag-formal-verification-gate.yaml` e os `DARE/EXECUTION/task-*.md`. Fundamentação por paper em `pesquisas-estrategicas/papers-dare/cards/` (`idea-10`: Vericoding 2509.22908, CLEVER 2505.13938, PREFACE 2509.06239, Dafny-as-IL 2501.06283).
