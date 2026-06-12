# Referência da CLI

Referência completa de **todos** os comandos do binário `dare`, extraída diretamente das definições `commander` (`packages/cli/src/bin/dare.ts`, `packages/cli/src/commands/*.ts` e `packages/cli/src/skills/`). A CLI não chama nenhum LLM: ela orquestra artefatos e o grafo de tarefas; o agente roda dentro do seu IDE.

!!! info "Opção global"
    `--no-banner` — suprime o banner ASCII. Disponível em qualquer comando. O banner só aparece em comandos elegíveis (`init`, `--version`/`-V`); demais comandos não o exibem.

!!! tip "Convenções das tabelas"
    Argumentos entre `<...>` são obrigatórios; entre `[...]` são opcionais. A coluna **Default** reflete o valor padrão definido no código (`.option(..., default)`). Flags `--no-*` são *booleanas negativas* do commander.

---

## `dare init`

Inicializa um novo projeto DARE. Modo **interativo** (prompts) ou **não-interativo** (via flags, para CI/scripts).

```bash
dare init my-app --stack go-gin --toolchain auto --non-interactive
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `[project-name]` | argumento | (pergunta) | Nome do projeto. |
| `--stack <id>` | string | — | Id do stack de backend (pula o prompt interativo). |
| `--mcp <language>` | string | — | Linguagem do servidor MCP: `node-ts` \| `python` \| `rust` \| `go`. |
| `--transport <mode>` | string | `stdio` | Transporte MCP: `stdio` \| `sse` \| `http`. |
| `--toolchain <mode>` | string | `auto` | Ferramentas de scaffold: `native` \| `docker` \| `auto`. |
| `--non-interactive` | boolean | `false` | Falha em vez de perguntar; exige `--stack` ou `--mcp`. |

## `dare bootstrap`

Roda o scaffold oficial do stack do projeto atual (lê `dare.config.json`) **sem** tocar nos artefatos DARE. Útil em projetos antigos ou onde o bootstrap foi pulado no `init`.

```bash
dare bootstrap --toolchain docker
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--force` | boolean | `false` | Roda mesmo com artefatos de framework presentes (pode sobrescrever arquivos). |
| `--toolchain <mode>` | string | (config) | Sobrescreve o modo de toolchain nesta execução: `auto` \| `native` \| `docker`. |

!!! warning "Conflitos"
    Sem `--force`, o comando se recusa a rodar se encontrar artefatos como `vendor/`, `composer.lock`, `node_modules`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.lock` ou `target/`.

## `dare discover`

Detecta um projeto existente e instala os arquivos da metodologia DARE.

```bash
dare discover --dir ./meu-projeto --check
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | dir atual | Diretório alvo. |
| `--check` | boolean | — | Só mostra o resultado da detecção, sem instalar. |

## `dare reverse`

Engenharia reversa de um codebase existente em um `IDEIA.md` (Fase 0) + specs de módulos (onboarding brownfield).

```bash
dare reverse --deep --modules auth,billing
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | dir atual | Diretório alvo. |
| `--check` | boolean | — | Só mostra módulos detectados, sem escrever artefatos. |
| `--modules <list>` | string | — | Limita a módulos específicos (ids/nomes separados por vírgula). |
| `--no-excalidraw` | boolean | (gera) | Pula a geração do canvas de arquitetura `.excalidraw` editável. |
| `--report` | boolean | — | Calcula o relatório de confiança + matriz code-spec a partir de specs já marcados. |
| `--deep` | boolean | — | Também extrai ERD + superfície de API (determinístico) e faz scaffold de domain-rules / state-machines / permissions / C4. |

## `dare dna`

Extrai as convenções de um codebase legado para `DARE/PROJECT-DNA.md` (ruleset de house-style brownfield).

```bash
dare dna --check
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | dir atual | Diretório alvo. |
| `--check` | boolean | — | Só mostra convenções detectadas, sem escrever artefatos. |

## `dare migrate`

Planeja uma migração segura de um projeto legado para um stack alvo, com cenários Gherkin de paridade (brownfield Fase 2).

```bash
dare migrate --to rust-axum --check
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | dir atual | Diretório alvo. |
| `--to <stack>` | string | — | Stack alvo (ex.: `go-gin`, `rust-axum`, `node-nestjs`, `python-fastapi`). |
| `--check` | boolean | — | Mostra source/target/módulos/gaps bloqueantes, sem escrever artefatos. |

