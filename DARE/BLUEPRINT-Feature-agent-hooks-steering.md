# Feature Blueprint: Agent Hooks + Steering Files

> Derivado de [DESIGN-Feature-agent-hooks-steering.md](DESIGN-Feature-agent-hooks-steering.md).
> Único entregável desta etapa: este BLUEPRINT. Tasks/DAG/specs de execução virão em `/dare-tasks`.
> Branch proposta: `feat/agent-hooks-steering` · Target release: **v3.6.0**
> (v3.3.0 verification-core, v3.4.0 security-hardening e v3.5.0 dual-graph já entregues —
> confirmado em `packages/cli/package.json:3` = `"version": "3.5.0"`) · License: MIT.
>
> **Base de evidências:** sem paper. Competidores **AWS Kiro** (*agent hooks* + *steering files*) e
> **Agent OS** (*standards*); tese de **context engineering just-in-time**. ID de ideia: **`idea-6`**.
>
> **Nota de divergência do DESIGN:** o DESIGN diz `Target: v3.3.0 / repo em v3.2.0`
> (`DESIGN-Feature-agent-hooks-steering.md:9-10`). Está **estale** — o repo já está em v3.5.0
> e as três releases intermediárias entregaram exatamente os blocos que esta feature reusa
> (path-safety, MCP hardening, grafo). Este Blueprint corrige o alvo para **v3.6.0**.
>
> **Pré-requisitos cruzados (NÃO reimplementar):**
> - `assertRelativeSafe` / `resolveSafePath` / `PathEscapeError` da security-hardening
>   (`packages/cli/src/utils/path-safety.ts:23,79,11`) — reusar para validar steering files e payloads.
> - MCP hardening v3.4.0: bind loopback + auth middleware + validação de input
>   (`packages/cli/src/mcp-server/server.ts:11,135`, `middleware/auth.ts`). A rota `/steering` herda tudo.
> - Padrão de **config Zod opt-in** já consolidado em `verification/config.ts` (`config.ts:33,174`) —
>   o bloco `hooks`/`steering` em `dare.config.json` segue o mesmo desenho (ausente ⇒ defaults inertes).
> - Extração de convenções: `utils/dna-detector.ts` → `DARE/PROJECT-DNA.md` + `DARE/dna-facts.json`
>   (`commands/dna.ts:47-48`). Steering **lê** isso; é proibido um segundo extrator (RF-08).
> - Telemetria de grafo: `dag-runner/graph-ingest.ts:38,54` (`addNode`/`addEdge`) — hooks reusam (RF-12).

---

## 0. Escopo TRAVADO da v3.6.0 (decisão do dono)

> Esta decisão substitui qualquer "A confirmar" das Integrações/Decisões abaixo e fecha o escopo da release.

**Hooks por evento (gatilho nativo):**
- **Claude Code** — hooks nativos em `settings.json` (`hooks.PostToolUse`/matcher) → `dare hooks run <event>`. **DENTRO** do escopo.
- **git `pre-commit`** — gancho universal (`templates/hooks/pre-commit-dare-validate`). **DENTRO** do escopo (vale para qualquer IDE/repo).
- **Cursor e Antigravity (hooks nativos por evento)** — **FORA do escopo da v3.6.0**. A API de evento nativo dessas IDEs **não está confirmada**; em vez de implementar contra um contrato instável, ficam **adiadas para uma release futura**. O **fallback** dessas IDEs é o `pre-commit` (universal) + execução manual `dare hooks run <event>`. Documentar como "futuro/adiado" nos adapters; **nenhuma task de hook nativo Cursor/Antigravity** entra neste DAG.

**Steering files:**
- Disponíveis nas **3 IDEs (Claude / Cursor / Antigravity)** via **MCP** — rota `GET /steering?file=<rel>` no `mcp-server/server.ts` (server já existe pós-v3.4.0). O steering é servido pelo canal MCP comum às três; **não depende** de gatilho de evento nativo. **DENTRO** do escopo.

**Consequência para o DAG:** as tasks cobrem hooks (Claude `settings.json` + `pre-commit`), steering (resolver + rota MCP nas 3 IDEs) e a documentação do adiamento dos hooks nativos Cursor/Antigravity. Não há task de gatilho nativo Cursor/Antigravity.

---

## 1. Visão Geral da Arquitetura

### 1.1 Princípio reitor

**O CLI é 100% determinístico** — ele *registra*, *valida*, *resolve precedência* e *despacha* hooks
e steering, mas **nunca chama LLM** (regra de ouro da casa, `DESIGN:134-137`, RF-10). O dispatcher
executa apenas **ações da allowlist** via `spawn(cmd, argv)` com `shell:false`. A camada semântica
(ex.: o "review" que raciocina sobre o diff) vive nas **skills das IDEs** — o CLI só emite o gatilho
`dare hooks run <event>` e registra o veredito. Steering é **resolução de precedência sobre arquivos
existentes**, não geração: o `PROJECT-DNA.md` já produzido por `dna-detector` é a base canônica (RF-08).

