# Configuration

This page describes the configuration of the DARE Method anchored in the real
schema: the project file `dare.config.json` (validated by Zod), the graph
backend file `dare-graph.yml`, and the MCP server environment variables.

!!! info "Everything is opt-in"
    The `verification` and `hooks` blocks are **disabled by default**. The
    absence of the block in `dare.config.json` is equivalent to the defaults
    with `enabled:false` / `trusted:false`. You only enable what you want, in a
    versioned diff.

## `dare.config.json`

The file at the project root brings together four groups:

1. **Project identity** (`name`, `structure`, `backend`, `frontend`, `ide`,
   `graphrag`, `rustWorkspaceLayout`, `cratePrefix`) — see `ProjectConfig`.
2. **`verification`** — Ralph Loop quality gates (Zod `strict`).
3. **`hooks`** — deterministic per-event automations (Zod `strict`).
4. **`steering`** — does not live in the JSON; it is resolved from files on disk
   (see [Agents › Steering files](agents.md#steering-files)).

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

### Project identity

Fields of `ProjectConfig` (`packages/cli/src/core/types/project.ts`).

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — (required) | Project name. |
| `structure` | `'monorepo' \| 'backend' \| 'frontend'` | — (required) | Repository shape. |
| `backend` | `'rust-axum' \| 'node-nestjs' \| 'python-fastapi' \| 'php-laravel'` | — (optional) | Backend stack. |
| `frontend` | `'react' \| 'vue' \| 'rust-leptos' \| 'rust-leptos-csr'` | — (optional) | Frontend stack. |
| `ide` | `'cursor' \| 'antigravity' \| 'hybrid'` | — (required) | Target IDE/assistant. |
| `graphrag` | `'sqlite' \| 'json' \| 'neo4j'` | — (required) | Knowledge graph backend (see `dare-graph.yml`). |
| `rustWorkspaceLayout` | `'single' \| 'multi'` | — (optional) | `single`: `crates/server` + `crates/web`. `multi`: `{prefix}-core`/`-server`/`-web`/`-cli`. |
| `cratePrefix` | `string` | — (optional) | Short prefix for multi-crate names (e.g., `ars` → `ars-core`, `ars-server`…). |

### `verification`

The entire block is validated in `verification/config.ts` (Zod `.strict()` —
unknown fields are rejected). The absence of the block is equivalent to
`enabled:false`.

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Turns on the verification pipeline as a whole. |

#### `verification.mutation`

Mutation testing gate — blocks `DONE` if the score falls below the minimum.

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Turns on the mutation gate. |
| `minScore` | `number` (0–1) | `0.7` | Minimum killed-mutant score; below it, DONE is blocked. |
| `incremental` | `boolean` | `true` | Only mutates files from the task's `git diff`. |
| `maxMutants` | `number` (int > 0) | `200` | Cap of mutants per run. |
| `timeoutSeconds` | `number` (int > 0) | `900` | Total gate timeout, in seconds. |

#### `verification.failToPass` / `antiTamper` / `typeCheck`

| Field | Type | Default | Description |
|---|---|---|---|
| `failToPass.required` | `boolean` | `true` | Requires the fail→pass cycle (test must fail before passing). |
| `antiTamper.enabled` | `boolean` | `true` | Anti-cheat sub-gate (detects weakening of tests/asserts). |
| `typeCheck.enabled` | `boolean` | `false` | Turns on the type-checking gate. |

#### `verification.loop`

Ralph Loop policy with decay awareness.

| Field | Type | Default | Description |
|---|---|---|---|
| `policy` | `'decay' \| 'fixed'` | `'decay'` | Iteration strategy. |
| `maxAttempts` | `number` (int ≥ 1) | `5` | Hard cap of attempts; on reaching it, ESCALATE verdict. |
| `saturationWindow` | `number` (int ≥ 1) | `3` | Number of attempts with the same failure signature → saturated. |
| `onSaturation` | `'fresh-start' \| 'replan' \| 'escalate'` | `'fresh-start'` | Action on saturating before the cap. |

#### `verification.bestOfN`

Generation of N candidates in isolated worktrees.

| Field | Type | Default | Description |
|---|---|---|---|
| `default` | `number` (int ≥ 1) | `1` | Number of candidates per task. Must be `≤ max`. |
| `max` | `number` (int ≥ 1) | `5` | Cap of candidates. |
| `budgetTokens` | `number \| null` | `null` | Token budget (`null` = no cap in the CLI; the agent respects it). |

!!! note "Validated invariant"
    `bestOfN.default` must be `<= bestOfN.max`, otherwise Zod validation fails
    with `bestOfN.default must be <= bestOfN.max`.

#### `verification.prerank`

| Field | Type | Default | Description |
|---|---|---|---|
| `prerank.enabled` | `boolean` | `false` | Pre-ranks candidates before full verification. |

#### `verification.formal`

Formal verification gate (`FORMAL_DEFAULTS`). Absence of the block ⇒
`enabled:false`. When turned on, `antiBypass` is mandatory.

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Turns on the formal gate (a second gate beyond the marking). |
| `backend` | `'dafny' \| 'verus' \| 'lean'` | `'dafny'` | Proof backend. |
| `modules` | `string[]` | `[]` | Critical modules/functions marked. Empty and without the `@dare-formal` tag ⇒ the aspect never runs. |
| `maxRepairIterations` | `number` (int > 0) | `5` | Cap of repair-loop iterations. |
| `proofTimeoutSeconds` | `number` (int > 0) | `120` | Timeout per proof, in seconds. |
| `antiBypass` | `boolean` | `true` | Anti-cheat sub-gate, mandatory when `enabled`. |

### `hooks`

Block validated in `hooks/config.ts` (Zod `.strict()`). Defaults: `{ on: {}, trusted: false }`.
Details on events, actions, and security in [Agents › Hooks](agents.md#hooks).

| Field | Type | Default | Description |
|---|---|---|---|
| `on` | `Record<HookEvent, HookAction[]>` | `{}` | Map of event → list of actions. Events: `on-save`, `on-file-create`, `on-task-complete`, `pre-commit`. |
| `trusted` | `boolean` | `false` | Explicit trust. While `false`, hooks do not auto-execute (`dare hooks run` fails with `TRUST_REQUIRED` until `--trust` or `trusted:true`). |

Each item of `on[event]` is a `HookAction`:

| Field | Type | Default | Description |
|---|---|---|---|
| `action` | allowlist | — (required) | One of the keys: `dare-validate`, `dare-review`, `graph-register`, `lint`, `test`. |
| `args` | `string[]` | — (optional) | Extra args concatenated as argv (never interpolated into a shell). Path-looking args go through `assertRelativeSafe`. |

## `dare-graph.yml`

Knowledge graph backend, resolved by `graphrag/factory.ts`. If the file does
not exist, the fallback is `sqlite` at `.dare/graph.db`.

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

| Backend | Block | Path default | Notes |
|---|---|---|---|
| `sqlite` | `sqlite.path` | `.dare/graph.db` | Recommended backend (sql.js). |
| `json` | `json.path` | `.dare/graph.json` | Single file, no native dependencies. |
| `neo4j` | `neo4j.*` | — | Requires `neo4j.experimental: true` and `neo4j.url`; otherwise `createGraph()` throws an error with guidance. |

Fields of the `neo4j` block (defaults applied in `loadGraphConfig`):

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | `http://localhost:7474` | Neo4j endpoint. |
| `database` | `string` | `neo4j` | Database name. |
| `username` | `string` | — | User (optional). |
| `password` | `string` | — | Password (optional). |
| `auth` | `string` | — | Alternative credential (optional). |
| `experimental` | `boolean` | `false` | Must be `true` for the backend to start. |

!!! warning "Neo4j is experimental"
    The `neo4j` backend only initializes with `experimental: true` in
    `dare-graph.yml`. Without it, `createGraph()` throws:
    *"Neo4j backend requires `neo4j.experimental: true` … Use sqlite or json (recommended)."*
    For most projects, use `sqlite` or `json`.

## MCP environment variables

Read in `mcp-server/boot-config.ts` by the `dare-mcp-server` binary
(`mcp-server/bin/server.ts`). Server details in
[Agents › MCP server](agents.md#mcp-server).

| Variable | Default | Description |
|---|---|---|
| `DARE_MCP_BIND` | `127.0.0.1` | Bind host. `0.0.0.0` exposes it to the LAN and emits a warning. |
| `DARE_MCP_PORT` | `3000` | TCP port. |
| `DARE_MCP_TOKEN` | `randomUUID()` | Bearer token. If unset, it is randomly generated on each boot. |
| `DARE_PROJECT_PATH` | `process.cwd()` | Root of the served project. |
| `DARE_MCP_BODY_LIMIT` | `1mb` | JSON body limit (`express.json`). |

!!! danger "Do not expose the MCP outside loopback unnecessarily"
    With `DARE_MCP_BIND=0.0.0.0` the server accepts connections from the local
    network. In that case the Bearer token becomes your only protection — set a
    strong `DARE_MCP_TOKEN` and use it only on trusted networks.
