# Feature Design: `dare serve` — núcleo unificado de comandos + protocolo de fio

> Gerado seguindo o Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de `/dare-blueprint`. License: MIT.
>
> **Base de evidências (código real, pós-v3.15):**
> - **Doutrina uniforme (todos os 8 comandos):** a action roda
>   `heurística determinística → escreve artifacts → maybeRunAiEnrichment(facts)`.
>   Visto em `commands/reverse.ts:81-188`, `commands/dna.ts:40-81`, `commands/review.ts:77-90`.
> - **As heurísticas já são funções puras** em `utils/` (`detectProject`, `detectModules`,
>   `buildFacts`, `extractDataModelDetailed`, `detectDnaDetailed`, …) e o enrichment puro é
>   `runCommandEnrichment` (`ai/pipeline.ts:42`).
> - **O que NÃO é reusável:** a *orquestração* (heurística → artifacts → enrich) vive **dentro da
>   action do Commander**, soldada a `ora`/`chalk`/`console.log`/`process.exit`. Hoje **não existe**
>   uma função `runReverse()`/`runDna()`/… chamável fora da CLI.
> - Já existe meio servidor: `mcp-server/server.ts` (Express + auth/CORS/helmet/path-safety via
>   `http/app.ts`), só com leitura de contexto.
>
> **Decisão central:** o serve **não** pode expor só o enrichment (isso pularia a heurística e quebraria
> a doutrina). Ele precisa rodar o **comando inteiro**. Logo, a feature **extrai o núcleo de cada
> comando** para uma função pura e faz **as três portas (terminal, chat, serve)** chamarem a mesma função.
>
> **Branch:** `feat/v3.16-serve-protocol` · **Target:** v3.16.0 · **Repo base:** v3.15.0

## Contexto no Projeto Existente

A v3.12 estabeleceu a doutrina: heurística determinística sempre roda; IA enriquece depois;
**terminal `dare <cmd> --ai` ≡ chat `/dare-<cmd>`**. Mas a *implementação* dessa doutrina está
duplicável: cada action de comando reimplementa a sequência, e nenhuma porta nova consegue reusá-la
sem copiar. Para abrir uma terceira porta (`dare serve`) **sem duplicar comando**, o núcleo de cada
comando precisa virar biblioteca.

Esta é, na prática, a extração "core importável" que ficou pendente — ela reaparece aqui porque é o
pré-requisito real do serve.

### Regra anti-duplicação (a espinha da feature)

```
commands/<cmd>.ts (CLI)  ─┐
serve/routes/commands.ts ─┼─►  core/commands/<cmd>.ts  →  run<Cmd>(opts): CommandRunResult
/dare-<cmd> (skill)      ─┘        (heurística + artifacts + enrich)  — SEM console/ora/process.exit
```

- A action da CLI vira **casca fina**: chama `run<Cmd>()`, depois imprime/`process.exit`.
- A rota do serve chama `run<Cmd>()`, depois faz `res.json`.
- **`facts` é sempre computado server-side** (`cwd = projectRoot`); o body só carrega flags e o input
  do comando (a descrição no `design`, o `taskId` no `review`). Nunca `facts` nem `cwd` pelo body.

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | **Zero comando duplicado** | `maybeRunAiEnrichment`/heurísticas chamadas só em `core/commands/**` | grep gate |
| O-02 | Núcleo unificado | 8 funções `run<Cmd>` puras (sem `console`/`process.exit`/`ora`) | 8/8 |
| O-03 | Heurística sempre roda no serve | `run<Cmd>` executa heurística antes do enrich | teste por comando |
| O-04 | CLI sem regressão | actions viram cascas; suíte CLI atual verde | testes verdes |
| O-05 | Protocolo versionado | `GET /protocol` cobre 8 comandos + `PROTOCOL_VERSION` | manifest |
| O-06 | Request não trava | enrichment longo ⇒ teto de timeout ⇒ **504** (não pendura) | teste timeout |
| O-07 | `/providers` sem efeito colateral | default não spawna; `?probe=true` opt-in + cache | teste |
| O-08 | MCP sem regressão | rotas de contexto idênticas (router extraído) | testes MCP verdes |