Três peças, uma cola:

| Camada | Responsabilidade | Fonte / determinismo |
|---|---|---|
| **Hooks** (`src/hooks/*`) | modelo declarativo por evento → dispatch de ação da allowlist | config Zod + `spawn` argv |
| **Steering** (`src/steering/*`) | descoberta + resolução de precedência de convenções por arquivo/glob | front-matter + `PROJECT-DNA.md` (reuso) |
| **Adapters por IDE** (templates) | traduzir mecanismo nativo da IDE → `dare hooks run <event>` | arquivos de template; sem código |

### 1.2 Diagrama

```mermaid
flowchart TB
    subgraph ide["Camada IDE (semântica / LLM)"]
        claude["Claude: settings.json<br/>hooks.PostToolUse matcher=Write"]
        cursor["Cursor: .cursor/rules/*.mdc<br/>(steering via MCP) — hook nativo: adiado (§0)"]
        antig["Antigravity: .agents/skills<br/>(steering via MCP) — hook nativo: adiado (§0)"]
        gith["git: .git/hooks/pre-commit"]
    end

    subgraph cli["CLI determinístico (sem LLM)"]
        cmd["commands/hooks.ts<br/>dare hooks list|run|validate"]
        steercmd["commands/steering.ts<br/>dare steering list|show"]
        cfg["hooks/config.ts<br/>Zod: HookConfig (opt-in)"]
        dispatch["hooks/dispatcher.ts<br/>allowlist + spawn shell:false"]
        allow["hooks/allowlist.ts<br/>conjunto fechado de ações"]
        resolver["steering/resolver.ts<br/>precedência determinística"]
        loader["steering/loader.ts<br/>front-matter + PROJECT-DNA.md"]
        cfg --> dispatch
        allow --> dispatch
        loader --> resolver
    end

    subgraph reuse["Reuso (NÃO reimplementar)"]
        dna["utils/dna-detector.ts<br/>→ DARE/PROJECT-DNA.md"]
        psafe["utils/path-safety.ts<br/>assertRelativeSafe"]
        graph["dag-runner/graph-ingest.ts<br/>addNode/addEdge (telemetria)"]
        rev["dare review (commands/review.ts)"]
    end

    subgraph mcp["MCP (mcp-server/server.ts) — bind 127.0.0.1 + auth"]
        steerroute["GET /steering?file=&lt;rel&gt;"]
        tools["/tools registry"]
    end

    claude -->|dare hooks run on-save| cmd
    gith -->|dare hooks run pre-commit| cmd
    cursor -.->|fallback pre-commit| gith
    antig -.->|fallback pre-commit| gith

    cmd --> dispatch
    dispatch -->|ação=dare review| rev
    dispatch -->|telemetria RF-12| graph
    dispatch -.->|ação semântica| ide
    loader --> dna
    resolver --> psafe
    steerroute --> resolver
    steercmd --> resolver
```

### 1.3 Decisões Arquiteturais

