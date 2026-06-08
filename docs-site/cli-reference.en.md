# CLI Reference

Complete reference of **all** commands of the `dare` binary, extracted directly from the `commander` definitions (`packages/cli/src/bin/dare.ts`, `packages/cli/src/commands/*.ts`, and `packages/cli/src/skills/`). The CLI does not call any LLM: it orchestrates artifacts and the task graph; the agent runs inside your IDE.

!!! info "Global option"
    `--no-banner` — suppresses the ASCII banner. Available on any command. The banner only appears on eligible commands (`init`, `--version`/`-V`); other commands do not display it.

!!! tip "Table conventions"
    Arguments between `<...>` are required; between `[...]` are optional. The **Default** column reflects the default value defined in the code (`.option(..., default)`). `--no-*` flags are commander *negative booleans*.

---

## `dare init`

Initializes a new DARE project. **Interactive** mode (prompts) or **non-interactive** mode (via flags, for CI/scripts).

```bash
dare init my-app --stack go-gin --toolchain auto --non-interactive
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `[project-name]` | argument | (prompted) | Project name. |
| `--stack <id>` | string | — | Backend stack id (skips the interactive prompt). |
| `--mcp <language>` | string | — | MCP server language: `node-ts` \| `python` \| `rust` \| `go`. |
| `--transport <mode>` | string | `stdio` | MCP transport: `stdio` \| `sse` \| `http`. |
| `--toolchain <mode>` | string | `auto` | Scaffold tooling: `native` \| `docker` \| `auto`. |
| `--non-interactive` | boolean | `false` | Fails instead of prompting; requires `--stack` or `--mcp`. |

## `dare bootstrap`

Runs the official scaffold of the current project's stack (reads `dare.config.json`) **without** touching the DARE artifacts. Useful in older projects or where the bootstrap was skipped in `init`.

```bash
dare bootstrap --toolchain docker
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--force` | boolean | `false` | Runs even with framework artifacts present (may overwrite files). |
| `--toolchain <mode>` | string | (config) | Overrides the toolchain mode for this run: `auto` \| `native` \| `docker`. |

!!! warning "Conflicts"
    Without `--force`, the command refuses to run if it finds artifacts such as `vendor/`, `composer.lock`, `node_modules`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.lock`, or `target/`.

## `dare discover`

Detects an existing project and installs the DARE methodology files.

```bash
dare discover --dir ./meu-projeto --check
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | current dir | Target directory. |
| `--check` | boolean | — | Only shows the detection result, without installing. |

## `dare reverse`

Reverse-engineers an existing codebase into an `IDEIA.md` (Phase 0) + module specs (brownfield onboarding).

```bash
dare reverse --deep --modules auth,billing
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | current dir | Target directory. |
| `--check` | boolean | — | Only shows detected modules, without writing artifacts. |
| `--modules <list>` | string | — | Limits to specific modules (comma-separated ids/names). |
| `--no-excalidraw` | boolean | (generates) | Skips generation of the editable `.excalidraw` architecture canvas. |
| `--report` | boolean | — | Computes the confidence report + code-spec matrix from already-marked specs. |
| `--deep` | boolean | — | Also extracts ERD + API surface (deterministic) and scaffolds domain-rules / state-machines / permissions / C4. |

## `dare dna`

Extracts the conventions of a legacy codebase into `DARE/PROJECT-DNA.md` (brownfield house-style ruleset).

```bash
dare dna --check
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | current dir | Target directory. |
| `--check` | boolean | — | Only shows detected conventions, without writing artifacts. |

## `dare migrate`

Plans a safe migration of a legacy project to a target stack, with Gherkin parity scenarios (brownfield Phase 2).

```bash
dare migrate --to rust-axum --check
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | current dir | Target directory. |
| `--to <stack>` | string | — | Target stack (e.g., `go-gin`, `rust-axum`, `node-nestjs`, `python-fastapi`). |
| `--check` | boolean | — | Shows source/target/modules/blocking gaps, without writing artifacts. |

## `dare design`

Generates a `DESIGN.md` from a project description.

```bash
dare design "API de cobrança com webhooks Stripe"
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<description>` | argument | — | Project description (required). |
| `--interactive` | boolean | — | Emits a deterministic planning questionnaire from dna/patterns facts (no LLM). |

## `dare blueprint`

