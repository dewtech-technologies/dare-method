interface TemplateConfig {
  backend?: string;
  frontend?: string;
  graphrag: string;
  mcp: boolean;
}

export function generateCursorRules(config: TemplateConfig): string {
  const { backend, frontend, graphrag, mcp } = config;

  const backendRules: Record<string, string> = {
    'rust-axum': `## Backend: Rust/Axum
- Use Rust idioms and patterns (no unwrap in production)
- Prefer async/await with Tokio runtime
- Use Axum extractors for request handling
- Handle all errors with thiserror/anyhow
- Run \`cargo clippy\` and \`cargo test\` before completing any task (Ralph Loop)
- Use SQLx for database queries with compile-time verification`,
    'node-nestjs': `## Backend: Node.js/NestJS
- Use NestJS decorators and dependency injection
- Define DTOs with class-validator for all inputs
- Use TypeORM or Prisma for database access
- Write Jest unit and e2e tests for all services
- Follow NestJS module structure`,
    'python-fastapi': `## Backend: Python/FastAPI
- Use Pydantic v2 for all data validation
- Type all functions with PEP 484 type hints
- Use async/await for all IO operations
- Follow PEP 8 and use ruff for linting
- Write pytest tests with coverage`,
    'php-laravel': `## Backend: PHP/Laravel
- Follow PSR-12 coding standards
- Use FormRequests for all input validation
- Use API Resources for all responses
- Write PHPUnit feature and unit tests
- Use Eloquent ORM with proper relationships`,
  };

  const frontendRules: Record<string, string> = {
    react: `## Frontend: React 18+
- Use functional components with hooks only
- TypeScript for all components and hooks
- Prefer React Query for server state management
- Use Zustand or Context API for client state
- Write Vitest + Testing Library tests`,
    vue: `## Frontend: Vue 3+
- Use Composition API with <script setup> syntax
- TypeScript for all components
- Use Pinia for state management
- Use Vue Router for navigation
- Write Vitest + Vue Test Utils tests`,
  };

  return `# DARE Framework - Cursor Rules

## DARE Methodology
You are an AI assistant following the DARE methodology:
- **D**esign: Define requirements and architecture
- **A**rchitect: Create technical blueprint and task graph
- **R**eview: Validate implementation against blueprint
- **E**xecute: Implement tasks following the DAG

## Core Rules
- Always read DARE/BLUEPRINT.md before implementing any feature
- Update DARE/TASKS.md status after completing each task
- Never skip the Ralph Loop (build → test → lint) before marking a task as DONE
- Human approval is required before merging to main branch
- Context is king: use MCP Server queries instead of re-reading large files

## Project Structure
- DARE/ - Methodology files (DESIGN.md, BLUEPRINT.md, TASKS.md, dare-dag.yaml)
- DARE/EXECUTION/ - Task execution logs

${backend && backendRules[backend] ? backendRules[backend] : ''}

${frontend && frontendRules[frontend] ? frontendRules[frontend] : ''}

## GraphRAG Context (${graphrag})
${mcp ? `- Query MCP Server at http://localhost:3000 for context instead of reading full files
- Use POST /context/query with {"type": "file"|"task"|"dependency", "query": "..."}` : '- Use DARE/BLUEPRINT.md as the single source of truth for context'}

## Ralph Loop (Mandatory before DONE)
1. Build the project (cargo build / npm run build / etc)
2. Run tests (cargo test / npm test / pytest / etc)
3. Run linter (cargo clippy / eslint / ruff / phpstan)
4. Only mark task as DONE if all 3 steps pass
`;
}

export function generateAntigravityRules(config: TemplateConfig): string {
  const { backend, frontend, graphrag, mcp } = config;

  return `# DARE Framework - Antigravity Rules

## Agent Configuration
You are an autonomous AI agent following the DARE methodology.
Execute tasks from DARE/dare-dag.yaml in parallel when dependencies allow.

## DARE Phases
- **Design**: Read DARE/DESIGN.md for requirements
- **Architect**: Read DARE/BLUEPRINT.md for technical spec
- **Review**: Validate against blueprint before marking DONE
- **Execute**: Implement tasks, update DARE/TASKS.md

## Stack
${backend ? `- Backend: ${backend}` : ''}
${frontend ? `- Frontend: ${frontend}` : ''}

## Context Strategy (${graphrag})
${mcp ? `- Query MCP Server at http://localhost:3000 for context
- Avoid reading full files; use targeted queries` : '- Read DARE/BLUEPRINT.md for context'}

## Execution Rules
- Always check task dependencies before starting
- Update task status in DARE/TASKS.md in real-time
- Run Ralph Loop before marking any task as DONE
- Request human review for architectural decisions
`;
}

export function generateSharedConfig(projectName: string): string {
  return `# DARE - ${projectName}

## Methodology Files
- **DESIGN.md** - Requirements and goals (Phase D)
- **BLUEPRINT.md** - Technical architecture (Phase A)
- **TASKS.md** - Task tracking (Phase E)
- **dare-dag.yaml** - Task dependency graph (Phase E)
- **EXECUTION/** - Task execution logs

## Quick Start
\`\`\`bash
# 1. Define requirements
dare design "Describe your feature"

# 2. Generate blueprint and task graph
dare blueprint

# 3. Execute tasks in parallel
dare execute --parallel --runner cursor
\`\`\`

## Ralph Loop
Before marking any task as DONE:
1. Build ✅
2. Test ✅
3. Lint ✅
`;
}
