# Configuración

Esta página describe la configuración del DARE Method anclada en el esquema
real: el archivo de proyecto `dare.config.json` (validado por Zod), el archivo
de backend del grafo `dare-graph.yml` y las variables de entorno del servidor
MCP.

!!! info "Todo es opt-in"
    Los bloques `verification` y `hooks` están **deshabilitados por defecto**.
    La ausencia del bloque en `dare.config.json` equivale a los defaults con
    `enabled:false` / `trusted:false`. Solo activas lo que quieras, en un diff
    versionado.

## `dare.config.json`

El archivo en la raíz del proyecto reúne cuatro grupos:

1. **Identidad del proyecto** (`name`, `structure`, `backend`, `frontend`, `ide`,
   `graphrag`, `rustWorkspaceLayout`, `cratePrefix`) — ver `ProjectConfig`.
2. **`verification`** — gates de calidad del Ralph Loop (Zod `strict`).
3. **`hooks`** — automatizaciones determinísticas por evento (Zod `strict`).
4. **`steering`** — no vive en el JSON; se resuelve a partir de archivos en disco
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
  }
}
```

### Identidad del proyecto

Campos de `ProjectConfig` (`packages/cli/src/core/types/project.ts`).

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `name` | `string` | — (obligatorio) | Nombre del proyecto. |
| `structure` | `'monorepo' \| 'backend' \| 'frontend'` | — (obligatorio) | Forma del repositorio. |
| `backend` | `'rust-axum' \| 'node-nestjs' \| 'python-fastapi' \| 'php-laravel'` | — (opcional) | Stack de backend. |
| `frontend` | `'react' \| 'vue' \| 'rust-leptos' \| 'rust-leptos-csr'` | — (opcional) | Stack de frontend. |
| `ide` | `'cursor' \| 'antigravity' \| 'hybrid'` | — (obligatorio) | IDE/asistente objetivo. |
| `graphrag` | `'sqlite' \| 'json' \| 'neo4j'` | — (obligatorio) | Backend del knowledge graph (ver `dare-graph.yml`). |
| `rustWorkspaceLayout` | `'single' \| 'multi'` | — (opcional) | `single`: `crates/server` + `crates/web`. `multi`: `{prefix}-core`/`-server`/`-web`/`-cli`. |
| `cratePrefix` | `string` | — (opcional) | Prefijo corto para nombres multi-crate (ej.: `ars` → `ars-core`, `ars-server`…). |

### `verification`

El bloque entero se valida en `verification/config.ts` (Zod `.strict()` — los
campos desconocidos son rechazados). La ausencia del bloque equivale a
`enabled:false`.

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Activa el pipeline de verificación en su conjunto. |

#### `verification.mutation`

Gate de mutation testing — bloquea el `DONE` si el score queda por debajo del mínimo.

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Activa el gate de mutación. |
| `minScore` | `number` (0–1) | `0.7` | Score mínimo de mutantes eliminados; por debajo, el DONE se bloquea. |
| `incremental` | `boolean` | `true` | Solo muta archivos del `git diff` de la task. |
| `maxMutants` | `number` (int > 0) | `200` | Tope de mutantes por ejecución. |
| `timeoutSeconds` | `number` (int > 0) | `900` | Timeout total del gate, en segundos. |

#### `verification.failToPass` / `antiTamper` / `typeCheck`

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `failToPass.required` | `boolean` | `true` | Exige el ciclo fail→pass (el test debe fallar antes de pasar). |
| `antiTamper.enabled` | `boolean` | `true` | Sub-gate anti-trampa (detecta debilitamiento de tests/asserts). |
| `typeCheck.enabled` | `boolean` | `false` | Activa el gate de chequeo de tipos. |

#### `verification.loop`

Política del Ralph Loop con conciencia de decaimiento.

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `policy` | `'decay' \| 'fixed'` | `'decay'` | Estrategia de iteración. |
| `maxAttempts` | `number` (int ≥ 1) | `5` | Tope duro de intentos; al alcanzarlo, veredicto ESCALATE. |
| `saturationWindow` | `number` (int ≥ 1) | `3` | Nº de intentos con la misma firma de fallo → saturado. |
| `onSaturation` | `'fresh-start' \| 'replan' \| 'escalate'` | `'fresh-start'` | Acción al saturar antes del tope. |

#### `verification.bestOfN`

Generación de N candidatos en worktrees aislados.

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `default` | `number` (int ≥ 1) | `1` | Nº de candidatos por task. Debe ser `≤ max`. |
| `max` | `number` (int ≥ 1) | `5` | Tope de candidatos. |
| `budgetTokens` | `number \| null` | `null` | Presupuesto de tokens (`null` = sin tope en la CLI; el agente lo respeta). |

!!! note "Invariante validada"
    `bestOfN.default` debe ser `<= bestOfN.max`, de lo contrario la validación
    Zod falla con `bestOfN.default must be <= bestOfN.max`.

#### `verification.prerank`

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `prerank.enabled` | `boolean` | `false` | Pre-rankea candidatos antes de la verificación completa. |

#### `verification.formal`

Gate de verificación formal (`FORMAL_DEFAULTS`). Ausencia del bloque ⇒
`enabled:false`. Cuando se activa, `antiBypass` es obligatorio.

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Activa el gate formal (segunda puerta más allá de la marcación). |
| `backend` | `'dafny' \| 'verus' \| 'lean'` | `'dafny'` | Backend de prueba. |
| `modules` | `string[]` | `[]` | Módulos/funciones críticas marcados. Vacío y sin la etiqueta `@dare-formal` ⇒ el aspecto nunca corre. |
| `maxRepairIterations` | `number` (int > 0) | `5` | Tope de iteraciones del loop de reparación. |
| `proofTimeoutSeconds` | `number` (int > 0) | `120` | Timeout por prueba, en segundos. |
| `antiBypass` | `boolean` | `true` | Sub-gate anti-trampa obligatorio cuando `enabled`. |

### `hooks`

Bloque validado en `hooks/config.ts` (Zod `.strict()`). Defaults: `{ on: {}, trusted: false }`.
Detalles de eventos, acciones y seguridad en [Agentes › Hooks](agents.md#hooks).

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `on` | `Record<HookEvent, HookAction[]>` | `{}` | Mapa de evento → lista de acciones. Eventos: `on-save`, `on-file-create`, `on-task-complete`, `pre-commit`. |
| `trusted` | `boolean` | `false` | Confianza explícita. Mientras sea `false`, los hooks no se auto-ejecutan (`dare hooks run` falla con `TRUST_REQUIRED` hasta `--trust` o `trusted:true`). |

Cada ítem de `on[evento]` es un `HookAction`:

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `action` | allowlist | — (obligatorio) | Una de las claves: `dare-validate`, `dare-review`, `graph-register`, `lint`, `test`. |
| `args` | `string[]` | — (opcional) | Args extra concatenados como argv (nunca interpolados en shell). Los args con aspecto de ruta pasan por `assertRelativeSafe`. |

## `dare-graph.yml`

Backend del knowledge graph, resuelto por `graphrag/factory.ts`. Si el archivo
no existe, el fallback es `sqlite` en `.dare/graph.db`.

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

| Backend | Bloque | Default de path | Observaciones |
|---|---|---|---|
| `sqlite` | `sqlite.path` | `.dare/graph.db` | Backend recomendado (sql.js). |
| `json` | `json.path` | `.dare/graph.json` | Archivo único, sin dependencias nativas. |
| `neo4j` | `neo4j.*` | — | Exige `neo4j.experimental: true` y `neo4j.url`; de lo contrario `createGraph()` lanza un error con orientación. |

Campos del bloque `neo4j` (defaults aplicados en `loadGraphConfig`):

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `url` | `string` | `http://localhost:7474` | Endpoint de Neo4j. |
| `database` | `string` | `neo4j` | Nombre de la base de datos. |
| `username` | `string` | — | Usuario (opcional). |
| `password` | `string` | — | Contraseña (opcional). |
| `auth` | `string` | — | Credencial alternativa (opcional). |
| `experimental` | `boolean` | `false` | Debe ser `true` para que el backend arranque. |