Scaffolds `BLUEPRINT.md`, `dare-dag.yaml`, `TASKS.md`, and `EXECUTION/task-*.md` from `DESIGN.md`.

```bash
dare blueprint DARE/DESIGN.md --force
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `[design-file]` | argument | `DARE/DESIGN.md` | Path to the `DESIGN.md`. |
| `-f, --force` | boolean | `false` | Overwrites existing files. |

## `dare execute`

Orchestrates the DAG execution (the IDE agent runs each task). The default action is `--status`.

```bash
dare execute --next
dare execute --complete task-001 --output "OK" --tokens 1200
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Path to the `dare-dag.yaml`. |
| `--next` | boolean | `false` | Prints the next executable tasks (with composed prompts). |
| `--status` | boolean | `false` | Renders the canvas and shows a summary (default action). |
| `--watch` | boolean | `false` | Streams task readiness (re-prints on each state change). Implies `--next`. |
| `--complete <id>` | string | — | Marks a task as DONE (use with `--output`). |
| `--fail <id>` | string | — | Marks a task as FAILED (use with `--reason`). |
| `--reset <id>` | string | — | Resets a task to PENDING. |
| `--output <text>` | string | — | Captured task output (with `--complete`). |
| `--reason <text>` | string | — | Failure reason (with `--fail`). |
| `--tokens <n>` | string | — | Tokens consumed (with `--complete`). |
| `--duration <ms>` | string | — | Task duration in ms (with `--complete`). |
| `--no-graph` | boolean | (ingests) | Skips the knowledge-graph ingestion in this call. |
| `--parallel-hint` | boolean | `false` | With `--next`, marks every same-rank task as RUNNING. |
| `--verify` | boolean | `false` | Runs the verification core after the Ralph Loop passes. |
| `--no-verify` | boolean | (config) | Skips verification even if enabled in `dare.config.json`. |
| `--full-mutation` | boolean | `false` | Disables incremental mutation on this completion. |
| `--verdict-json` | boolean | `false` | Emits the `LoopVerdict` as JSON on stdout. |
| `--best-of <n>` | string | — | Runs N verification candidates (best-of-N). |
| `--policy <p>` | string | — | Overrides the loop policy (`decay`\|`fixed`). |
| `--prerank` | boolean | `false` | Enables prerank ordering without execution (never authorizes DONE). |

## `dare graph`

Inspects and visualizes the DARE knowledge graph. Has subcommands.

### `dare graph stats`

Shows node/edge counts and a breakdown by type. (No flags.)

```bash
dare graph stats
```

### `dare graph query <term>`

Searches nodes whose label/description contains `<term>`.

```bash
dare graph query auth --type requirement --limit 5
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<term>` | argument | — | Search term. |
| `-l, --limit <n>` | string | `10` | Maximum number of results. |
| `-t, --type <type>` | string | — | Restricts to a node type. |

### `dare graph viz`

Exports the graph to a Mermaid or DOT diagram.

```bash
dare graph viz --format dot -o graph.dot
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `-f, --format <fmt>` | string | `mermaid` | Output format: `mermaid` \| `dot`. |
| `-o, --output <file>` | string | stdout | Writes to a file. |

### `dare graph owners <path>`

Lists tasks/requirements that own symbols under `<path>`.

```bash
dare graph owners src/auth --json --limit 30
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<path>` | argument | — | Path to inspect. |
| `--json` | boolean | — | Emits JSON. |
| `--limit <n>` | string | `20` | Maximum number of owners. |

### `dare graph impact <path>`

Shows tasks/requirements impacted by changes under `<path>`.

```bash
dare graph impact src/billing --hops 2
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<path>` | argument | — | Change path. |
| `--json` | boolean | — | Emits JSON. |
| `--hops <n>` | string | `3` | Traversal depth (max 5). |

### `dare graph trace <req>`

Traces a requirement/task down to code symbols.

```bash
dare graph trace REQ-001 --json
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<req>` | argument | — | Requirement or task. |
| `--json` | boolean | — | Emits JSON. |

### `dare graph locate <seed>`

Locates code symbols/files/tasks from a seed query.

```bash
dare graph locate "login flow" --type symbol --hops 2
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<seed>` | argument | — | Seed query. |
| `--json` | boolean | — | Emits JSON. |
| `--hops <n>` | string | `3` | Traversal hops. |
| `--limit <n>` | string | `10` | Maximum number of candidates. |
| `--type <t>` | string (repeatable) | `[]` | Filters node types (can be repeated). |
| `--edge-type <e>` | string (repeatable) | `[]` | Filters edge types (can be repeated). |

### `dare graph ingest`

Re-syncs the graph from the current `dare-dag.yaml` + state.

```bash
dare graph ingest --requirements-only
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Path to the `dare-dag.yaml`. |
| `--requirements-only` | boolean | `false` | Re-parses only DESIGN/BLUEPRINT/TASKS, skips the DAG. |