## Stakeholders

| Papel | Interesse |
|---|---|
| Autor / Dewtech | Núcleo vira biblioteca; base para extensão VS Code (v4.0); fim da duplicação CLI/serve |
| Frontend futuro | Uma função por comando, um contrato; heurística garantida |
| Usuário CLI/chat | Comportamento idêntico; actions só ficam mais finas |
| CI / segurança | `cwd` confinado; superfície auditável; sem subprocess surpresa |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **`core/commands/types.ts`** — `CommandRunOptions`, `CommandRunResult`, registry `COMMAND_RUNNERS` | MUST | tipos + registry dos 8 comandos |
| RF-02 | **Extrair `run<Cmd>` dos 8 comandos** para `core/commands/<cmd>.ts` (heurística+artifacts+enrich) | MUST | 8 funções puras; sem `console`/`process.exit`/`ora` |
| RF-03 | **CLI actions viram cascas** — chamam `run<Cmd>`, depois imprimem/saem | MUST | nenhuma lógica de heurística/enrich na action |
| RF-04 | **Heurística sempre roda** dentro de `run<Cmd>`; `ai` (enrich) é opcional | MUST | resultado tem `facts` mesmo com `ai:false` |
| RF-05 | **`serve/protocol.ts`** — `PROTOCOL_VERSION` + `buildManifest()` derivado de `PARITY_CONTRACTS` | MUST | manifest cobre 8, sem hardcode |
| RF-06 | **`POST /commands/:command`** — body `{ai?, provider?, deep?, input?}` → `run<Cmd>({cwd:projectRoot,…})` | MUST | 8 comandos; resposta = `CommandRunResult` |
| RF-07 | **Teto de timeout no serve** — `AbortController`; estouro ⇒ **504** | MUST | request longo retorna 504, não pendura |
| RF-08 | **`GET /providers`** — default só `capabilities` (sem spawn); `?probe=true` ⇒ `probeAllProviders` com cache TTL | MUST | GET default não spawna subprocesso |
| RF-09 | **`GET /protocol`** — manifest versionado (ops + schemas + input requerido por comando) | MUST | valida contra `buildManifest()` |
| RF-10 | **Extrair router de contexto** do MCP p/ `serve/routes/context.ts` (compartilhado) | MUST | testes MCP verdes |
| RF-11 | **Comando `dare serve`** + `createServeApp` (context + commands) reusando `createApp` | MUST | `dare serve --help`; sobe Express |
| RF-12 | **`/execute` ⇒ 405** reservado (v3.17) | SHOULD | rota responde 405 |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Refactor sem mudança de comportamento na CLI** | saída/efeitos idênticos |
| RNF-02 | **Reuso total de segurança** — `createApp` (auth/CORS/helmet/path-safety) | zero novo middleware |
| RNF-03 | **Transporte-agnóstico** — `run<Cmd>` independe de HTTP; HTTP é a 1ª binding | stdio/JSON-RPC viável depois |
| RNF-04 | **CI verde** — build, test, lint | sem regressão |
| RNF-05 | **Boot consistente** — reusa `DARE_*` (`mcp-server/boot-config.ts`) | mesmas envs |

## Requisitos de Segurança

| ID | Requisito | Nota |
|---|---|---|
| RS-01 | **Auth idêntico ao MCP** — loopback+token | herda `http/app.ts` |
| RS-02 | **`cwd` = `projectRoot` do server, nunca do body** | confina escrita de artifacts |
| RS-03 | **`input` é dado, não comando** — nunca interpolar em shell; provider via `safeSpawn` | sem injection |
| RS-04 | **`provider` explícito no serve** — não herdar default silencioso que spawna IA gravando no workspace | opt-in consciente |
| RS-05 | **Timeout encerra o subprocesso** — `AbortSignal` propagado até `safeSpawn` | sem processo órfão |
| RS-06 | **Sem exposição LAN por padrão** — `shouldWarnLanExposure` | igual MCP |

