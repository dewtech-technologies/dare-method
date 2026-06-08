# Utilities and Diagnostics

This page focuses on the **diagnostic and maintenance** commands of the `dare` CLI: how to check project health, validate the DAG, visualize dependencies, update the setup, run the quality gate, and manage skills. All are deterministic (they do not call an LLM) and safe for CI. The full flag reference is in [CLI Reference](cli-reference.md).

!!! info "When to use each one"
    `info` for a quick X-ray · `validate` before committing/in CI · `dag viz` to see dependencies · `update` to sync the template · `bench` as a quality gate · `skill` to manage skill packages.

---

## `dare info` — project X-ray

Shows the CLI version, relevant paths, and the **DARE integrity** of the current project. It is the first command to run when something "doesn't look right": it confirms whether you are in a valid DARE project and which artifacts exist.

```bash
dare info
```

Takes no flags. Use it to confirm the installed version before filing a bug or before running `dare update`.

## `dare validate` — DAG integrity

Validates the integrity of `dare-dag.yaml`. Designed for **pre-commit hooks** and **CI**: returns exit code `1` when it finds errors (or warnings, under `--strict`).

```bash
dare validate
dare validate --dag DARE/dare-dag.yaml --strict
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Path of the DAG to validate. |
| `--strict` | boolean | `false` | Treats warnings as errors (fails the exit code). |

Checks performed by the command (extracted from `validate.ts`):

| # | Type | Check |
|---|------|-------------|
| 1 | error | **Unique id** — no duplicate `task.id`. |
| 2 | error | **kebab-case** — id matches `^[a-z][a-z0-9-]*$`. |
| 3 | error | **Valid `depends_on`** — every dependency references an existing id and no task depends on itself. |
| 4 | error | **No cycles** — `computeRanks` fails on cycles in the graph. |
| 5 | warning | **Non-empty prompt** — task with empty `subtask_prompt`. |
| 6 | warning | **Parallelism** — fewer than 2 tasks at rank 0 (DAG with no real parallelism). |

!!! tip "Pre-commit / CI"
    In CI, run `dare validate --strict` so that warnings (empty prompt, lack of parallelism) also bring down the pipeline. Without `--strict`, only the structural errors (ids, cycles, dependencies) fail.

## `dare dag viz` — visualize the DAG

Renders `dare-dag.yaml` as a diagram, with **status-based colors**, to inspect the execution order and dependencies between tasks.

```bash
dare dag viz                                   # Mermaid no stdout
dare dag viz --format dot -o DARE/dag.dot       # Graphviz
dare dag viz --format excalidraw                # → DARE/dag-graph.excalidraw
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | DAG path. |
| `-f, --format <fmt>` | string | `mermaid` | `mermaid` \| `dot` \| `excalidraw`. |
| `-o, --output <file>` | string | stdout¹ | Output file. |

¹ For `excalidraw`, when `-o` is omitted, the default is `DARE/dag-graph.excalidraw`.

- **mermaid** — paste it into any Markdown doc that supports Mermaid (including this site).
- **dot** — to render with Graphviz (`dot -Tpng`).
- **excalidraw** — editable canvas; open it at [excalidraw.com](https://excalidraw.com) to rearrange it visually.

!!! note "Static DAG vs. knowledge graph"
    `dare dag viz` draws the **static task DAG** (`dare-dag.yaml`). To visualize the **knowledge graph** (requirements ↔ tasks ↔ code symbols), use `dare graph viz` — see [CLI Reference](cli-reference.md#dare-graph-viz).

## `dare update` — sync the setup

Updates the project setup to the current version of the DARE CLI (templates, artifact scaffolding), preserving customizations.

```bash
dare update --dry-run        # inspeciona sem escrever
dare update -y               # aplica tudo, mantendo customizações
dare update --target 2.6.0   # atualiza para versão específica
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--dry-run` | boolean | `false` | Shows what would be done, without writing anything. |
| `-y, --yes` | boolean | `false` | Asks nothing — applies everything and keeps customizations. |
| `--force` | boolean | `false` | Overwrites even customized files. |
| `--target <version>` | string | installed CLI | Updates to a specific version. |

!!! warning "Recommended workflow"
    Always run `--dry-run` first to review the plan. Use `-y` to apply non-interactively. Reserve `--force` for cases where you accept losing manual edits to template files — it is destructive.

## `dare bench` — patch quality gate

Runs the verification bench fixtures: a **deterministic patch quality gate**. Useful for detecting regressions in the pipeline's ability to solve tasks, comparing against a baseline.

```bash
dare bench
dare bench --json --baseline baseline.json --fail-on-regression 5
dare bench --filter "auth-*"
```

| Flag | Type | Default | Description |
|------|------|---------|-----------|
| `--suite <dir>` | string | default suite | Directory with `suite.json`. |
| `--json` | boolean | `false` | Emits a JSON report on stdout. |
| `--baseline <file>` | string | — | Baseline `BenchReport` JSON for comparison. |
| `--fail-on-regression <pp>` | string | `3` | Fails if the solve-rate drops more than N percentage points vs baseline. |
| `--filter <glob>` | string | — | Runs only fixtures matching the glob. |

!!! tip "Regression in CI"
    Keep a `baseline.json` in the repository and run `dare bench --json --baseline baseline.json` in CI. With the default `--fail-on-regression 3`, a drop of more than 3 percentage points in the solve-rate brings down the build.

## `dare skill` — skill management

Manages the project's **skill** packages (install, remove, list, inspect, update, publish). The registry can be **local** (default) or **remote** (Vercel backend, via `--remote`). Installed skills are tracked in `.dare/skills.yml`.

All subcommands accept `--json` for machine-readable output.

| Subcommand | Syntax | What it does |
|------------|---------|-----------|
| `list` | `dare skill list [--installed]` | Lists registry skills or, with `--installed`, those from `.dare/skills.yml`. |
| `info` | `dare skill info <name>` | Shows details of a registry skill. |
| `add` | `dare skill add <name[@version]> [--dry-run]` | Installs a skill into the project. |
| `remove` | `dare skill remove <name> [--force]` | Uninstalls; `--force` ignores dependents. |
| `update` | `dare skill update <name[@version]> [--dry-run]` | Updates an installed skill (shows diff with `--dry-run`). |
| `publish` | `dare skill publish <path> [--remote] [--token <t>]` | Publishes a local skill; `--remote` uses the Vercel registry (requires `--token`). |

Examples:

```bash
dare skill list --installed
dare skill add dare-ax@1.0.0 --dry-run
dare skill remove dare-ax --force
dare skill publish ./minha-skill --remote --token "$GITHUB_TOKEN"
```

!!! note "Local vs. remote"
    By default, `publish` writes to the **local registry**. To distribute a skill to the **remote** registry (Vercel), pass `--remote` together with `--token <github-token>` — the token is mandatory in that mode. Use `--dry-run` to validate and list the files before actually publishing.

## Related commands

- `dare hooks validate` — validates the hooks config schema and the allowlist (deterministic). See [CLI Reference](cli-reference.md#dare-hooks).
- `dare steering list` — inspects the precedence of steering files. See [CLI Reference](cli-reference.md#dare-steering).
- `dare graph stats` / `dare graph ingest` — diagnostics and re-sync of the knowledge graph.
