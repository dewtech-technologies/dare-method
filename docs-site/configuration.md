# Configuração

Esta página descreve a configuração do DARE Method ancorada no esquema real: o
arquivo de projeto `dare.config.json` (validado por Zod), o arquivo de backend
do grafo `dare-graph.yml` e as variáveis de ambiente do servidor MCP.

!!! info "Tudo é opt-in"
    Os blocos `verification` e `hooks` ficam **desabilitados por padrão**. A
    ausência do bloco no `dare.config.json` é equivalente aos defaults com
    `enabled:false` / `trusted:false`. Você só ativa o que quiser, em diff
    versionado.

## `dare.config.json`

O arquivo na raiz do projeto reúne quatro grupos:

1. **Identidade do projeto** (`name`, `structure`, `backend`, `frontend`, `ide`,
   `graphrag`, `rustWorkspaceLayout`, `cratePrefix`) — ver `ProjectConfig`.
2. **`verification`** — gates de qualidade do Ralph Loop (Zod `strict`).
3. **`hooks`** — automações determinísticas por evento (Zod `strict`).
4. **`steering`** — não vive no JSON; é resolvido a partir de arquivos em disco
   (ver [Agentes › Steering files](agents.md#steering-files)).

```json
{
  // ── Identidade do projeto (ProjectConfig) ───────────────────────────
  "name": "meu-projeto",
  "structure": "monorepo",          // 'monorepo' | 'backend' | 'frontend'
  "backend": "rust-axum",           // opcional; ver tabela abaixo
  "frontend": "react",              // opcional; ver tabela abaixo
  "ide": "cursor",                  // 'cursor' | 'antigravity' | 'hybrid'
  "graphrag": "sqlite",             // 'sqlite' | 'json' | 'neo4j'
  "rustWorkspaceLayout": "multi",   // opcional: 'single' | 'multi'
  "cratePrefix": "ars",             // opcional: prefixo p/ multi-crate

  // ── verification (DEFAULTS de verification/config.ts) ───────────────
  "verification": {
    "enabled": false,
    "mutation": {
      "enabled": true,
      "minScore": 0.7,
      "incremental": true,
      "maxMutants": 200,
      "timeoutSeconds": 900
    },
    "failToPass": { "required": true },
    "antiTamper": { "enabled": true },
    "typeCheck": { "enabled": false },
    "loop": {
      "policy": "decay",            // 'decay' | 'fixed'
      "maxAttempts": 5,
      "saturationWindow": 3,
      "onSaturation": "fresh-start" // 'fresh-start' | 'replan' | 'escalate'
    },
    "bestOfN": {
      "default": 1,
      "max": 5,
      "budgetTokens": null
    },
    "prerank": { "enabled": false },
    "formal": {
      "enabled": false,
      "backend": "dafny",           // 'dafny' | 'verus' | 'lean'
      "modules": [],
      "maxRepairIterations": 5,
      "proofTimeoutSeconds": 120,
      "antiBypass": true
    }
  },

  // ── hooks (HOOK_DEFAULTS de hooks/config.ts) ────────────────────────
  "hooks": {
    "on": {},                       // evento → lista de ações da allowlist
    "trusted": false
  },

  // ── guard (GUARD_DEFAULTS de guard/config.ts) ───────────────────────
  "guard": {
    "enabled": false,
    "onExecute": true,
    "unicode": "strip",             // 'strip' | 'block'
    "trustedPaths": [".dare/steering/**", "DARE/TASKS.md"],
    "signing": { "enabled": false }
  },

  // ── drift (DRIFT_DEFAULTS de verification/config.ts) ──────────────────
  "drift": {
    "enabled": false,
    "maxOrphanReqs": 0,
    "maxOrphanCode": 0,
    "failOnStale": false,
    "ignore": ["**/index.ts", "**/*.generated.*", "**/bin/**"]
  }
}
```

### Identidade do projeto

Campos de `ProjectConfig` (`packages/cli/src/core/types/project.ts`).

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `name` | `string` | — (obrigatório) | Nome do projeto. |
| `structure` | `'monorepo' \| 'backend' \| 'frontend'` | — (obrigatório) | Forma do repositório. |
| `backend` | `'rust-axum' \| 'node-nestjs' \| 'python-fastapi' \| 'php-laravel'` | — (opcional) | Stack de backend. |
| `frontend` | `'react' \| 'vue' \| 'rust-leptos' \| 'rust-leptos-csr'` | — (opcional) | Stack de frontend. |
| `ide` | `'cursor' \| 'antigravity' \| 'hybrid'` | — (obrigatório) | IDE/assistente alvo. |
| `graphrag` | `'sqlite' \| 'json' \| 'neo4j'` | — (obrigatório) | Backend do knowledge graph (ver `dare-graph.yml`). |
| `rustWorkspaceLayout` | `'single' \| 'multi'` | — (opcional) | `single`: `crates/server` + `crates/web`. `multi`: `{prefix}-core`/`-server`/`-web`/`-cli`. |
| `cratePrefix` | `string` | — (opcional) | Prefixo curto p/ nomes multi-crate (ex.: `ars` → `ars-core`, `ars-server`…). |

### `review`

Gate anti-stub disparado ao concluir uma task (`packages/cli/src/commands/review.ts`).
Em projetos novos vem ligado; em upgrades é opt-in (default desligado) para não
mudar comportamento.

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `onComplete` | `boolean` | `true` (projetos novos) | Roda `dare review` automaticamente ao marcar a task como DONE. |
| `strict` | `boolean` | `false` | Trata achados (stubs/mocks/TODO) como bloqueio em vez de aviso. |

### `refine`

Thresholds que mapeiam o score heurístico de complexidade para
LOW/MED/HIGH/CRITICAL (`packages/cli/src/utils/complexity-analyzer.ts`). Use para
calibrar quando uma task deve ser dividida via `dare refine`.

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `thresholds.low` | `number` | `5` | Limite superior da faixa LOW. |
| `thresholds.med` | `number` | `12` | Limite superior da faixa MED. |
| `thresholds.high` | `number` | `20` | Limite superior da faixa HIGH; acima disso é CRITICAL. |

### `verification`

Bloco inteiro validado em `verification/config.ts` (Zod `.strict()` — campos
desconhecidos são rejeitados). A ausência do bloco equivale a `enabled:false`.

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Liga o pipeline de verificação como um todo. |

#### `verification.mutation`

Gate de mutation testing — bloqueia o `DONE` se o score ficar abaixo do mínimo.

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Liga o gate de mutação. |
| `minScore` | `number` (0–1) | `0.7` | Score mínimo de mutantes mortos; abaixo disso o DONE é bloqueado. |
| `incremental` | `boolean` | `true` | Só muta arquivos do `git diff` da task. |
| `maxMutants` | `number` (int > 0) | `200` | Teto de mutantes por execução. |
| `timeoutSeconds` | `number` (int > 0) | `900` | Timeout total do gate, em segundos. |

#### `verification.failToPass` / `antiTamper` / `typeCheck`

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `failToPass.required` | `boolean` | `true` | Exige o ciclo fail→pass (teste deve falhar antes de passar). |
| `antiTamper.enabled` | `boolean` | `true` | Sub-gate anti-trapaça (detecta enfraquecimento de testes/asserts). |
| `typeCheck.enabled` | `boolean` | `false` | Liga o gate de checagem de tipos. |

#### `verification.loop`

Política do Ralph Loop com consciência de decaimento.

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `policy` | `'decay' \| 'fixed'` | `'decay'` | Estratégia de iteração. |
| `maxAttempts` | `number` (int ≥ 1) | `5` | Teto duro de tentativas; ao atingir, veredito ESCALATE. |
| `saturationWindow` | `number` (int ≥ 1) | `3` | Nº de tentativas com a mesma assinatura de falha → saturado. |
| `onSaturation` | `'fresh-start' \| 'replan' \| 'escalate'` | `'fresh-start'` | Ação ao saturar antes do teto. |

#### `verification.bestOfN`

Geração de N candidatos em worktrees isolados.

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `default` | `number` (int ≥ 1) | `1` | Nº de candidatos por task. Deve ser `≤ max`. |
| `max` | `number` (int ≥ 1) | `5` | Teto de candidatos. |
| `budgetTokens` | `number \| null` | `null` | Orçamento de tokens (`null` = sem teto no CLI; o agente respeita). |

!!! note "Invariante validada"
    `bestOfN.default` precisa ser `<= bestOfN.max`, caso contrário a validação
    Zod falha com `bestOfN.default must be <= bestOfN.max`.

#### `verification.prerank`

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `prerank.enabled` | `boolean` | `false` | Pré-ranqueia candidatos antes da verificação completa. |

#### `verification.formal`

Gate de verificação formal (`FORMAL_DEFAULTS`). Ausência do bloco ⇒
`enabled:false`. Quando ligado, `antiBypass` é obrigatório.

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Liga o gate formal (segundo portão além da marcação). |
| `backend` | `'dafny' \| 'verus' \| 'lean'` | `'dafny'` | Backend de prova. |
| `modules` | `string[]` | `[]` | Módulos/funções críticas marcados. Vazio e sem tag `@dare-formal` ⇒ o aspecto nunca roda. |
| `maxRepairIterations` | `number` (int > 0) | `5` | Teto de iterações do loop de reparo. |
| `proofTimeoutSeconds` | `number` (int > 0) | `120` | Timeout por prova, em segundos. |
| `antiBypass` | `boolean` | `true` | Sub-gate anti-trapaça obrigatório quando `enabled`. |

### `hooks`

Bloco validado em `hooks/config.ts` (Zod `.strict()`). Defaults: `{ on: {}, trusted: false }`.
Detalhes de eventos, ações e segurança em [Agentes › Hooks](agents.md#hooks).

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `on` | `Record<HookEvent, HookAction[]>` | `{}` | Mapa de evento → lista de ações. Eventos: `on-save`, `on-file-create`, `on-task-complete`, `pre-commit`. |
| `trusted` | `boolean` | `false` | Confiança explícita. Enquanto `false`, hooks não auto-executam (`dare hooks run` falha com `TRUST_REQUIRED` até `--trust` ou `trusted:true`). |

### `guard`

Bloco validado em `guard/config.ts` (Zod `.strict()`). Defaults: `enabled:false` (opt-in).
Detalhes em [Referência da CLI › `dare guard`](cli-reference.md#dare-guard).

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Liga o gate de segurança. |
| `onExecute` | `boolean` | `true` | Pré-flight no `dare execute --agent`. |
| `unicode` | `'strip' \| 'block'` | `'strip'` | Modo de auditoria unicode. |
| `trustedPaths` | `string[]` | `['.dare/steering/**', 'DARE/TASKS.md']` | Paths elegíveis a assinatura/control channel. |
| `signing.enabled` | `boolean` | `false` | Habilita verificação de assinatura. |
| `signing.publicKey` | `string` | — | Chave pública minisign (opcional). |

### `graphrag.semantic`

Bloco aninhado em `graphrag` (validado em `verification/config.ts`). Defaults: `enabled:false` (opt-in).
Detalhes em [Referência da CLI › `dare graph query`](cli-reference.md#dare-graph-query-term).

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Liga retrieval híbrido (keyword + vetor + grafo via RRF). |
| `model` | `string` | `'all-MiniLM-L6-v2'` | Modelo de embeddings local. |
| `modelHash` | `string` | — | Hash pinado do modelo (RS-01). |
| `rrfK` | `number` | `60` | Constante k do Reciprocal Rank Fusion. |

Instale o runtime opcional: `npm i @xenova/transformers`. Sem o pacote, o caminho cai para keyword.

### `drift`

Bloco validado em `verification/config.ts` (Zod). Defaults: `enabled:false` (opt-in).
Detalhes em [Referência da CLI › `dare graph drift`](cli-reference.md#dare-graph-drift).

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Liga o gate de drift. |
| `maxOrphanReqs` | `number` | `0` | Limiar de requirements órfãos antes de `drift-fail`. |
| `maxOrphanCode` | `number` | `0` | Limiar de símbolos órfãos antes de `drift-fail`. |
| `failOnStale` | `boolean` | `false` | Trata `stale` como falha no veredito. |
| `ignore` | `string[]` | globs de barrel/generated/bin | Allowlist para orphan-code. |

Cada item de `on[evento]` é um `HookAction`:

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `action` | allowlist | — (obrigatório) | Uma das chaves: `dare-validate`, `dare-review`, `graph-register`, `lint`, `test`. |
| `args` | `string[]` | — (opcional) | Args extra concatenados como argv (nunca interpolados em shell). Args com aparência de caminho passam por `assertRelativeSafe`. |

## `dare-graph.yml`

Backend do knowledge graph, resolvido por `graphrag/factory.ts`. Se o arquivo
não existir, o fallback é `sqlite` em `.dare/graph.db`.

```yaml
# backend: 'sqlite' | 'json' | 'neo4j'
backend: sqlite

sqlite:
  path: .dare/graph.db   # default quando backend=sqlite

# json:
#   path: .dare/graph.json   # default quando backend=json

# neo4j (experimental — exige experimental:true):
# neo4j:
#   url: http://localhost:7474
#   database: neo4j
#   username: neo4j
#   password: ...
#   experimental: true
```

| Backend | Bloco | Default de path | Observações |
|---|---|---|---|
| `sqlite` | `sqlite.path` | `.dare/graph.db` | Backend recomendado (sql.js). |
| `json` | `json.path` | `.dare/graph.json` | Arquivo único, sem dependências nativas. |
| `neo4j` | `neo4j.*` | — | Exige `neo4j.experimental: true` e `neo4j.url`; caso contrário `createGraph()` lança erro com orientação. |

Campos do bloco `neo4j` (defaults aplicados em `loadGraphConfig`):

| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `url` | `string` | `http://localhost:7474` | Endpoint do Neo4j. |
| `database` | `string` | `neo4j` | Nome do banco. |
| `username` | `string` | — | Usuário (opcional). |
| `password` | `string` | — | Senha (opcional). |
| `auth` | `string` | — | Credencial alternativa (opcional). |
| `experimental` | `boolean` | `false` | Precisa ser `true` para o backend subir. |

!!! warning "Neo4j é experimental"
    O backend `neo4j` só inicializa com `experimental: true` em
    `dare-graph.yml`. Sem isso, `createGraph()` lança:
    *"Neo4j backend requires `neo4j.experimental: true` … Use sqlite or json (recommended)."*
    Para a maioria dos projetos, use `sqlite` ou `json`.

## Variáveis de ambiente do MCP

Lidas em `mcp-server/boot-config.ts` pelo binário `dare-mcp-server`
(`mcp-server/bin/server.ts`). Detalhes do servidor em
[Agentes › MCP server](agents.md#mcp-server).

| Variável | Default | Descrição |
|---|---|---|
| `DARE_MCP_BIND` | `127.0.0.1` | Host de bind. `0.0.0.0` expõe à LAN e emite aviso. |
| `DARE_MCP_PORT` | `3000` | Porta TCP. |
| `DARE_MCP_TOKEN` | `randomUUID()` | Token Bearer. Sem definir, é gerado aleatoriamente a cada boot. |
| `DARE_PROJECT_PATH` | `process.cwd()` | Raiz do projeto servida. |
| `DARE_MCP_BODY_LIMIT` | `1mb` | Limite do corpo JSON (`express.json`). |

!!! danger "Não exponha o MCP fora do loopback sem necessidade"
    Com `DARE_MCP_BIND=0.0.0.0` o servidor aceita conexões da rede local. Nesse
    caso o token Bearer passa a ser sua única proteção — defina um
    `DARE_MCP_TOKEN` forte e use apenas em redes confiáveis.