| # | Decisão | Alternativas rejeitadas | Justificativa |
|---|---|---|---|
| **A-1** | **Config de hooks/steering vive em `dare.config.json`** (chaves `hooks` e `steering`), validada por Zod, **opt-in** (ausente ⇒ inerte), espelhando `verification/config.ts:174` | Arquivo próprio `.dare/hooks.json`; YAML solto | RNF-03/O-05: retrocompat 100%; reusa loader já existente (`ralph-loop.ts:221` lê `dare.config.json`); um schema, um ponto de auditoria (RS-06). `.dare/hooks/*.yaml` e `.dare/steering/*.md` continuam como **fontes de definição** descobertas, mas a habilitação é no config versionado |
| **A-2** | **`HookEvent` é um enum FECHADO** (`on-save`, `on-file-create`, `on-task-complete`, `pre-commit`) | Eventos definidos pelo usuário | RF-02 + Fora de Escopo do DESIGN (`DESIGN:148`); rejeição na validação Zod (`z.enum`) |
| **A-3** | **Ação de hook = item de allowlist canônica** resolvido por `spawn(cmd, argv, { shell: false })`; payload NUNCA interpolado em string | `shell:true`; `exec` com template string; escape-hatch para shell arbitrário | **RISCO CRÍTICO** (`DESIGN:158`): repo malicioso. RS-01/RS-02. Mesma postura "sem `shell:true`" do verification-core |
| **A-4** | **Hooks de repo clonado são DESARMADOS por padrão** — exigem `hooks.trusted: true` explícito no config local **ou** flag `--trust` no comando; sem auto-exec em clone/open | Auto-executar config encontrada | RS-05 (OWASP A08). O CLI nunca dispara hook de config não confiada sem consentimento gravado no diff |
| **A-5** | **Steering base = `DARE/PROJECT-DNA.md` lido, nunca re-extraído** | Fork do `dna-detector`; novo extrator de convenções | RF-08 + Restrição do DESIGN (`DESIGN:138`). Loader **lê** o markdown/`dna-facts.json`; `dna-detector.ts` continua a única fonte |
| **A-6** | **Precedência de steering determinística e fixa:** PROJECT-DNA (base, prioridade efetiva 0) < steering global (`scope: project`) < steering por-glob; empate por `priority` numérico; empate final por ordem lexicográfica do path | Ordem por mtime; "último vence" | RF-07/O-07. Determinismo testável; mtime quebra em CI/clone |
| **A-7** | **Steering files validados com `assertRelativeSafe`**; front-matter por Zod; `.env*` jamais elegível como steering | Confiar no path do front-matter | RS-03/RS-04. Reuso de `path-safety.ts:23`; blocklist explícita de `.env*` |
| **A-8** | **Dispatch síncrono é só "fire": valida → spawn → registra exit-code/veredito.** Ação que precisa de LLM emite gatilho e **retorna**; a skill faz o raciocínio assíncrono | Bloquear a IDE esperando review LLM | RNF-01/O-06 (<300ms p95); RF-10 (LLM fora do CLI) |
| **A-9** | **Idempotência por guard de hash de estado** — `on-file-create` registra o nó uma vez; `on-task-complete` não re-revisa estado inalterado (hash do conjunto de arquivos tocados) | Re-disparar sempre | RNF-02; evita loop save→review→save (`DESIGN:162`) |
| **A-10** | **Nova rota MCP `GET /steering?file=<rel>`** servindo só o steering aplicável ao arquivo consultado | Servir todo o steering de uma vez | RF-09 + risco "estoura contexto" (`DESIGN:163`); herda auth/loopback de `server.ts:135` |
| **A-11** | **Contrato canônico de eventos no DARE + adapter fino por IDE**; onde a IDE não tem evento nativo, cai em `pre-commit`/manual | Implementar gatilho nativo em cada IDE | `DESIGN:128-130`. **ESCOPO TRAVADO (§0):** Claude (`settings.json`, `settings.example.json:22`) + git `pre-commit` = **dentro**; hooks nativos Cursor/Antigravity = **fora da v3.6.0** (adiado; fallback `pre-commit`). Steering nas 3 IDEs via MCP (§5.3) |
| **A-12** | **Telemetria de hook reusa `graph-ingest` (`addNode`/`addEdge`)** — sem novo backend | Tabela/log próprio | RF-12; reuso de `graph-ingest.ts:38,54`; backend JSON seguro (evitar Neo4j) |

---

## 2. Stack Técnica (CLI)

| Camada | Tecnologia | Versão / Nota |
|---|---|---|
| CLI / dispatcher | TypeScript + Node | `>=18` (`package.json:94`) — sem novo runtime |
| Config + validação | `dare.config.json` + **Zod** | `zod@^3.23.8` já é dependência (`package.json:49`); reuso do padrão `verification/config.ts` |
| Execução de ação | `node:child_process.spawn(cmd, argv, { shell:false })` | RS-01/RS-02; `execSync` só existe hoje em `dna-detector.ts:18` (git log) — **não** reusar para ações |
| Descoberta de arquivos | `fs-extra` + `js-yaml`/`yaml` | já presentes (`package.json:38,40,48`); front-matter parse |
| Fonte de convenções | `utils/dna-detector.ts` → `PROJECT-DNA.md` / `dna-facts.json` | **reuso**, sem fork (RF-08) |
| Path safety | `utils/path-safety.ts` | `assertRelativeSafe`/`resolveSafePath` |
| Servidor de contexto | Express + MCP (`mcp-server/server.ts`) | estender com `GET /steering` (RF-09) |
| Grafo / telemetria | `dag-runner/graph-ingest.ts` (backend JSON) | reuso; sem Neo4j |
| Logs | `pino` | já usado (`server.ts:18`); zero `console.log` no dispatch (RNF-04) |
| Testes | Vitest + fixtures | `vitest@^1` (`package.json:74`) |

---

## 3. Estrutura de Pastas (pós-feature)