## Análise de Impacto

### Adicionados (novo)

```
src/core/commands/
  types.ts               # CommandRunOptions, CommandRunResult, COMMAND_RUNNERS (registry)
  reverse.ts dna.ts      # run<Cmd>() — núcleo extraído (heurística + artifacts + enrich)
  patterns.ts migrate.ts
  design.ts blueprint.ts
  review.ts refine.ts
src/serve/
  protocol.ts            # PROTOCOL_VERSION + buildManifest()
  index.ts               # createServeApp(projectRoot, opts)
  bin/serve.ts           # boot (reusa boot-config)
  routes/context.ts      # EXTRAÍDO do mcp-server/server.ts
  routes/commands.ts     # /protocol, /providers, POST /commands/:command (timeout→504)
src/commands/serve.ts    # registro Commander
```

### Modificados (cascas / wiring)

| Arquivo / área | Mudança |
|---|---|
| `src/commands/{reverse,dna,migrate,design,patterns,blueprint,review,refine}.ts` | action vira casca: chama `run<Cmd>`, imprime/`process.exit` |
| `src/ai/pipeline.ts` | `maybeRunAiEnrichment` aposentado; cascas usam saída de `run<Cmd>` + impressão; cores usam `runCommandEnrichment` |
| `src/mcp-server/server.ts` | monta `serve/routes/context.ts` (mesmo comportamento) |
| `src/bin/dare.ts` | `addCommand(serveCommand)` |
| `CHANGELOG.md`/`ROADMAP.md`/`docs-site/protocol.md` | release v3.16.0 |

### NÃO tocados (invariante)

```
src/ai/parity.ts ai/types.ts ai/schemas.ts   # contrato/schemas — read-only
src/utils/* (heurísticas)                     # já puras — reusadas, não alteradas
src/agent/*                                    # execução de agente — fora do escopo
```

### Banco de dados

N/A.

## Stack Técnica

| Camada | Decisão |
|---|---|
| Núcleo | `core/commands/<cmd>.ts` `run<Cmd>()` — pura, reusável pelas 3 portas |
| Enrichment | `runCommandEnrichment` (`ai/pipeline.ts`) — **nunca** `maybeRunAiEnrichment` |
| Heurística | funções puras já existentes em `utils/` |
| Transporte | Express + `createApp` (`http/app.ts`) |
| Contrato | `PARITY_CONTRACTS` + `jsonSchemaForCommand` |
| Providers | `probeAllProviders` (opt-in + cache) + `capabilitiesForProvider` (default) |
| Timeout | `AbortController` no serve → `AgentRequest.signal`/`timeoutSeconds` → `safeSpawn` |

## Restrições

- **Zero comando duplicado.** Lógica de cada comando existe em **um** lugar (`core/commands`).
- **Heurística sempre roda**; `ai` só acrescenta o enrich.
- **`cwd` = `projectRoot`**, `provider` explícito no serve.
- **Caminho serve é máquina-primeiro:** sem `ora`/`chalk`/`process.exit` em `core/commands` e `serve`.
- **Protocolo versionado** desde o dia 1.

## Fora de Escopo (v3.16)