!!! warning "Neo4j es experimental"
    El backend `neo4j` solo inicializa con `experimental: true` en
    `dare-graph.yml`. Sin eso, `createGraph()` lanza:
    *"Neo4j backend requires `neo4j.experimental: true` … Use sqlite or json (recommended)."*
    Para la mayoría de los proyectos, usa `sqlite` o `json`.

## Variables de entorno del MCP

Leídas en `mcp-server/boot-config.ts` por el binario `dare-mcp-server`
(`mcp-server/bin/server.ts`). Detalles del servidor en
[Agentes › MCP server](agents.md#mcp-server).

| Variable | Default | Descripción |
|---|---|---|
| `DARE_MCP_BIND` | `127.0.0.1` | Host de bind. `0.0.0.0` lo expone a la LAN y emite un aviso. |
| `DARE_MCP_PORT` | `3000` | Puerto TCP. |
| `DARE_MCP_TOKEN` | `randomUUID()` | Token Bearer. Sin definir, se genera aleatoriamente en cada boot. |
| `DARE_PROJECT_PATH` | `process.cwd()` | Raíz del proyecto servida. |
| `DARE_MCP_BODY_LIMIT` | `1mb` | Límite del cuerpo JSON (`express.json`). |

!!! danger "No expongas el MCP fuera del loopback sin necesidad"
    Con `DARE_MCP_BIND=0.0.0.0` el servidor acepta conexiones de la red local.
    En ese caso el token Bearer pasa a ser tu única protección — define un
    `DARE_MCP_TOKEN` fuerte y úsalo solo en redes confiables.