## `dare design`

Gera um `DESIGN.md` a partir de uma descrição do projeto.

```bash
dare design "API de cobrança com webhooks Stripe"
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<description>` | argumento | — | Descrição do projeto (obrigatório). |
| `--interactive` | boolean | — | Emite questionário de planejamento determinístico a partir dos fatos de dna/patterns (sem LLM). |

## `dare blueprint`

Faz o scaffold de `BLUEPRINT.md`, `dare-dag.yaml`, `TASKS.md` e `EXECUTION/task-*.md` a partir do `DESIGN.md`.

```bash
dare blueprint DARE/DESIGN.md --force
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `[design-file]` | argumento | `DARE/DESIGN.md` | Caminho para o `DESIGN.md`. |
| `-f, --force` | boolean | `false` | Sobrescreve arquivos existentes. |

## `dare execute`

Orquestra a execução do DAG (o agente do IDE roda cada task). A ação padrão é `--status`.

```bash
dare execute --next
dare execute --complete task-001 --output "OK" --tokens 1200
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Caminho para o `dare-dag.yaml`. |
| `--next` | boolean | `false` | Imprime as próximas tasks executáveis (com prompts compostos). |
| `--status` | boolean | `false` | Renderiza o canvas e mostra resumo (ação padrão). |
| `--watch` | boolean | `false` | Streama prontidão das tasks (re-imprime a cada mudança de estado). Implica `--next`. |
| `--complete <id>` | string | — | Marca uma task como DONE (usar com `--output`). |
| `--fail <id>` | string | — | Marca uma task como FAILED (usar com `--reason`). |
| `--reset <id>` | string | — | Reseta uma task para PENDING. |
| `--output <text>` | string | — | Output capturado da task (com `--complete`). |
| `--reason <text>` | string | — | Motivo da falha (com `--fail`). |
| `--tokens <n>` | string | — | Tokens consumidos (com `--complete`). |
| `--duration <ms>` | string | — | Duração da task em ms (com `--complete`). |
| `--no-graph` | boolean | (ingere) | Pula a ingestão no knowledge-graph nesta chamada. |
| `--parallel-hint` | boolean | `false` | Com `--next`, marca como RUNNING toda task de mesmo rank. |
| `--verify` | boolean | `false` | Roda o core de verificação após o Ralph Loop passar. |
| `--no-verify` | boolean | (config) | Pula a verificação mesmo se habilitada em `dare.config.json`. |
| `--full-mutation` | boolean | `false` | Desabilita mutação incremental nesta conclusão. |
| `--verdict-json` | boolean | `false` | Emite o `LoopVerdict` como JSON no stdout. |
| `--best-of <n>` | string | — | Roda N candidatos de verificação (best-of-N). |
| `--policy <p>` | string | — | Sobrescreve a policy do loop (`decay`\|`fixed`). |
| `--prerank` | boolean | `false` | Habilita ordenação prerank sem execução (nunca autoriza DONE). |
| `--formal` | boolean | `false` | Habilita o gate de verificação formal nesta conclusão (herda `verification.formal.enabled`). |
| `--no-formal` | boolean | (config) | Pula a verificação formal mesmo se habilitada na config. |
| `--formal-backend <backend>` | string | (`formal.backend`) | Sobrescreve o backend formal (`dafny`\|`verus`\|`lean`). |
| `--agent` | boolean | `false` | Modo autônomo: o driver executa cada task do DAG (requer `--dry-run` ou SDK instalado). |
| `--budget-tokens <n>` | string | — | Teto de tokens para a sessão autônoma (soma todos os candidatos best-of-N). |
| `--require-approval <mode>` | string | `rank` | `rank`: pausa entre ranks; `none`: totalmente autônomo. |
| `--on-fail <action>` | string | `escalate` | `replan`\|`escalate`\|`stop` quando a decay policy esgota tentativas. |
| `--dry-run` | boolean | `false` | Usa `mockDriver` (sem rede/SDK). |

**Exit codes (modo `--agent`):** `0` sucesso/pausa preservando PENDING; `1` SDK ausente ou erro geral; `6` guard FAIL no pré-flight.

