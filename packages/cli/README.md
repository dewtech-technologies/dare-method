# @dewtech/dare-cli

CLI tool for the **DARE Framework** — Design, Architect, Review, Execute.

A structured methodology for AI-assisted software development with mandatory human-in-the-loop reviews and parallel task execution.

[![npm](https://img.shields.io/npm/v/@dewtech/dare-cli)](https://www.npmjs.com/package/@dewtech/dare-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/dewtech-technologies/dare-method/blob/main/LICENSE)

## Installation

```bash
npm install -g @dewtech/dare-cli
```

## Commands

### `dare init`

Interactive project initialization — creates the full project structure with DARE methodology files, IDE rules and stack templates.

```bash
dare init my-project
```

Prompts:
- **Structure:** Monorepo · Backend only · Frontend only · **MCP Server** ← new
- **MCP Server:** language (TypeScript / Python), transport (stdio / SSE / HTTP Stream), capabilities (Tools / Resources / Prompts)
- **Backend stack:** Rust/Axum · Node.js/NestJS · Python/FastAPI · PHP/Laravel
- **Frontend stack:** React 18+ · Vue 3+
- **IDE / Agent:** Claude Code · Cursor · Antigravity · Hybrid
- **GraphRAG backend:** SQLite · JSON · Neo4j
- **DARE MCP Server:** context query server (saves ~95% tokens)

Generates:
- `dare.config.json` — project config
- `CLAUDE.md` + `.claude/commands/` + `.claude/settings.json` — Claude Code rules and slash commands
- `.cursorrules` / `.antigravityrules` — Cursor / Antigravity rules
- `.cursor/rules/*.mdc` — stack-specific skills
- `.cursor/commands/` — Cursor slash commands
- `.agents/skills/` — Antigravity agent skills
- `DARE/` — methodology directory (DESIGN, BLUEPRINT, TASKS, dag)
- Full project template ready to run (MCP server, backend or frontend)

---

### `dare discover` ← new in v0.3.0

Detects an existing project's stack automatically and installs DARE files without touching your source code.

```bash
# Run inside an existing project
cd my-existing-project
dare discover

# Inspect only, no changes
dare discover --check

# Target a specific directory
dare discover --dir ./path/to/project
```

Auto-detects from: `package.json`, `Cargo.toml`, `requirements.txt`, `pyproject.toml`, `composer.json`.

Recognizes: NestJS · React · Vue · Nuxt · Rust/Axum · FastAPI · Laravel · **MCP Server** (`@modelcontextprotocol/sdk`, `FastMCP`).

---

### `dare design`

Generate `DARE/DESIGN.md` from a project description.

```bash
dare design "Build a REST API for user authentication with JWT"
```

---

### `dare blueprint`

Generate `DARE/BLUEPRINT.md`, `dare-dag.yaml` and `TASKS.md` from `DESIGN.md`.

```bash
dare blueprint
```

---

### `dare execute`

Orchestrate DAG execution. **The IDE is the executor** (Cursor / Antigravity
/ Claude Code) — `dare execute` only coordinates state, composes prompts
with parent context, updates the live canvas at `DARE/.canvas.md`, and
ingests finished tasks into the knowledge graph.

> **No API keys, no extra token costs.** You use the plan of the IDE you're
> already logged into.

```bash
# Print next executable tasks (with composed prompts)
dare execute --next

# Mark a task DONE after the agent finishes it
dare execute --complete task-001 --output "Created src/auth.ts and tests/auth.test.ts; all tests green."

# Mark a task FAILED — descendants are cascade-skipped automatically
dare execute --fail task-002 --reason "Schema migration conflict in users table"

# Reset a task back to PENDING (for retry)
dare execute --reset task-002

# Show snapshot of canvas + summary (default action)
dare execute --status
```

#### Typical flow inside the IDE agent

```bash
dare execute --next                                # → tasks ready in current rank
# (agent executes each task: code, build, test, lint)
dare execute --complete task-001 --output "…"
dare execute --complete task-002 --output "…"
dare execute --next                                # → next rank
# (repeat until "✅ All tasks resolved")
```

The skills shipped by `dare init` (`.cursor/rules/skill-dag-runner.mdc`,
`.agents/skills/dare-dag-runner/SKILL.md`, `.claude/commands/dare-dag-run.md`)
guide the IDE agent through this loop.

### `dare info`

Read-only diagnostic of the current project: CLI version, platform, presence
of each canonical DARE artifact, active GraphRAG backend, and task progress.

```bash
dare info
```

### `dare validate`

Static checks on `dare-dag.yaml` — ideal for pre-commit hooks and CI.
Verifies unique kebab-case ids, valid `depends_on`, absence of cycles,
non-empty prompts, and parallelism (warning when only one task at rank 0).

```bash
dare validate                # errors fail; warnings printed
dare validate --strict       # warnings also fail (CI-friendly)
```

A pre-commit hook template is shipped at
`templates/hooks/pre-commit-dare-validate` — copy to `.git/hooks/pre-commit`
(or use with husky) to validate the DAG before every commit.

### `dare execute --watch`

Interactive loop: the CLI watches `.dare/state.json` and re-prints the next
ready tasks every time the state changes. Pair with the IDE agent firing
`--complete`/`--fail` from another terminal.

```bash
dare execute --watch
```

### `dare dag`

Inspect and visualize the **static task DAG** declared in `dare-dag.yaml` —
distinct from `dare graph`, which inspects the populated knowledge graph
(only contains tasks already executed).

```bash
dare dag viz                              # Mermaid to stdout
dare dag viz -o DARE/dag-graph.mmd        # Mermaid file
dare dag viz -f dot -o DARE/dag-graph.dot # DOT (Graphviz)
```

The Mermaid output groups tasks into rank subgraphs and colors nodes by
status (`PENDING` / `RUNNING` / `DONE` / `FAILED` / `SKIPPED`), so you can
**see the execution plan before running any task**.

> `dare blueprint` writes `DARE/dag-graph.mmd` automatically — open it in
> your editor with a Mermaid preview to see the static graph immediately.

### `dare graph`

Inspect the project's knowledge graph. The graph is populated automatically
by `dare execute --complete/--fail` (task nodes, file nodes, `depends_on` and
`implements` edges). Backend is whatever `dare-graph.yml` declares
(`sqlite` default, `json` available, `neo4j` planned).

```bash
dare graph stats                       # totals + breakdown by type
dare graph query auth                  # search nodes by label/description
dare graph query auth --limit 20

dare graph viz                         # Mermaid to stdout
dare graph viz -f dot                  # DOT for Graphviz
dare graph viz -o docs/graph.mmd       # write to file

dare graph ingest                      # re-sync from dare-dag.yaml + state
```

---

## Full Workflow

```bash
# New project
dare init my-project
cd my-project
dare design "Describe what you're building"
dare blueprint
dare execute --parallel

# Existing project
cd my-existing-project
dare discover
dare design "Describe what you're building"
dare blueprint
dare execute --parallel
```

## Claude Code Workflow

```bash
dare init my-project
# → IDE: Claude Code
# → Structure: Backend / Frontend / MCP Server

cd my-project
# Claude Code slash commands available:
# /dare-design   → generates DARE/DESIGN.md
# /dare-blueprint → generates BLUEPRINT.md + DAG
# /dare-execute task-001 → implements with Ralph Loop
# /dare-tasks    → shows task status table
```

Files generated for Claude Code:
```
CLAUDE.md                    ← main context (stack rules + DARE methodology)
.claude/
  settings.json              ← permissions + Ralph Loop hook
  commands/
    dare-design.md           ← /dare-design
    dare-blueprint.md        ← /dare-blueprint
    dare-execute.md          ← /dare-execute
    dare-tasks.md            ← /dare-tasks
```

---

## MCP Server Workflow

```bash
dare init my-mcp-server
# → Structure: MCP Server
# → Language: TypeScript
# → Transport: stdio
# → Capabilities: Tools, Resources

cd my-mcp-server
npm install
dare design "MCP server that exposes ZIP code lookup tools"
dare blueprint
dare execute --parallel

# Test with MCP Inspector
npm run inspect
```

---

## Performance

| Mode | Estimated Time |
|------|----------------|
| Sequential | ~280 minutes |
| Parallel DAG | ~70 minutes |
| **Improvement** | **75% faster** |

---

## Supported Stacks

| Type | Options |
|------|---------|
| **Backend** | Rust/Axum · Node.js/NestJS · Python/FastAPI · PHP/Laravel |
| **Frontend** | React 18+ · Vue 3+ |
| **MCP Server** | TypeScript/Node.js · Python — stdio / SSE / HTTP Stream |
| **IDE / Agent** | Claude Code · Cursor · Antigravity · Hybrid |

---

## O que vem com o pacote (v2.0+)

A partir da v2.0 o `@dewtech/dare-cli` é um **pacote único** que inclui todas as
funcionalidades do framework DARE. Você não precisa instalar nada além dele:

```bash
npm install -g @dewtech/dare-cli
```

Isso já dá:

| Componente | O que é |
|------------|---------|
| CLI `dare` | `init`, `design`, `blueprint`, `execute`, `discover` |
| CLI `dare-mcp-server` | Servidor MCP local de contexto (~95% economia de tokens) |
| Engine GraphRAG | Grafo de conhecimento com SQLite + FTS5 |
| DAG Task Runner | Execução paralela de tasks com Kahn's algorithm |
| Tipos e templates | Tudo embutido — sem dependências externas do `@dewtech/*` |

> **Histórico (v1.x):** os pacotes `@dewtech/dare-core`, `@dewtech/dare-graphrag` e
> `@dewtech/dare-mcp-server` foram consolidados em `@dewtech/dare-cli` e estão
> **deprecated** no npm. Não há mais subpacotes para gerenciar.

---

## Links

- [GitHub](https://github.com/dewtech-technologies/dare-method)
- [DARE Methodology](https://github.com/dewtech-technologies/dare-method#-o-método)
- [Dewtech](https://dewtech.tech)
