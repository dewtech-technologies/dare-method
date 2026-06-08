# Agents

Three mechanisms connect AI assistants (Cursor, Antigravity, hybrids) to the
DARE project in a **deterministic and auditable** way: **hooks** (event-driven
automations), **steering files** (per-file resolved context/rules) and the
**MCP server** (local read-only API over the project and the graph).

## Hooks

Automations triggered by development-cycle events. They are
**deterministic** (no LLM decides what runs) and **opt-in**: the absence of the
`hooks` block in `dare.config.json` means zero hooks.

### Events

A **closed** set in v1 (`hooks/types.ts`). Events outside this list are
rejected:

| Event | When it fires | Payload |
|---|---|---|
| `on-save` | When saving a file | `file` (relative, validated) |
| `on-file-create` | When creating a file | `file` (relative, validated) |
| `on-task-complete` | When completing a task | `taskId` (`/^task-[0-9a-z-]+$/`) |
| `pre-commit` | Before a commit | — |

### Action allowlist

The `on` block maps event → list of actions. Each action is a key from a
**closed** set (`hooks/allowlist.ts`) — never a shell string:

| Action | Resolved command | Type |
|---|---|---|
| `dare-validate` | `dare validate --strict` | spawn |
| `dare-review` | `dare review <taskId> --strict --format json` | spawn (requires `taskId`) |
| `graph-register` | — (internal, does not spawn) | internal |
| `lint` | the stack's lint command (resolved from the config) | spawn |
| `test` | the stack's test command (resolved from the config) | spawn |

The `dare-validate`, `dare-review`, `lint` and `test` actions produce a
`pass`/`fail` verdict from the exit code (0 = `pass`). `graph-register` is an
internal action that only registers the trigger in the graph.

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

While `hooks.trusted` is `false`, hooks **do not auto-execute**:
`dispatchHook` throws `TrustRequiredError` and `dare hooks run` fails with
`TRUST_REQUIRED` (exit 2). To run anyway, use `--trust` (per-run override) or
set `trusted: true` in the config.

### Commands

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

Flags per subcommand:

| Subcommand | Flags | Notes |
|---|---|---|
| `list` | `--json` | Lists the `on` map and `trusted`. |
| `run <event>` | `--file <path>`, `--task <taskId>`, `--trust`, `--json` | Exit 0 = ok, 1 = some action failed, 2 = invalid config / untrusted. |
| `validate` | `--json` | Exit 0 = valid, 1 = errors. |

### Security

!!! danger "Why hooks are secure by construction"
    - **Closed allowlist**: only the 5 canonical keys are accepted; editable
      only via a versioned diff. Arbitrary shell strings are impossible.
    - **`shell: false`**: everything runs via `safeSpawn` with `spawn(cmd, argv, { shell: false })`.
      Args enter as elements of argv, **never interpolated into a shell** — no
      injection via `;`, `&&`, backticks, etc.
    - **Path confinement**: `payload.file` and path-looking args go through
      `assertRelativeSafe`; escapes throw `PathEscapeError`.
    - **Sanitized env**: variables matching `SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|API_KEY|AUTH|PRIVATE`
      are removed before the spawn (env allowlist in `safe-spawn.ts`).
    - **Explicit trust**: without `trusted:true`/`--trust`, nothing executes.
    - **Timeout and capped output**: each spawn has a timeout (600s in the dispatcher)
      and capped output.

## Steering files

Markdown files that provide **context and rules** to the AI, resolved per
target file deterministically (`steering/loader.ts` + `resolver.ts`).
They do not live in `dare.config.json`.

### What they are and where they come from

The loader discovers three sources:

| Source | `isBase` | Front-matter |
|---|---|---|
| `DARE/PROJECT-DNA.md` | `true` | canonical base (reuse of the project DNA) |
| `DARE/PATTERNS.md` | `true` | canonical base (project patterns) |
| `.dare/steering/*.md` | `false` | YAML front-matter validated by Zod |

!!! warning "`.env*` files are never eligible"
    Any file whose name matches `^\.env(\..*)?$` is discarded as a
    steering source (protection against secret leakage).

Front-matter of a steering file in `.dare/steering/` (Zod `.strict()`):

| Field | Type | Default | Description |
|---|---|---|---|
| `scope` | `'project' \| 'glob'` | — (required) | `project` applies to everything; `glob` applies according to the pattern. |
| `glob` | `string` | — | Required when `scope: glob`. Must be relative, without `..`. |
| `priority` | `number` (int) | `0` | Tie-breaker within the same bucket. |
| `title` | `string` | — | Optional title. |

```markdown
---
scope: glob
glob: src/api/**
priority: 10
title: Regras da camada de API
---
Sempre validar entrada com Zod antes de tocar no banco.
```

### Precedence / resolution