| Item | Onde |
|---|---|
| `POST /execute` que aplica patch no worktree | v3.17 (responde 405) |
| Modelo de job assíncrono / SSE de progresso | v3.17 (v3.16 usa timeout síncrono + 504) |
| Transporte stdio/JSON-RPC | futuro (design já agnóstico) |
| Extensão VS Code (consumidor gráfico) | v4.0 |
| Go/Rust rewrite | adiado (Fase 5) |

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Extração muda comportamento da CLI | Média | Alto | RNF-01: cascas finas; suíte CLI atual é o gate de paridade |
| Núcleo ainda vaza `console`/`process.exit` | Média | Médio | grep gate em `core/commands` + `serve` (O-01/O-02) |
| Request de enrich pendura conexão | Média | Médio | RF-07: `AbortController` + 504; provider 20 min vira teto serve curto |
| `GET /providers` spawna 4 subprocessos | Média | Baixo | RF-08: default sem probe; `?probe=true` + cache |
| Lógica duplicada reaparece em PR futuro | Média | Médio | gate anti-duplicação (grep) no CI |
| Extração do router de contexto quebra MCP | Média | Médio | RF-10: testes MCP são o gate |

## Plano de Validação (gates)

```powershell
# Núcleo unificado — sem acoplamento de CLI
rg "ora\(|chalk\.|process\.exit" src/core/commands src/serve   # → 0

# Anti-duplicação — orquestração só no núcleo
rg "maybeRunAiEnrichment" src                                  # → 0 (aposentado)
rg "runCommandEnrichment|detectModules|detectDnaDetailed|extractDataModel" src/commands src/serve  # → 0

# Heurística sempre roda + paridade de manifest + segurança
pnpm --filter @dewtech/dare-cli test -- src/core/commands src/serve
# protocol-parity: manifest === SEMANTIC_COMMANDS
# security-cwd: artifact só sob projectRoot
# timeout: request longo ⇒ 504
# providers: GET default não spawna

# Não-regressão CLI + MCP
pnpm --filter @dewtech/dare-cli test
pnpm --filter @dewtech/dare-cli build
```

## Definition of Done

- [ ] 8 `run<Cmd>` puros em `core/commands`; CLI actions são cascas
- [ ] `rg "maybeRunAiEnrichment" src` → 0; heurística/enrich só em `core/commands`
- [ ] `dare serve` sobe; `GET /protocol` cobre 8; `POST /commands/:command` roda heurística+enrich
- [ ] Request longo ⇒ 504; `GET /providers` default sem spawn
- [ ] Router de contexto extraído; testes MCP verdes; suíte CLI verde
- [ ] ROADMAP + CHANGELOG `[3.16.0]` + doc-site + bump **antes** da tag
- [ ] `dare review` da feature sem achados

## Próximas Etapas

1. **Revisar e aprovar** este DESIGN
2. `/dare-blueprint` → `DARE/BLUEPRINT-Feature-dare-serve-protocol.md`
3. `/dare-tasks` → DAG bloco **16xx**
4. Executar na branch `feat/v3.16-serve-protocol`
5. Release: bump → tag `v3.16.0` → npm publish

## Decisões Travadas (proposta — confirmar na revisão)

| # | Decisão | Alternativa rejeitada |
|---|---|---|
| D-01 | **Extrair núcleo dos 8 comandos**; 3 portas chamam a mesma função | serve expõe só enrichment (pula heurística, quebra doutrina) |
| D-02 | `facts` computado server-side; body só flags + input | `facts` pelo body (cliente fino não os produz) |
| D-03 | `maybeRunAiEnrichment` aposentado; cores usam `runCommandEnrichment` | manter wrapper (acopla `console`/`exit` ao núcleo) |
| D-04 | Timeout síncrono + 504 em v3.16; job assíncrono em v3.17 | pendurar conexão até 20 min |
| D-05 | `/providers` default sem probe; `?probe=true` + cache | spawnar 4 subprocessos em todo GET |
| D-06 | `provider` explícito no serve | herdar default que spawna IA gravando no workspace |
| D-07 | Target **v3.16.0** (minor — aditivo + refactor interno sem breaking) | v4.0 (produto/extensão) |
| D-08 | `/execute` definido mas 405 | implementar já (acopla ao executor) |
