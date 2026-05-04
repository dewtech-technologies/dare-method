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

Execute tasks from the DAG with optional parallel execution.

```bash
# Execute all tasks in parallel (75% faster)
dare execute --parallel --runner cursor

# Execute a specific task
dare execute task-001

# Sequential execution
dare execute
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

## Related packages

| Package | Description |
|---------|-------------|
| [`@dewtech/dare-mcp-server`](https://www.npmjs.com/package/@dewtech/dare-mcp-server) | Local MCP context server (~95% token savings) |
| [`@dewtech/dare-graphrag`](https://www.npmjs.com/package/@dewtech/dare-graphrag) | Knowledge graph engine (SQLite + FTS5) |
| [`@dewtech/dare-core`](https://www.npmjs.com/package/@dewtech/dare-core) | Shared types and utilities |

---

## Links

- [GitHub](https://github.com/dewtech-technologies/dare-method)
- [DARE Methodology](https://github.com/dewtech-technologies/dare-method#-o-método)
- [Dewtech](https://dewtech.tech)
