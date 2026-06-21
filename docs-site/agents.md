# Agentes

Três mecanismos conectam assistentes de IA (Cursor, Antigravity, híbridos) ao
projeto DARE de forma **determinística e auditável**: **hooks** (automações por
evento), **steering files** (contexto/regras resolvidos por arquivo) e o
**servidor MCP** (API local de leitura do projeto e do grafo).

## Paridade terminal ↔ chat

Cada comando semântico do DARE tem **dois gatilhos equivalentes**:

| Caminho | Exemplo |
|---|---|
| **Terminal** | `dare reverse --ai` |
| **Chat da IDE** | `/dare-reverse` |

O contrato está codificado em `PARITY_CONTRACTS` (`packages/cli/src/ai/parity.ts`):
mesmo schema JSON, mesmos artefatos mesclados, mesma validação Zod (RS-01).

### Providers suportados (v3.12+)

| Provider | Enrichment (`--ai`) | Execução (`execute --agent`) | CLI default |
|---|---|---|---|
| `codex` | ✓ | ✓ (`--driver codex`) | `codex` |
| `claude-code` | ✓ | ✓ (`--driver claude`) | `claude` |
| `cursor-cli` | ✓ | ✓ (`--driver cursor`) | `cursor-agent` |
| `antigravity-cli` | ✓ | ✓ (`--driver antigravity`) | `antigravity` |
| `mock` | ✓ (testes) | ✓ (`--dry-run`) | — |

Resolução de provider: **`--provider` > `ai.defaultProvider` no config > `codex`**.

```bash
# Diagnóstico de CLIs instalados + capacidade enrichment/execução
dare ai doctor
dare ai doctor --json

# Saída estruturada após heurística determinística
dare reverse --ai --json
dare review task-001 --ai --json
```

Skills `/dare-*` nas três IDEs incluem a linha **Equivalente no terminal** apontando
para o comando `dare <cmd> --ai` correspondente — o chat continua caminho de primeira
classe; o terminal ganha o mesmo poder.

## Hooks

Automações disparadas por eventos do ciclo de desenvolvimento. São
**determinísticas** (nenhum LLM decide o que roda) e **opt-in**: a ausência do
bloco `hooks` no `dare.config.json` significa zero hooks.

### Eventos

Conjunto **fechado** na v1 (`hooks/types.ts`). Eventos fora desta lista são
rejeitados:

| Evento | Quando dispara | Payload |
|---|---|---|
| `on-save` | Ao salvar um arquivo | `file` (relativo, validado) |
| `on-file-create` | Ao criar um arquivo | `file` (relativo, validado) |
| `on-task-complete` | Ao concluir uma task | `taskId` (`/^task-[0-9a-z-]+$/`) |
| `pre-commit` | Antes de um commit | — |

### Allowlist de ações

O bloco `on` mapeia evento → lista de ações. Cada ação é uma chave de um
conjunto **fechado** (`hooks/allowlist.ts`) — nunca uma string de shell:

| Ação | Comando resolvido | Tipo |
|---|---|---|
| `dare-validate` | `dare validate --strict` | spawn |
| `dare-review` | `dare review <taskId> --strict --format json` | spawn (exige `taskId`) |
| `graph-register` | — (interno, não spawna) | interno |
| `lint` | comando de lint da stack (resolvido do config) | spawn |
| `test` | comando de teste da stack (resolvido do config) | spawn |

As ações `dare-validate`, `dare-review`, `lint` e `test` produzem um veredito
`pass`/`fail` a partir do exit code (0 = `pass`). `graph-register` é uma ação
interna que apenas registra o gatilho no grafo.

### Trust gate

```json
{
  "hooks": {
    "on": {
      "on-task-complete": [{ "action": "dare-review" }],
      "pre-commit": [{ "action": "dare-validate" }, { "action": "test" }]
    },
    "trusted": false
  }
}
```

Enquanto `hooks.trusted` for `false`, os hooks **não auto-executam**:
`dispatchHook` lança `TrustRequiredError` e `dare hooks run` falha com
`TRUST_REQUIRED` (exit 2). Para rodar mesmo assim, use `--trust` (override por
execução) ou defina `trusted: true` no config.

### Comandos

