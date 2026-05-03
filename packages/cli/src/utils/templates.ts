interface TemplateConfig {
  backend?: string;
  frontend?: string;
  graphrag: string;
  mcp: boolean;
}

interface McpTemplateConfig {
  mcpTransport?: string;
  mcpLanguage?: string;
  mcpFeatures?: string[];
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

export function generateMcpCursorRules(config: McpTemplateConfig): string {
  const { mcpTransport = 'stdio', mcpLanguage = 'node-ts', mcpFeatures = ['tools'], graphrag, mcp } = config;
  const featuresStr = mcpFeatures.join(', ');

  const langRules = mcpLanguage === 'python'
    ? `## Language: Python
- Use FastMCP (@mcp.tool, @mcp.resource, @mcp.prompt decorators)
- Type all arguments — FastMCP builds JSON schema from type hints
- Use docstrings as tool/resource/prompt descriptions
- Test: npx @modelcontextprotocol/inspector python main.py
- Lint: ruff check . && mypy .`
    : `## Language: TypeScript
- Import from '@modelcontextprotocol/sdk/server/index.js' and types
- Always define strict inputSchema for every tool (Claude depends on it)
- Use zod for runtime validation when needed
- Test: npm run inspect (MCP Inspector)
- Build: npm run build before marking any task DONE`;

  const transportNote = mcpTransport === 'stdio'
    ? `- Transport: stdio — server communicates via stdin/stdout, no HTTP port needed`
    : mcpTransport === 'sse'
    ? `- Transport: SSE — server exposes GET /sse and POST /messages endpoints`
    : `- Transport: HTTP Stream — use StreamableHTTPServerTransport`;

  return `# DARE Framework - Cursor Rules (MCP Server Project)

## DARE Methodology
You are an AI assistant following the DARE methodology:
- **D**esign: Define MCP server requirements and capabilities
- **A**rchitect: Create technical blueprint and task graph
- **R**eview: Validate implementation against blueprint
- **E**xecute: Implement tools, resources, and prompts following the DAG

## Core Rules
- Always read DARE/BLUEPRINT.md before implementing any tool or resource
- Update DARE/TASKS.md status after completing each task
- Never skip the Ralph Loop (build → test → inspect) before marking a task as DONE
- Test every tool with MCP Inspector before marking DONE
- Validate tool inputSchema matches actual handler logic exactly

## MCP Server Configuration
- Transport: ${mcpTransport}
- Features: ${featuresStr}
${transportNote}

${langRules}

## MCP Best Practices
- Keep tool names snake_case and descriptive
- Return structured content arrays, not plain strings
- Handle unknown tool/resource/prompt names with explicit errors
- Never expose secrets via tool outputs or resource contents
- Document every tool argument in inputSchema description fields

## GraphRAG Context (${graphrag})
${mcp ? `- Query MCP Server at http://localhost:3000 for context instead of reading full files` : '- Use DARE/BLUEPRINT.md as the single source of truth'}

## Ralph Loop (Mandatory before DONE)
1. Build (npm run build / python -m py_compile)
2. Test (npm test / pytest)
3. Inspect with MCP Inspector to verify tool contracts
4. Only mark DONE if all 3 steps pass
`;
}

export function generateMcpAntigravityRules(config: McpTemplateConfig): string {
  const { mcpTransport = 'stdio', mcpLanguage = 'node-ts', mcpFeatures = ['tools'], graphrag, mcp } = config;

  return `# DARE Framework - Antigravity Rules (MCP Server Project)

## Agent Configuration
You are an autonomous AI agent implementing an MCP server using the DARE methodology.
Execute tasks from DARE/dare-dag.yaml in parallel when dependencies allow.

## DARE Phases
- **Design**: Read DARE/DESIGN.md — what tools/resources/prompts does this MCP server expose?
- **Architect**: Read DARE/BLUEPRINT.md — tool schemas, transport, auth strategy
- **Review**: Test each tool with MCP Inspector before marking DONE
- **Execute**: Implement tasks, update DARE/TASKS.md

## MCP Stack
- Language: ${mcpLanguage}
- Transport: ${mcpTransport}
- Features: ${mcpFeatures.join(', ')}

## Implementation Rules
- Each tool must have a strict inputSchema — Claude uses it to call the tool
- Test with MCP Inspector after implementing each tool
- Never skip error handling for unknown tool names

## Context Strategy (${graphrag})
${mcp ? `- Query MCP Server at http://localhost:3000 for project context` : '- Read DARE/BLUEPRINT.md for context'}

## Execution Rules
- Always check task dependencies before starting
- Update task status in DARE/TASKS.md in real-time
- Run Ralph Loop before marking any task as DONE
- Request human review for transport or auth design decisions
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