> **Opt-in / experimental.** O gate formal é desligado por padrão e exige opt-in em dois níveis: `verification.formal.enabled` na config **e** marcação por módulo (`@dare-formal` ou `verification.formal.modules`). Sem isso o comportamento é idêntico ao de antes.

## `dare guard`

Gate de segurança para artefatos (spec, steering, etc.) consumidos pelo executor autônomo.

```bash
dare guard DARE/EXECUTION/task-001.md
dare guard --staged [--strict] [--format json]
dare guard --all [--unicode strip|block] [--sign]
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `[path]` | argumento | — | Arquivo ou diretório a auditar. |
| `--staged` | boolean | `false` | Audita arquivos staged no git. |
| `--all` | boolean | `false` | Audita artefatos DARE conhecidos. |
| `--strict` | boolean | `false` | WARN também retorna exit 6 (legado; prefira `--fail-on`). |
| `--format <fmt>` | string | `human` | `human`, `json` ou `github` (annotations Actions). |
| `--comment` | boolean | `false` | Comentário idempotente no PR (`GITHUB_TOKEN` + contexto de PR). |
| `--fail-on <mode>` | string | `none` | Exit: `none` (sempre 0), `warn` (≠0 em WARN+), `error` (≠0 só em FAIL). |
| `--sign` | boolean | `false` | Assina path em `guard.trustedPaths` (`.minisig`). |
| `--unicode <mode>` | string | (config) | `strip` ou `block`. |

**CI:** `dare guard --all --format github --comment --fail-on none` emite annotations + atualiza comentário sem bloquear o PR.

## `dare dashboard`

Sobe um dashboard local de telemetria (read-only, loopback + token). Reusa o hardening do MCP server.

```bash
dare dashboard [--port <n>] [--no-open]
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--port <n>` | number | `4100` | Porta HTTP em `127.0.0.1`. |
| `--no-open` | boolean | `false` | Não abre o navegador automaticamente. |

**Rotas (read-only, atrás do auth):**

| Método | Rota | Resposta |
|--------|------|----------|
| GET | `/dashboard` | HTML estático (painéis DAG, gates, custo, best-of-N, guard/drift). |
| GET | `/api/telemetry` | JSON `TelemetrySnapshot` agregado do GraphRAG + `.dare/state.json`. |
| GET | `/dashboard/assets/*` | CSS/JS confinados a `templates/dashboard/` (path-safety). |

**Token:** `DARE_MCP_TOKEN` ou UUID gerado na subida (mesma política do MCP).

**Skill IDE:** `/dare-dashboard` (Claude, Cursor, Antigravity).

## `dare graph`

Inspeciona e visualiza o knowledge graph DARE. Possui subcomandos.

### `dare graph stats`

Mostra contagem de nós/arestas e breakdown por tipo. (Sem flags.)

```bash
dare graph stats
```

### `dare graph query <term>`

Busca nós cujo label/descrição contenham `<term>`.

```bash
dare graph query auth --type requirement --limit 5
dare graph query "login flow" --semantic
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<term>` | argumento | — | Termo de busca. |
| `-l, --limit <n>` | string | `10` | Número máximo de resultados. |
| `-t, --type <type>` | string | — | Restringe a um tipo de nó. |
| `--semantic` | boolean | `false` | Usa retrieval híbrido (RRF keyword+vetor+grafo) quando `graphrag.semantic.enabled` e runtime instalado; fallback keyword se ausente. |

> **Ativar busca semântica:** `npm i @xenova/transformers` (optional) + `"graphrag": { "semantic": { "enabled": true } }` em `dare.config.json`.

### `dare graph viz`

Exporta o grafo para um diagrama Mermaid ou DOT.

```bash
dare graph viz --format dot -o graph.dot
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `-f, --format <fmt>` | string | `mermaid` | Formato de saída: `mermaid` \| `dot`. |
| `-o, --output <file>` | string | stdout | Escreve em arquivo. |

### `dare graph owners <path>`

Lista tasks/requirements que possuem símbolos sob `<path>`.

```bash
dare graph owners src/auth --json --limit 30
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<path>` | argumento | — | Caminho a inspecionar. |
| `--json` | boolean | — | Emite JSON. |
| `--limit <n>` | string | `20` | Número máximo de owners. |

### `dare graph impact <path>`

Mostra tasks/requirements impactados por mudanças sob `<path>`.

```bash
dare graph impact src/billing --hops 2
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<path>` | argumento | — | Caminho de mudança. |
| `--json` | boolean | — | Emite JSON. |
| `--hops <n>` | string | `3` | Profundidade de travessia (máx 5). |

### `dare graph trace <req>`

Rastreia um requirement/task até símbolos de código.

```bash
dare graph trace REQ-001 --json
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<req>` | argumento | — | Requirement ou task. |
| `--json` | boolean | — | Emite JSON. |

### `dare graph locate <seed>`

Localiza símbolos/arquivos/tasks de código a partir de uma query semente.

```bash
dare graph locate "login flow" --type symbol --hops 2
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<seed>` | argumento | — | Query semente. |
| `--json` | boolean | — | Emite JSON. |
| `--hops <n>` | string | `3` | Saltos de travessia. |
| `--limit <n>` | string | `10` | Máximo de candidatos. |
| `--type <t>` | string (repetível) | `[]` | Filtra tipos de nó (pode repetir). |
| `--edge-type <e>` | string (repetível) | `[]` | Filtra tipos de aresta (pode repetir). |

### `dare graph drift`

Detecta desalinhamento entre requirements e código no grafo dual (determinístico, sem LLM).

```bash
dare graph drift
dare graph drift --strict --format json
dare graph drift --modules src/auth
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--strict` | boolean | `false` | Exit **7** quando contagens excedem limiares de `drift` em `dare.config.json`. |
| `--format <fmt>` | string | `human` | `human`, `json` ou `github` (annotations Actions). |
| `--comment` | boolean | `false` | Comentário idempotente no PR. |
| `--fail-on <mode>` | string | `none` | Exit: `none` \| `warn` \| `error`. |
| `--modules <list>` | string | — | Filtra por paths (validados com path-safety). |

**Veredito `drift-fail`:** `orphan-requirement` > `maxOrphanReqs` OU `orphan-code` > `maxOrphanCode` OU (`failOnStale` && `stale` > 0). Sem `--strict`, exit 0 mesmo com findings.

### `dare graph ingest`

Re-sincroniza o grafo a partir do `dare-dag.yaml` + estado atuais.

```bash
dare graph ingest --requirements-only
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Caminho para o `dare-dag.yaml`. |
| `--requirements-only` | boolean | `false` | Re-parseia só DESIGN/BLUEPRINT/TASKS, pula o DAG. |

## `dare dag`

Inspeciona e visualiza o DAG estático de tarefas (`dare-dag.yaml`). Possui o subcomando `viz`.

### `dare dag viz`

Renderiza o `dare-dag.yaml` como diagrama Mermaid, DOT ou Excalidraw, com cores por status.
Quando o DAG contém sub-DAGs (tasks com `__parentId` — inseridas por `REPLAN` ou
`dare refine --split --apply`), o viz **agrupa as filhas** sob o pai:

- **Mermaid** — `subgraph subdag_<pai> ["Sub-DAG: <pai>"]` com dependências preservadas.
- **DOT** — `subgraph cluster_<pai> { ... }`.
- **Excalidraw** — retângulo de agrupamento ao redor das sub-tasks.

DAGs flat (sem nesting) continuam agrupados por rank, como antes.

```bash
dare dag viz --format excalidraw -o DARE/dag-graph.excalidraw
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Caminho para o `dare-dag.yaml`. |
| `-f, --format <fmt>` | string | `mermaid` | Formato: `mermaid` \| `dot` \| `excalidraw`. |
| `-o, --output <file>` | string | stdout¹ | Escreve em arquivo. |

¹ Para `excalidraw`, o default é `DARE/dag-graph.excalidraw` quando `-o` é omitido.

## `dare validate`

Valida a integridade do `dare-dag.yaml` (apto para pre-commit hooks e CI).

```bash
dare validate --strict
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Caminho para o `dare-dag.yaml`. |
| `--strict` | boolean | `false` | Trata warnings como errors. |

## `dare info`

Mostra versão, paths e a integridade DARE do projeto atual. (Sem flags.)

```bash
dare info
```

## `dare update`

Atualiza o setup do projeto para a versão atual do DARE CLI.

```bash
dare update --dry-run
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--dry-run` | boolean | `false` | Mostra o que seria feito, sem escrever nada. |
| `-y, --yes` | boolean | `false` | Não pergunta nada — aplica tudo e mantém customizações. |
| `--force` | boolean | `false` | Sobrescreve até arquivos customizados (perigoso). |
| `--target <version>` | string | (CLI instalado) | Atualiza para uma versão específica. |

## `dare review`

Audita uma task em busca de stubs, mocks, TODOs e funções vazias.

```bash
dare review task-001 --strict --format json
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<task-id>` | argumento | — | ID da task (ex.: `task-001`) — busca `DARE/EXECUTION/<id>.md`. |
| `--strict` | boolean | `false` | Trata warnings como errors (CI-friendly). |
| `--errors-only` | boolean | `false` | Suprime warnings na saída humana. |
| `--files <files...>` | string[] | — | Lista explícita de arquivos a analisar (ignora spec/git). |
| `--from-agent <path>` | string | — | Caminho para JSON com `SemanticVerdict` produzido pelo agente IDE. |
| `--format <fmt>` | string | `human` | Saída: `human`, `json` ou `github` (annotations Actions). |
| `--comment` | boolean | `false` | Comentário idempotente no PR. |
| `--fail-on <mode>` | string | `none` | Exit: `none` \| `warn` \| `error`. |

## GitHub Action (`action.yml`)

Composite action na raiz do repositório DARE para rodar gates em PRs com annotations e comentário idempotente.

```yaml
permissions:
  pull-requests: write
  contents: read

steps:
  - uses: actions/checkout@<SHA>
  - uses: dewtech-technologies/dare-method@main
    with:
      gate: guard          # review | guard | drift | bench
      args: '--all'
      fail-on: none        # none | warn | error
      comment: 'true'
```

Template opcional: `packages/cli/templates/.github/workflows/dare-pr.yml` (gerado no scaffold).

## `dare refine`

Mede a complexidade de uma task e (opcionalmente) propõe quebra em sub-tasks.
Com `--split --apply`, injeta o sub-DAG no **DAG ativo** (modo manual do replan estrutural):
gera sub-tasks determinísticas, faz splice via `spliceSubDag`, persiste em `DARE/dare-dag.yaml`
e `.dare/state.json`. Respeita `verification.loop.maxDepth` (default `2`); excedeu → exit `1`
com `MaxDepthError`. Idempotente: re-aplicar sem mudanças não duplica sub-tasks.

```bash
dare refine task-003 --split --apply
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<task-id>` | argumento | — | ID da task (ex.: `task-001`). |
| `--split` | boolean | `false` | Emite uma proposta de quebra em sub-tasks. |
| `--apply` | boolean | `false` | Aplica o split no DAG ativo (requer `--split`): splice de sub-DAG + persistência. |
| `--strict` | boolean | `false` | Exit code 2 quando a complexidade for HIGH/CRITICAL (CI-friendly). |
| `--format <fmt>` | string | `human` | Saída: `human` \| `json`. |
| `--from-agent <path>` | string | — | JSON com `RefineVerdict` produzido pelo agente IDE. |

## `dare bench`

Roda fixtures de bench de verificação (gate determinístico de qualidade de patch).

```bash
dare bench --json --baseline baseline.json --fail-on-regression 5
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--suite <dir>` | string | (suite padrão) | Diretório com `suite.json`. |
| `--json` | boolean | `false` | Emite relatório JSON no stdout. |
| `--baseline <file>` | string | — | `BenchReport` JSON de baseline para comparação de regressão. |
| `--fail-on-regression <pp>` | string | `3` | Falha se a solve-rate cair mais que N pontos percentuais vs baseline. |
| `--filter <glob>` | string | — | Roda só fixtures que casam com o glob. |

## `dare hooks`

Gerencia e roda hooks de agente DARE (determinístico, sem LLM). Possui subcomandos.

### `dare hooks list`

Lista os hooks configurados em `dare.config.json`.

```bash
dare hooks list --json
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--json` | boolean | — | Emite JSON. |

### `dare hooks run <event>`

Roda os hooks de um evento.

```bash
dare hooks run on-save --file src/index.ts
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<event>` | argumento | — | Evento (ex.: `on-save`, `on-file-create`, `on-task-complete`). |
| `--file <path>` | string | — | Caminho relativo do arquivo (`on-save` / `on-file-create`). |
| `--task <taskId>` | string | — | Id da task (`on-task-complete`). |
| `--trust` | boolean | — | Sobrescreve `hooks.trusted` nesta execução. |
| `--json` | boolean | — | Emite resultados em JSON. |

### `dare hooks validate`

Valida o schema da config de hooks e o allowlist.

```bash
dare hooks validate --json
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--json` | boolean | — | Emite JSON. |

## `dare steering`

Inspeciona arquivos de steering resolvidos (determinístico, sem LLM). Possui subcomandos.

### `dare steering list`

Lista os arquivos de steering descobertos e sua ordem de precedência.

```bash
dare steering list --json
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--json` | boolean | — | Emite JSON. |

### `dare steering show <file>`

Resolve e imprime o steering aplicável a `<file>`, em ordem de precedência.

```bash
dare steering show src/auth/login.ts
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<file>` | argumento | — | Arquivo alvo. |
| `--json` | boolean | — | Emite JSON. |

## `dare patterns`

Descobre padrões recorrentes do codebase em `DARE/PATTERNS.md` (determinístico, sem LLM).

```bash
dare patterns --inject
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | dir atual | Diretório alvo. |
| `--check` | boolean | — | Só mostra padrões detectados, sem escrever artefatos. |
| `--modules <list>` | string | — | Limita a módulos específicos (ids/nomes separados por vírgula). |
| `--inject` | boolean | — | Confirma `PATTERNS.md` como base de steering (idempotente, preserva steering do usuário). |

## `dare skill`

Gerencia skills DARE deste projeto (add, remove, list, info, update, publish). Possui subcomandos.

### `dare skill list`

Lista skills disponíveis (registry) ou instaladas no projeto.

```bash
dare skill list --installed
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--installed` | boolean | `false` | Mostra só skills instaladas de `.dare/skills.yml`. |
| `--json` | boolean | `false` | Saída JSON (machine-readable). |

### `dare skill info <name>`

Mostra informações detalhadas de uma skill do registry.

```bash
dare skill info dare-ax
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<name>` | argumento | — | Nome da skill (ex.: `dare-ax`). |
| `--json` | boolean | `false` | Saída JSON (machine-readable). |

### `dare skill add <name>`

Instala uma skill no projeto.

```bash
dare skill add dare-ax@1.0.0 --dry-run
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<name>` | argumento | — | Nome da skill com versão opcional (ex.: `dare-ax` ou `dare-ax@1.0.0`). |
| `--dry-run` | boolean | `false` | Mostra o que seria instalado, sem alterar nada. |
| `--json` | boolean | `false` | Saída JSON (machine-readable). |

### `dare skill remove <name>`

Remove uma skill instalada do projeto.

```bash
dare skill remove dare-ax --force
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<name>` | argumento | — | Nome da skill a remover (ex.: `dare-ax`). |
| `--force` | boolean | `false` | Remove mesmo se outras skills instaladas dependerem dela. |
| `--json` | boolean | `false` | Saída JSON (machine-readable). |

### `dare skill update <name>`

Atualiza uma skill instalada para uma versão mais nova.

```bash
dare skill update dare-ax@1.1.0 --dry-run
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<name>` | argumento | — | Nome da skill com versão opcional (ex.: `dare-ax` ou `dare-ax@1.1.0`). |
| `--dry-run` | boolean | `false` | Mostra o diff de versão, sem alterar nada. |
| `--json` | boolean | `false` | Saída JSON (machine-readable). |

### `dare skill publish <path>`

Publica uma skill local no registry (local por default, ou remoto com `--remote`).

```bash
dare skill publish ./minha-skill --remote --token "$GITHUB_TOKEN"
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `<path>` | argumento | — | Caminho do diretório da skill contendo `skill.yml`. |
| `--dry-run` | boolean | `false` | Valida e lista arquivos, sem publicar. |
| `--json` | boolean | `false` | Saída JSON (machine-readable). |
| `--remote` | boolean | `false` | Publica no backend remoto (registry Vercel). |
| `--token <github-token>` | string | — | Bearer token do GitHub (obrigatório com `--remote`). |

## `dare welcome`

Mostra o banner de boas-vindas do DARE e o guia de quick-start. (Sem flags.)

```bash
dare welcome
```