```
packages/cli/src/
├── hooks/                          # NEW — orquestração determinística
│   ├── types.ts                    # NEW — HookConfig, HookEvent, HookAction, HookResult
│   ├── config.ts                   # NEW — Zod schema (espelha verification/config.ts), opt-in
│   ├── allowlist.ts                # NEW — conjunto FECHADO de ações permitidas (RS-01)
│   ├── dispatcher.ts               # NEW — valida → spawn(shell:false) → telemetria
│   ├── idempotency.ts              # NEW — guard por hash de estado (RNF-02)
│   ├── telemetry.ts                # NEW — addNode/addEdge via graph-ingest (RF-12)
│   └── __tests__/
│       ├── config.test.ts          # NEW — schema + opt-in
│       ├── allowlist.test.ts       # NEW — ação fora da allowlist rejeitada
│       ├── dispatcher.test.ts      # NEW — spawn argv, sem shell, idempotência
│       └── dispatcher.security.test.ts  # NEW — injeção / repo não confiável (RS-05)
├── steering/                       # NEW — convenções just-in-time
│   ├── types.ts                    # NEW — SteeringFile, SteeringFrontMatter, SteeringResolution
│   ├── loader.ts                   # NEW — descobre .dare/steering/*.md + lê PROJECT-DNA.md (reuso)
│   ├── resolver.ts                 # NEW — precedência determinística (RF-07/A-6)
│   └── __tests__/
│       ├── loader.test.ts          # NEW — descoberta + .env* bloqueado (RS-04)
│       ├── resolver.test.ts        # NEW — precedência + empate (O-07)
│       └── resolver.security.test.ts  # NEW — assertRelativeSafe (RS-03)
├── commands/
│   ├── hooks.ts                    # NEW — dare hooks list|run <event>|validate (RF-01/RF-11)
│   └── steering.ts                 # NEW — dare steering list|show (RF-06)
├── mcp-server/
│   └── server.ts                   # MODIFY — GET /steering?file=<rel> + entrada em /tools (RF-09)
├── utils/
│   └── path-safety.ts              # REUSE (sem mudança) — assertRelativeSafe
└── dag-runner/
    └── graph-ingest.ts             # REUSE — addNode/addEdge p/ telemetria de hook

packages/cli/templates/
├── hooks/
│   ├── pre-commit-dare-validate    # EXISTENTE (sh) — mapeado para evento pre-commit
│   └── dare.config.hooks.example.json   # NEW — bloco hooks+steering comentado
└── ide/
    ├── claude/.claude/settings.example.json   # MODIFY — matcher Write → dare hooks run on-save
    ├── cursor/...                  # MODIFY — adapter "A confirmar" + fallback pre-commit
    └── antigravity/...             # MODIFY — adapter "A confirmar" + fallback pre-commit

DARE/
└── PROJECT-DNA.md                  # REUSE — steering base (gerado por dare dna)
```

---

## 4. Modelo de Dados / Contratos TypeScript

### 4.1 `src/hooks/types.ts` (novo)

```ts
/** Conjunto FECHADO de eventos na v1 (A-2 / RF-02). Eventos fora disto são rejeitados. */
export type HookEvent =
  | 'on-save'
  | 'on-file-create'
  | 'on-task-complete'
  | 'pre-commit';

export const HOOK_EVENTS: readonly HookEvent[] = [
  'on-save',
  'on-file-create',
  'on-task-complete',
  'pre-commit',
] as const;

/** Ação resolvida — sempre um item da allowlist canônica (RS-01). Nunca string de shell. */
export interface HookAction {
  /** Chave da allowlist, ex. 'dare-review' | 'dare-validate' | 'lint' | 'graph-register'. */
  readonly action: AllowedActionKey;
  /** Args adicionais, validados; concatenados como argv, NUNCA interpolados em shell (RS-02). */
  readonly args?: readonly string[];
}

export interface HookConfig {
  /** Eventos → lista de ações. Ausente ⇒ zero hooks (RNF-03 / opt-in). */
  readonly on: Partial<Record<HookEvent, readonly HookAction[]>>;
  /**
   * Confiança explícita (RS-05). false (default) ⇒ hooks de config NÃO auto-executam;
   * `dare hooks run` falha com TRUST_REQUIRED até o usuário marcar trusted ou passar --trust.
   */
  readonly trusted: boolean;
}

/** Payload passado ao dispatcher por evento. Validado antes do spawn. */
export interface HookEventPayload {
  readonly event: HookEvent;
  /** Arquivo relativo (on-save/on-file-create); validado com assertRelativeSafe. */
  readonly file?: string;
  /** Task id (on-task-complete); valida contra /^task-[0-9a-z-]+$/. */
  readonly taskId?: string;
}

export interface HookResult {
  readonly event: HookEvent;
  readonly action: AllowedActionKey;
  readonly exitCode: number;          // exit-code do spawn (RF-11)
  readonly skipped: boolean;          // true se idempotência cortou (RNF-02)
  readonly verdict?: 'pass' | 'fail'; // só p/ ações que produzem veredito (RF-12)
  readonly durationMs: number;        // p95 < 300 do dispatch síncrono (O-06)
}
```