```bash
# Listar hooks configurados
dare hooks list
dare hooks list --json        # { "hooks": {...}, "trusted": false }

# Rodar os hooks de um evento
dare hooks run on-save --file src/app.ts
dare hooks run on-task-complete --task task-001
dare hooks run pre-commit --trust    # override do trust gate
dare hooks run on-save --file src/app.ts --json

# Validar schema + allowlist do bloco hooks
dare hooks validate
dare hooks validate --json    # { "valid": true, "errors": [] }
```

Flags por subcomando:

| Subcomando | Flags | Notas |
|---|---|---|
| `list` | `--json` | Lista o mapa `on` e `trusted`. |
| `run <event>` | `--file <path>`, `--task <taskId>`, `--trust`, `--json` | Exit 0 = ok, 1 = alguma ação falhou, 2 = config inválida / untrusted. |
| `validate` | `--json` | Exit 0 = válido, 1 = erros. |

### Segurança

!!! danger "Por que os hooks são seguros por construção"
    - **Allowlist fechada**: só as 5 chaves canônicas são aceitas; editável
      apenas via diff versionado. Strings de shell arbitrárias são impossíveis.
    - **`shell: false`**: tudo roda via `safeSpawn` com `spawn(cmd, argv, { shell: false })`.
      Args entram como elementos de argv, **nunca interpolados em shell** — sem
      injeção via `;`, `&&`, backticks etc.
    - **Confinamento de caminho**: `payload.file` e args com cara de caminho
      passam por `assertRelativeSafe`; escapes lançam `PathEscapeError`.
    - **Env saneado**: variáveis que casam com `SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|API_KEY|AUTH|PRIVATE`
      são removidas antes do spawn (allowlist de env em `safe-spawn.ts`).
    - **Trust explícito**: sem `trusted:true`/`--trust`, nada executa.
    - **Timeout e saída limitada**: cada spawn tem timeout (600s no dispatcher)
      e saída capada.

## Steering files

Arquivos Markdown que fornecem **contexto e regras** à IA, resolvidos por
arquivo-alvo de forma determinística (`steering/loader.ts` + `resolver.ts`).
Não vivem no `dare.config.json`.

### O que são e de onde vêm

A loader descobre três origens:

| Origem | `isBase` | Front-matter |
|---|---|---|
| `DARE/PROJECT-DNA.md` | `true` | base canônica (reuso do DNA do projeto) |
| `DARE/PATTERNS.md` | `true` | base canônica (padrões do projeto) |
| `.dare/steering/*.md` | `false` | front-matter YAML validado por Zod |

!!! warning "Arquivos `.env*` nunca são elegíveis"
    Qualquer arquivo cujo nome case com `^\.env(\..*)?$` é descartado como
    fonte de steering (proteção contra vazamento de segredos).

Front-matter de um steering file em `.dare/steering/` (Zod `.strict()`):

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `scope` | `'project' \| 'glob'` | — (obrigatório) | `project` aplica a tudo; `glob` aplica conforme o padrão. |
| `glob` | `string` | — | Obrigatório quando `scope: glob`. Precisa ser relativo, sem `..`. |
| `priority` | `number` (int) | `0` | Desempate dentro do mesmo bucket. |
| `title` | `string` | — | Título opcional. |

```markdown
---
scope: glob
glob: src/api/**
priority: 10
title: Regras da camada de API
---
Sempre validar entrada com Zod antes de tocar no banco.
```

### Precedência / resolução

`resolveSteeringForFile` filtra os blocos aplicáveis ao arquivo-alvo e ordena
do **menos para o mais específico** — o consumidor concatena nessa ordem
(blocos mais específicos sobrescrevem os mais gerais). A ordenação
(`sortSteeringByPrecedence`) usa:

1. **Bucket** (do mais geral ao mais específico): `base` (0) → `project` (1) → `glob` (2);
2. **`priority`** (menor primeiro);
3. **`path`** (ordem alfabética) como desempate final.

Blocos `base` (PROJECT-DNA / PATTERNS) e de escopo `project` sempre se aplicam;
blocos `glob` só quando o padrão casa com o arquivo-alvo.

### Comandos

```bash
# Listar steering files descobertos, em ordem de precedência
dare steering list
dare steering list --json

# Resolver o steering aplicável a um arquivo (na ordem de aplicação)
dare steering show src/api/users.ts
dare steering show src/api/users.ts --json
```