## `dare dag`

Inspects and visualizes the static task DAG (`dare-dag.yaml`). Has the `viz` subcommand.

### `dare dag viz`

Renders `dare-dag.yaml` as a Mermaid, DOT, or Excalidraw diagram, with status-based colors.

```bash
dare dag viz --format excalidraw -o DARE/dag-graph.excalidraw
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Path to the `dare-dag.yaml`. |
| `-f, --format <fmt>` | string | `mermaid` | Format: `mermaid` \| `dot` \| `excalidraw`. |
| `-o, --output <file>` | string | stdout¹ | Writes to a file. |

¹ For `excalidraw`, the default is `DARE/dag-graph.excalidraw` when `-o` is omitted.

## `dare validate`

Validates the integrity of `dare-dag.yaml` (suitable for pre-commit hooks and CI).

```bash
dare validate --strict
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Path to the `dare-dag.yaml`. |
| `--strict` | boolean | `false` | Treats warnings as errors. |

## `dare info`

Shows the version, paths, and DARE integrity of the current project. (No flags.)

```bash
dare info
```

## `dare update`

Updates the project setup to the current version of the DARE CLI.

```bash
dare update --dry-run
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--dry-run` | boolean | `false` | Shows what would be done, without writing anything. |
| `-y, --yes` | boolean | `false` | Asks nothing — applies everything and keeps customizations. |
| `--force` | boolean | `false` | Overwrites even customized files (dangerous). |
| `--target <version>` | string | (installed CLI) | Updates to a specific version. |

## `dare review`

Audits a task for stubs, mocks, TODOs, and empty functions.

```bash
dare review task-001 --strict --format json
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<task-id>` | argument | — | Task ID (e.g., `task-001`) — looks up `DARE/EXECUTION/<id>.md`. |
| `--strict` | boolean | `false` | Treats warnings as errors (CI-friendly). |
| `--errors-only` | boolean | `false` | Suppresses warnings in the human output. |
| `--files <files...>` | string[] | — | Explicit list of files to analyze (ignores spec/git). |
| `--from-agent <path>` | string | — | Path to JSON with `SemanticVerdict` produced by the IDE agent. |
| `--format <fmt>` | string | `human` | Output: `human` \| `json`. |

## `dare refine`

Measures a task's complexity and (optionally) proposes a breakdown into sub-tasks.

```bash
dare refine task-003 --split --apply
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<task-id>` | argument | — | Task ID (e.g., `task-001`). |
| `--split` | boolean | `false` | Emits a proposal to break it into sub-tasks. |
| `--apply` | boolean | `false` | Applies the split: marks the original task as SPLIT in `DARE/TASKS.md`. |
| `--strict` | boolean | `false` | Exit code 2 when complexity is HIGH/CRITICAL (CI-friendly). |
| `--format <fmt>` | string | `human` | Output: `human` \| `json`. |
| `--from-agent <path>` | string | — | JSON with `RefineVerdict` produced by the IDE agent. |

## `dare bench`

Runs verification bench fixtures (deterministic patch quality gate).

```bash
dare bench --json --baseline baseline.json --fail-on-regression 5
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--suite <dir>` | string | (default suite) | Directory with `suite.json`. |
| `--json` | boolean | `false` | Emits a JSON report on stdout. |
| `--baseline <file>` | string | — | Baseline `BenchReport` JSON for regression comparison. |
| `--fail-on-regression <pp>` | string | `3` | Fails if the solve-rate drops more than N percentage points vs baseline. |
| `--filter <glob>` | string | — | Runs only fixtures matching the glob. |

## `dare hooks`

Manages and runs DARE agent hooks (deterministic, no LLM). Has subcommands.