**Pré/pós-condições `HookConfig`:**
- **Pré:** bloco `hooks` ausente ⇒ `parseHookConfig` retorna `{ on: {}, trusted: false }` (inerte).
- **Pós:** toda chave de `on` ∈ `HOOK_EVENTS`; toda `action` ∈ allowlist; senão `HookConfigError`.

### 4.2 `src/hooks/allowlist.ts` (novo)

```ts
/** Chaves FECHADAS de ação (A-3 / RS-01 / RS-06). Editável só via diff versionado. */
export type AllowedActionKey =
  | 'dare-validate'      // → spawn('dare', ['validate', '--strict'])
  | 'dare-review'        // → spawn('dare', ['review', '<taskId>', '--strict', '--format', 'json'])
  | 'graph-register'     // → telemetria interna (RF-05/RF-12); NÃO spawna processo externo
  | 'lint'               // → comando de lint resolvido do dare.config.json (stack)
  | 'test';              // → comando de teste resolvido do dare.config.json (stack)

export interface ResolvedCommand {
  readonly cmd: string;            // binário (ex.: 'dare', 'npx')
  readonly argv: readonly string[]; // argumentos por elemento, nunca string única
}

/**
 * Resolve uma ação da allowlist para (cmd, argv). Único ponto que decide o que roda.
 * @throws ActionNotAllowedError se a chave não estiver na allowlist.
 */
export function resolveAction(
  action: AllowedActionKey,
  payload: HookEventPayload,
  stack: { lint?: string; test?: string },
): ResolvedCommand;
```

### 4.3 `src/steering/types.ts` (novo)

```ts
export type SteeringScope = 'project' | 'glob';

/** Front-matter do steering file (Zod-validado). `.env*` nunca é elegível (RS-04). */
export interface SteeringFrontMatter {
  readonly scope: SteeringScope;
  readonly glob?: string;            // obrigatório se scope === 'glob'; sanitizado (RS-03)
  readonly priority?: number;        // default 0; desempate (A-6)
  readonly title?: string;
}

export interface SteeringFile {
  readonly path: string;             // relativo, validado com assertRelativeSafe
  readonly frontMatter: SteeringFrontMatter;
  readonly body: string;             // markdown sem o front-matter
  /** true só para o bloco derivado de DARE/PROJECT-DNA.md (base canônica, RF-08). */
  readonly isBase: boolean;
}

export interface SteeringResolution {
  readonly file: string;             // arquivo consultado (relativo)
  /** Blocos ordenados do menos para o mais específico (A-6); o consumidor concatena em ordem. */
  readonly blocks: readonly SteeringFile[];
  readonly resolvedAt: string;       // ISO; determinismo de saída testado
}
```

**Pré/pós-condições `SteeringResolution`:**
- **Pré:** `file` passa em `assertRelativeSafe` (senão `PathEscapeError`).
- **Pós:** `blocks[0].isBase === true` quando existe `PROJECT-DNA.md`; ordem = base → global → glob mais específico → `priority` → path lexicográfico (A-6); aplicável só ao `file` (RF-09).

### 4.4 `src/steering/resolver.ts` (novo)

```ts
/** Carrega todos os steering files descobertos + a base PROJECT-DNA (reuso, RF-08). */
export function loadSteeringFiles(projectRoot: string): SteeringFile[];

/** Resolve o steering aplicável a um arquivo, por precedência determinística (RF-07/A-6). */
export function resolveSteeringForFile(
  files: readonly SteeringFile[],
  relFile: string,
): SteeringResolution;
```

**Algoritmo `resolveSteeringForFile` (determinístico, sem LLM):**
1. `assertRelativeSafe(relFile)` — `..`/absoluto ⇒ `PathEscapeError`.
2. Selecionar: a base (`isBase`), todos `scope: project`, e todos `scope: glob` cujo `glob` casa `relFile`.
3. Ordenar: base (0) < project < glob; dentro do mesmo bucket, `priority` asc; empate ⇒ `path` lexicográfico.
4. Retornar `SteeringResolution` com `blocks` nessa ordem.

---

## 5. Contratos de API

### 5.1 CLI — `dare hooks` (RF-01 / RF-11)

| Subcomando | Args / Flags | Comportamento | Exit |
|---|---|---|---|
| `dare hooks list` | `--json` | Enumera hooks declarados em `dare.config.json#hooks.on`; arquivo/bloco ausente ⇒ lista vazia (opt-in) | `0` |
| `dare hooks run <event>` | `--file <rel>`, `--task <id>`, `--trust`, `--json` | Valida payload → resolve ações do evento → dispatch; respeita `trusted` (RS-05) | `0` ok / `1` ação falhou / `2` config inválida |
| `dare hooks validate` | `--json` | Valida schema + allowlist; reporta ação fora da allowlist com mensagem acionável | `0` válido / `1` inválido |