`resolveSteeringForFile` filters the blocks applicable to the target file and
sorts them from **least to most specific** — the consumer concatenates in that
order (more specific blocks override more general ones). The sorting
(`sortSteeringByPrecedence`) uses:

1. **Bucket** (from most general to most specific): `base` (0) → `project` (1) → `glob` (2);
2. **`priority`** (lowest first);
3. **`path`** (alphabetical order) as the final tie-breaker.

`base` blocks (PROJECT-DNA / PATTERNS) and `project`-scoped blocks always apply;
`glob` blocks only when the pattern matches the target file.

### Commands

```bash
# Listar steering files descobertos, em ordem de precedência
dare steering list
dare steering list --json

# Resolver o steering aplicável a um arquivo (na ordem de aplicação)
dare steering show src/api/users.ts
dare steering show src/api/users.ts --json
```

`steering show` throws a path error (`PathEscapeError`, exit 1) if the file
is not relative and contained within the project.

## MCP server

Local HTTP server that exposes read access to the project context and the
knowledge graph for the IDEs. Implemented in `mcp-server/server.ts`, started by
the `dare-mcp-server` binary (`mcp-server/bin/server.ts`).

### How it starts

```bash
# binário publicado no package
dare-mcp-server

# ou apontando para outro projeto / porta / token
DARE_PROJECT_PATH=/caminho/do/projeto \
DARE_MCP_PORT=3000 \
DARE_MCP_TOKEN="um-token-forte" \
dare-mcp-server
```

Boot defaults (`boot-config.ts`): bind `127.0.0.1`, port `3000`,
`DARE_PROJECT_PATH` = cwd, and token = `randomUUID()` if `DARE_MCP_TOKEN` is not
set. See the full table in
[Configuration › MCP variables](configuration.md#variaveis-de-ambiente-do-mcp).

!!! danger "Loopback bind and Bearer auth"
    The server binds to `127.0.0.1` by default. On loopback, requests without a
    token are accepted (`allowLoopbackWithoutToken`, on by default); for
    any other origin `Authorization: Bearer <token>` is required. With
    `DARE_MCP_BIND=0.0.0.0` the server warns that it is exposed to the LAN — only use it on
    trusted networks and with a strong `DARE_MCP_TOKEN`. CORS accepts only
    `http://127.0.0.1:*` and `http://localhost:*`. The token is never logged in
    full (`redactToken`).

### Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Status, version and basename of the project. |
| `GET` | `/tools` | Lists the available MCP tools. |
| `POST` | `/context/query` | Searches context by `type` (`file`/`task`/`dependency`/`architecture`/`schema`/`endpoint`) and `query`. |
| `GET` | `/blueprint` | Content of `DARE/BLUEPRINT.md`. |
| `GET` | `/dag` | Content of `DARE/dare-dag.yaml`. |
| `GET` | `/tasks/:taskId` | Status of a task (read from `TASKS.md`). |
| `PUT` | `/tasks/:taskId` | Updates the status of a task in `TASKS.md`. |
| `GET` | `/project` | Content of `dare.config.json`. |
| `GET` | `/steering?file=<rel>` | Steering resolved for a file. |
| `POST` | `/graph/locate` | Locates symbols from a `seed`. |
| `POST` | `/graph/map-requirement` | Maps a `reqId` (`RF-…`/`O-…`/`task-…`) to symbols and tasks. |
| `POST` | `/graph/traverse` | Traverses the graph from `seedNodeIds`. |

The graph routes (`graph/*`) open the backend via `loadGraphConfig` +
`createGraph` according to the project's `dare-graph.yml`, clamping `hops`/`limit`
(1–5 / 1–50) and validating path-looking seeds. The routes that read
files resolve paths with `resolveSafePath`; escape attempts return
`403 Forbidden`.

### How the 3 IDEs consume it

The IDEs configured in `ide` (`cursor`, `antigravity`, `hybrid`) point an
MCP client at `http://127.0.0.1:3000` and use the Bearer token (`DARE_MCP_TOKEN`)
to access the tools listed at `/tools`. The typical flow:

- **`get_project_context`** (`GET /project`) and **`get_blueprint`** /
  **`get_dag`** give the IDE the structural context of the project;
- **`query_context`** (`POST /context/query`) searches relevant excerpts from
  BLUEPRINT/TASKS/DAG by keyword;
- **`get_task_status`** / **`update_task_status`** (`GET`/`PUT /tasks/:id`)
  sync task progress;
- **`graph_locate` / `graph_map_requirement` / `graph_traverse`** (`POST /graph/*`)
  navigate the knowledge graph to anchor changes to requirements and symbols;
- **`get_steering`** (`GET /steering`) delivers to the IDE the rules applicable to the
  open file, already resolved by precedence.