### `dare hooks list`

Lists the hooks configured in `dare.config.json`.

```bash
dare hooks list --json
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--json` | boolean | — | Emits JSON. |

### `dare hooks run <event>`

Runs the hooks for an event.

```bash
dare hooks run on-save --file src/index.ts
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<event>` | argument | — | Event (e.g., `on-save`, `on-file-create`, `on-task-complete`). |
| `--file <path>` | string | — | Relative file path (`on-save` / `on-file-create`). |
| `--task <taskId>` | string | — | Task id (`on-task-complete`). |
| `--trust` | boolean | — | Overrides `hooks.trusted` for this run. |
| `--json` | boolean | — | Emits results in JSON. |

### `dare hooks validate`

Validates the hooks config schema and the allowlist.

```bash
dare hooks validate --json
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--json` | boolean | — | Emits JSON. |

## `dare steering`

Inspects resolved steering files (deterministic, no LLM). Has subcommands.

### `dare steering list`

Lists the discovered steering files and their precedence order.

```bash
dare steering list --json
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--json` | boolean | — | Emits JSON. |

### `dare steering show <file>`

Resolves and prints the steering applicable to `<file>`, in precedence order.

```bash
dare steering show src/auth/login.ts
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<file>` | argument | — | Target file. |
| `--json` | boolean | — | Emits JSON. |

## `dare patterns`

Discovers recurring codebase patterns into `DARE/PATTERNS.md` (deterministic, no LLM).

```bash
dare patterns --inject
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | current dir | Target directory. |
| `--check` | boolean | — | Only shows detected patterns, without writing artifacts. |
| `--modules <list>` | string | — | Limits to specific modules (comma-separated ids/names). |
| `--inject` | boolean | — | Confirms `PATTERNS.md` as a steering base (idempotent, preserves user steering). |

## `dare skill`

Manages this project's DARE skills (add, remove, list, info, update, publish). Has subcommands.

### `dare skill list`

Lists available skills (registry) or those installed in the project.

```bash
dare skill list --installed
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--installed` | boolean | `false` | Shows only installed skills from `.dare/skills.yml`. |
| `--json` | boolean | `false` | JSON output (machine-readable). |

### `dare skill info <name>`

Shows detailed information of a registry skill.

```bash
dare skill info dare-ax
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<name>` | argument | — | Skill name (e.g., `dare-ax`). |
| `--json` | boolean | `false` | JSON output (machine-readable). |

### `dare skill add <name>`

Installs a skill into the project.

```bash
dare skill add dare-ax@1.0.0 --dry-run
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<name>` | argument | — | Skill name with optional version (e.g., `dare-ax` or `dare-ax@1.0.0`). |
| `--dry-run` | boolean | `false` | Shows what would be installed, without changing anything. |
| `--json` | boolean | `false` | JSON output (machine-readable). |

### `dare skill remove <name>`

Removes an installed skill from the project.

```bash
dare skill remove dare-ax --force
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<name>` | argument | — | Name of the skill to remove (e.g., `dare-ax`). |
| `--force` | boolean | `false` | Removes even if other installed skills depend on it. |
| `--json` | boolean | `false` | JSON output (machine-readable). |

### `dare skill update <name>`

Updates an installed skill to a newer version.

```bash
dare skill update dare-ax@1.1.0 --dry-run
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<name>` | argument | — | Skill name with optional version (e.g., `dare-ax` or `dare-ax@1.1.0`). |
| `--dry-run` | boolean | `false` | Shows the version diff, without changing anything. |
| `--json` | boolean | `false` | JSON output (machine-readable). |

### `dare skill publish <path>`

Publishes a local skill to the registry (local by default, or remote with `--remote`).

```bash
dare skill publish ./minha-skill --remote --token "$GITHUB_TOKEN"
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `<path>` | argument | — | Path to the skill directory containing `skill.yml`. |
| `--dry-run` | boolean | `false` | Validates and lists files, without publishing. |
| `--json` | boolean | `false` | JSON output (machine-readable). |
| `--remote` | boolean | `false` | Publishes to the remote backend (Vercel registry). |
| `--token <github-token>` | string | — | GitHub Bearer token (required with `--remote`). |

## `dare welcome`

Shows the DARE welcome banner and the quick-start guide. (No flags.)

```bash
dare welcome
```