**`<event>` aceito:** apenas `HOOK_EVENTS`. Valor fora da lista ⇒ exit `2`,
`Error: unknown hook event '<event>'. Allowed: on-save, on-file-create, on-task-complete, pre-commit`.

**Trust gate (RS-05):** se `hooks.trusted !== true` e sem `--trust` ⇒ exit `2`,
`Error: hooks are untrusted for this project. Review dare.config.json#hooks and re-run with --trust or set hooks.trusted: true`.

### 5.2 CLI — `dare steering` (RF-06)

| Subcomando | Args / Flags | Comportamento | Exit |
|---|---|---|---|
| `dare steering list` | `--json` | Lista steering files descobertos (incluindo base PROJECT-DNA), `scope`/`glob` e ordem de precedência resolvida | `0` |
| `dare steering show <file>` | `--json` | Resolve o steering aplicável a `<file>` (relativo, validado) e imprime os blocos em ordem | `0` ok / `1` path inválido |

**Path inválido:** `Error: path must be relative and stay within the project` (alinhado a `path-safety.ts:5`).

### 5.3 MCP — `GET /steering` (RF-09 / A-10)

Registrar em `mcp-server/server.ts` (herda auth + loopback de `server.ts:135`):

**Request:** `GET /steering?file=<rel>`

**Response 200:**
```json
{
  "success": true,
  "file": "src/auth/login.ts",
  "blocks": [
    { "source": "DARE/PROJECT-DNA.md", "scope": "project", "priority": 0, "isBase": true, "body": "..." },
    { "source": ".dare/steering/auth.md", "scope": "glob", "glob": "src/auth/**", "priority": 10, "isBase": false, "body": "..." }
  ]
}
```

**Erros enumerados:**
- `400` `{ "error": "file is required" }` — query param ausente/vazio.
- `400` `{ "error": "file too long" }` — `> 200` chars (espelha `server.ts:388`).
- `403` `{ "error": "Forbidden" }` — `PathEscapeError` (via `runSafe`/`sendPathEscape`, `server.ts:80,114`).

Adicionar `{ name: 'get_steering', description: 'Get resolved steering for a file' }` ao array `/tools` (`server.ts:161`).

### 5.4 Função pública — `dispatcher.ts` (núcleo)

```ts
/**
 * Despacha as ações de um evento. Determinístico; sem LLM (RF-10).
 * @throws ActionNotAllowedError | TrustRequiredError | PathEscapeError
 * @postcondition cada ação roda via spawn(cmd, argv, { shell:false }); nunca interpola payload.
 */
export async function dispatchHook(
  config: HookConfig,
  payload: HookEventPayload,
  ctx: { projectRoot: string; trustOverride?: boolean },
): Promise<HookResult[]>;
```

**Pré-condições:** `config.trusted === true || ctx.trustOverride === true` (senão `TrustRequiredError`);
`payload.event ∈ HOOK_EVENTS`; `payload.file` (se houver) passa `assertRelativeSafe`.
**Pós-condições:** retorna um `HookResult` por ação; ação idempotente cortada ⇒ `skipped:true` (RNF-02);
disparo registrado no grafo (`hook --triggered_by--> event`, `hook --produced--> verdict`, RF-12);
log estruturado pino por disparo (RNF-04). Sem efeito colateral se `config.on[event]` vazio.

**Strings de erro exatas:**
- `ActionNotAllowedError`: `Hook action '<key>' is not in the allowlist`
- `TrustRequiredError`: `hooks are untrusted for this project` (ver §5.1)
- `HookConfigError`: `Invalid hooks config: <path>: <message>` (espelha `VerificationConfigError`, `config.ts:131`)

---

## 6. Plano de Execução (Fases)

### Fase 1 — Foundation: tipos + config + segurança

**Critério DONE (verificável):**
- `hooks/types.ts` + `steering/types.ts` compilam; `HookEvent` é `z.enum` fechado.
- `hooks/config.ts` parseia bloco ausente ⇒ `{ on:{}, trusted:false }` (test opt-in); bloco inválido ⇒ `HookConfigError` com path/mensagem.
- `hooks/allowlist.ts` + `resolveAction`: ação fora da allowlist ⇒ `ActionNotAllowedError` (test).
- `assertRelativeSafe` aplicado em todo path de entrada (config, payload, steering).

### Fase 2 — Steering: loader + resolver (RF-06/RF-07/RF-08)

**Critério DONE:**
- `loader.ts` descobre `.dare/steering/*.md` + lê `DARE/PROJECT-DNA.md` como base (`isBase:true`); `.env*` nunca elegível (test RS-04).
- `resolver.ts`: precedência base < project < glob < priority < path; coberta por teste de empate (O-07).
- `dare steering list|show` com saída determinística (`resolvedAt` à parte do snapshot).

### Fase 3 — Hooks: dispatcher + comandos (RF-01/RF-03/RF-11)