`steering show` lança erro de caminho (`PathEscapeError`, exit 1) se o arquivo
não for relativo e contido no projeto.

## MCP server

Servidor HTTP local que expõe leitura de contexto do projeto e do knowledge
graph para as IDEs. Implementado em `mcp-server/server.ts`, iniciado pelo
binário `dare-mcp-server` (`mcp-server/bin/server.ts`).

### Como sobe

```bash
# binário publicado no package
dare-mcp-server

# ou apontando para outro projeto / porta / token
DARE_PROJECT_PATH=/caminho/do/projeto \
DARE_MCP_PORT=3000 \
DARE_MCP_TOKEN="um-token-forte" \
dare-mcp-server
```

Defaults de boot (`boot-config.ts`): bind `127.0.0.1`, porta `3000`,
`DARE_PROJECT_PATH` = cwd, e token = `randomUUID()` se `DARE_MCP_TOKEN` não for
definido. Ver a tabela completa em
[Configuração › Variáveis do MCP](configuration.md#variaveis-de-ambiente-do-mcp).

!!! danger "Bind em loopback e auth Bearer"
    O servidor faz bind em `127.0.0.1` por padrão. Em loopback, requisições sem
    token são aceitas (`allowLoopbackWithoutToken`, ligado por default); para
    qualquer outra origem é obrigatório `Authorization: Bearer <token>`. Com
    `DARE_MCP_BIND=0.0.0.0` o servidor avisa que está exposto à LAN — só use em
    redes confiáveis e com um `DARE_MCP_TOKEN` forte. O CORS aceita apenas
    `http://127.0.0.1:*` e `http://localhost:*`. O token nunca é logado por
    inteiro (`redactToken`).

### Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Status, versão e basename do projeto. |
| `GET` | `/tools` | Lista as ferramentas MCP disponíveis. |
| `POST` | `/context/query` | Busca contexto por `type` (`file`/`task`/`dependency`/`architecture`/`schema`/`endpoint`) e `query`. |
| `GET` | `/blueprint` | Conteúdo de `DARE/BLUEPRINT.md`. |
| `GET` | `/dag` | Conteúdo de `DARE/dare-dag.yaml`. |
| `GET` | `/tasks/:taskId` | Status de uma task (lido de `TASKS.md`). |
| `PUT` | `/tasks/:taskId` | Atualiza o status de uma task em `TASKS.md`. |
| `GET` | `/project` | Conteúdo de `dare.config.json`. |
| `GET` | `/steering?file=<rel>` | Steering resolvido para um arquivo. |
| `POST` | `/graph/locate` | Localiza símbolos a partir de um `seed`. |
| `POST` | `/graph/map-requirement` | Mapeia um `reqId` (`RF-…`/`O-…`/`task-…`) para símbolos e tasks. |
| `POST` | `/graph/traverse` | Percorre o grafo a partir de `seedNodeIds`. |

As rotas de grafo (`graph/*`) abrem o backend via `loadGraphConfig` +
`createGraph` conforme o `dare-graph.yml` do projeto, clampando `hops`/`limit`
(1–5 / 1–50) e validando seeds com aparência de caminho. As rotas que leem
arquivos resolvem caminhos com `resolveSafePath`; tentativas de escape retornam
`403 Forbidden`.

### Como as 3 IDEs consomem

As IDEs configuradas em `ide` (`cursor`, `antigravity`, `hybrid`) apontam um
cliente MCP para `http://127.0.0.1:3000` e usam o token Bearer (`DARE_MCP_TOKEN`)
para acessar as ferramentas listadas em `/tools`. O fluxo típico:

- **`get_project_context`** (`GET /project`) e **`get_blueprint`** /
  **`get_dag`** dão à IDE o contexto estrutural do projeto;
- **`query_context`** (`POST /context/query`) busca trechos relevantes de
  BLUEPRINT/TASKS/DAG por palavra-chave;
- **`get_task_status`** / **`update_task_status`** (`GET`/`PUT /tasks/:id`)
  sincronizam o progresso das tasks;
- **`graph_locate` / `graph_map_requirement` / `graph_traverse`** (`POST /graph/*`)
  navegam o knowledge graph para ancorar mudanças em requisitos e símbolos;
- **`get_steering`** (`GET /steering`) entrega à IDE as regras aplicáveis ao
  arquivo aberto, já resolvidas por precedência.
