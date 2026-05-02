# @dewtech/dare-cli

CLI tool for DARE Framework - AI-assisted software development with parallel task execution.

## Installation

```bash
npm install -g @dewtech/dare-cli
# or
npx @dewtech/dare-cli init my-project
```

## Commands

### `dare init`

Interactive project initialization with stack selection.

```bash
dare init my-project
```

Prompts:
- Project structure (Monorepo / Backend only / Frontend only)
- Backend stack (Rust/Axum, Node/NestJS, Python/FastAPI, PHP/Laravel)
- Frontend stack (React, Vue)
- IDE (Cursor, Antigravity, Hybrid)
- GraphRAG backend (SQLite, JSON, Neo4j)
- Enable MCP Server

Generates:
- `.cursorrules` / `.antigravityrules` (global rules)
- `.cursor/rules/*.mdc` (stack-specific skills)
- `.cursor/commands/` (DARE commands)
- `.agents/skills/` (Antigravity skills)
- `dare.config.json` (project config)
- `DARE/README.md` (methodology guide)

### `dare design`

Generate DESIGN.md from a project description.

```bash
dare design "Build a REST API for user authentication with JWT"
```

### `dare blueprint`

Generate BLUEPRINT.md, dare-dag.yaml, and TASKS.md from DESIGN.md.

```bash
dare blueprint
```

### `dare execute`

Execute tasks using DAG Task Runner.

```bash
# Execute all tasks in parallel
dare execute --parallel --runner cursor

# Execute a specific task
dare execute task-001

# Sequential execution
dare execute
```

## Workflow

```bash
# 1. Initialize project
dare init my-api

# 2. Define requirements
dare design "Build a REST API for user management"

# 3. Generate blueprint and task graph
dare blueprint

# 4. Execute tasks in parallel (75% faster)
dare execute --parallel --runner cursor
```

## Performance

| Mode | Estimated Time |
|------|---------------|
| Sequential (old) | ~280 minutes |
| Parallel DAG | ~70 minutes |
| **Improvement** | **75% faster** |

## Supported Stacks

### Backend
- Rust/Axum
- Node.js/NestJS
- Python/FastAPI
- PHP/Laravel

### Frontend
- React 18+
- Vue 3+