**Critério DONE:**
- `dispatcher.ts`: `spawn(cmd, argv, {shell:false})`; zero interpolação de payload (grep no test de segurança).
- `dare hooks list|run|validate` com exit-codes da §5.1; trust gate ativo (RS-05).
- `on-task-complete` → `dare review` da área tocada (RF-04); `on-file-create` → `graph-register` (RF-05).
- Idempotência: re-disparar mesmo estado ⇒ `skipped:true` (RNF-02).

### Fase 4 — MCP + telemetria + adapters IDE (RF-09/RF-12/A-11)

**Critério DONE:**
- `GET /steering?file=` registrado e em `/tools`; auth/loopback herdados; erros da §5.3.
- Telemetria via `graph-ingest` (`hook --triggered_by--> event`); `dare graph` mostra arestas (RF-12).
- `claude/.claude/settings.example.json` matcher `Write` → `dare hooks run on-save --file ...`.
- Cursor/Antigravity: hooks nativos por evento **adiados (fora da v3.6.0, §0)** — adapter documenta o adiamento e aponta o **fallback `pre-commit`** (provado); steering nessas IDEs vem pela rota MCP `GET /steering`.

### Fase N-1 — Auditoria de segurança / deps

**Critério DONE:**
- `dispatcher.security.test.ts`: payload malicioso (`; rm -rf`, `$(...)`, `../`) não escapa; sem `shell:true` (grep).
- Repo não confiável: hooks não auto-executam sem `trusted`/`--trust` (test RS-05).
- `pnpm audit --prod` sem HIGH/CRITICAL novos; `dare review` sem achados HIGH.
- Cobertura do núcleo (dispatcher + resolver) ≥ 80% (RNF-05).

---

## 7. Validation Gates por Stack

| Stack | Build | Test | Lint | Extra |
|---|---|---|---|---|
| CLI (TS/Node) | `npm run build` (`package.json:24`) | `vitest run` (`package.json:26`) | `eslint src` (`package.json:27`) | `prettier --write src` |
| MCP route | supertest (`devDeps`, `package.json:73`) sobre `GET /steering` | contrato 200/400/403 | — | auth/loopback regress |
| Segurança | — | `dispatcher.security.test.ts` + `resolver.security.test.ts` | grep: zero `shell:true`, zero concat de payload | `pnpm audit --prod` |
| Portabilidade | — | suíte de fixture verde Windows (CRLF) + POSIX (RNF-06) | — | sem dependência de shell POSIX no dispatch |

---

## 8. Controles de Segurança — Rastreabilidade (RS-01…RS-06)

| RS | Implementação | Teste |
|---|---|---|
| **RS-01** Sem comando arbitrário | `resolveAction` só aceita `AllowedActionKey`; allowlist fechada (`hooks/allowlist.ts`) | `allowlist.test.ts`: ação fora ⇒ `ActionNotAllowedError` |
| **RS-02** Sem `shell:true` | `spawn(cmd, argv, { shell:false })`; payload em argv, nunca string | `dispatcher.security.test.ts` + grep `shell:\s*true` = 0 |
| **RS-03** Steering validado | `assertRelativeSafe` no path + `glob` sanitizado; front-matter Zod | `resolver.security.test.ts`: `../`/absoluto ⇒ `PathEscapeError` |
| **RS-04** Sem segredos | `.env*` blocklisted no loader; logs não capturam tokens | `loader.test.ts`: `.env` ignorado como steering |
| **RS-05** Repo clonado desarmado | `trusted:false` default; `dispatchHook` exige trust (A-4) | `dispatcher.security.test.ts`: sem trust ⇒ `TrustRequiredError` |
| **RS-06** Allowlist local/auditável | allowlist em código versionado; config no `dare.config.json` (diff) | revisão estática + `dare hooks validate` |

> **RISCO CRÍTICO mapeado (`DESIGN:158`):** hook executando código de repo malicioso ao abrir/clonar.
> Defesa em profundidade: (1) **allowlist fechada** (RS-01) — nenhuma ação arbitrária resolve;
> (2) **`shell:false` + argv** (RS-02) — sem injeção via payload; (3) **trust gate desarmado por padrão**
> (RS-05/A-4) — config de terceiros não auto-executa. As três camadas são independentes e testadas.

---

## 9. Estratégia de Testes

| Tipo | Alvo | Arquivo / verificação |
|---|---|---|
| Unit | parse de config opt-in + inválido | `hooks/__tests__/config.test.ts` |
| Unit | allowlist (dentro/fora) | `hooks/__tests__/allowlist.test.ts` |
| Unit | precedência de steering + empate (O-07) | `steering/__tests__/resolver.test.ts` |
| Unit | descoberta + `.env*` bloqueado (RS-04) | `steering/__tests__/loader.test.ts` |
| Integração | `dare hooks run on-task-complete` → `dare review` (RF-04) | `hooks/__tests__/dispatcher.test.ts` |
| Integração | idempotência (RNF-02) — re-disparo ⇒ `skipped` | `dispatcher.test.ts` |
| Integração | `GET /steering` 200/400/403 (supertest) | `mcp-server/__tests__/mcp-steering.test.ts` |
| Segurança | injeção de payload, `shell:false`, trust gate | `dispatcher.security.test.ts`, `resolver.security.test.ts` |
| Portabilidade | fixture verde Windows (CRLF) + POSIX (RNF-06) | matriz CI |

**Metas de aceite (O-01…O-07):** O-01 ≥4 eventos com payload+exemplo; O-02 fixture −30% violações com steering;
O-03 ≥95% tasks DONE elegíveis revisadas; O-04 1 fonte canônica (zero fork de `dna-detector`);
O-05 ausência de config = comportamento v3.5.0; O-06 dispatch síncrono p95 <300ms; O-07 precedência testada.

---

## 10. Estratégia de Deploy

- **Biblioteca npm** `@dewtech/dare-cli` (`package.json:2`); bump `3.5.0 → 3.6.0` (minor: novos comandos/rotas, retrocompat).
- **Publish por tag** `v3.6.0` (mesmo fluxo do dual-graph); **provenance** via `npm publish --provenance` no CI.
- **CHANGELOG `[3.6.0]`** (mesmo formato de `CHANGELOG.md:12`): Agent Hooks (eventos + allowlist + dispatcher),
  Steering files (reuso PROJECT-DNA + precedência), rota MCP `/steering`, adapters por IDE.
- **Migração:** `seedHooksDefaultsIfAbsent` (espelha `seedVerificationDefaultsIfAbsent`, `config.ts:166`) insere
  bloco `hooks` inerte (`trusted:false`) em `dare init`/upgrade; projetos existentes seguem idênticos (O-05).

---

## 11. PADRÕES PROIBIDOS (ANTI-STUB)

- `spawn`/`exec` com `shell: true` em qualquer ponto do dispatcher.
- Interpolar `payload.file`/`payload.taskId` em string de comando (sempre argv).
- Segundo extrator de convenções (qualquer leitura/parse que duplique `dna-detector.ts`) — RF-08.
- `HookEvent` como `string` livre ou enum aberto; aceitar evento fora de `HOOK_EVENTS`.
- Allowlist com escape-hatch (`'*'`, `'shell'`, `'custom'`) ou lida de fonte não versionada.
- Auto-executar hooks de config sem checar `trusted` (RS-05).
- Qualquer chamada a LLM/API externa no CLI no caminho de dispatch ou resolução de steering (RF-10).
- `dare steering show` que ignora a base PROJECT-DNA ou serve todo o steering em vez do aplicável ao `file`.
- Resolver de precedência baseado em mtime/ordem de leitura do FS (não determinístico).
- `console.log` no dispatch (usar `pino`, RNF-04).
- Idempotência hardcoded (`skipped:false` sempre) ou ausente.

---

## 12. Checklist de Aprovação

- [ ] Alvo corrigido para **v3.6.0** (DESIGN dizia v3.3.0/v3.2.0 — estale) aceito.
- [ ] `HookEvent` fechado (4 eventos) e rejeição de eventos fora da lista (A-2/RF-02).
- [ ] Allowlist fechada + `spawn shell:false` + trust gate cobrem o **risco crítico** (RS-01/02/05).
- [ ] Steering **reusa** `PROJECT-DNA.md`/`dna-detector` sem fork (RF-08/A-5).
- [ ] Precedência de steering determinística e testada (RF-07/A-6/O-07).
- [ ] Rota MCP `GET /steering` herda auth/loopback do hardening v3.4.0 (A-10).
- [ ] Opt-in: bloco ausente ⇒ comportamento idêntico a v3.5.0 (RNF-03/O-05).
- [ ] LLM fora do CLI: dispatch só emite gatilho; raciocínio na skill (RF-10/A-8).
- [x] **Escopo travado (§0):** hooks nativos Cursor/Antigravity **fora da v3.6.0** (adiado; fallback `pre-commit`); steering nas 3 IDEs via MCP. A-11 reflete a decisão.
- [ ] Telemetria de hook reusa `graph-ingest`, backend JSON (RF-12/A-12).

---

## Próximas Etapas

1. **Revisar e aprovar** este Blueprint (checklist §12 + §DESIGN).
2. Resolver as duas lacunas **"A confirmar"** (evento nativo Cursor/Antigravity) com dono.
3. Rodar `/dare-tasks` para gerar `TASKS-agent-hooks-steering.md`, DAG e `EXECUTION/task-*.md`.
4. Branch `feat/agent-hooks-steering` → implementação via `/dare-dag-run`.
