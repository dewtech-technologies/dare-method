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

export function generateClaudeCodeRules(config: TemplateConfig): string {
  const { backend, frontend, graphrag, mcp } = config;

  const backendRules: Record<string, string> = {
    'rust-axum': `## Backend: Rust/Axum
- Use Rust idioms — no \`unwrap()\` in production code
- Prefer async/await with Tokio runtime
- Use Axum extractors for request handling
- Handle all errors with \`thiserror\`/\`anyhow\`
- Ralph Loop: \`cargo clippy && cargo test\``,
    'node-nestjs': `## Backend: Node.js/NestJS
- Use NestJS decorators and dependency injection
- Define DTOs with class-validator for all inputs
- Use TypeORM or Prisma for database access
- Ralph Loop: \`npm run build && npm test && npx eslint src\``,
    'python-fastapi': `## Backend: Python/FastAPI
- Use Pydantic v2 for all data validation
- Type all functions with PEP 484 type hints
- Use async/await for all IO operations
- Ralph Loop: \`python -m pytest && ruff check .\``,
    'php-laravel': `## Backend: PHP/Laravel
- Follow PSR-12 coding standards
- Use FormRequests for all input validation
- Use API Resources for all responses
- Ralph Loop: \`php artisan test && ./vendor/bin/phpstan analyse\``,
  };

  const frontendRules: Record<string, string> = {
    react: `## Frontend: React 18+
- Use functional components with hooks only
- TypeScript for all components and hooks
- Prefer React Query for server state management
- Ralph Loop: \`npm run build && npm test && npx eslint src\``,
    vue: `## Frontend: Vue 3+
- Use Composition API with <script setup> syntax
- TypeScript for all components
- Use Pinia for state management
- Ralph Loop: \`npm run build && npm test && npx eslint src\``,
  };

  return `# DARE Framework

## Metodologia
Você é o Claude Code, assistente de desenvolvimento seguindo o método DARE:
- **D**esign: Requisitos e objetivos definidos em \`DARE/DESIGN.md\`
- **A**rchitect: Blueprint técnico e grafo de tasks em \`DARE/BLUEPRINT.md\`
- **R**eview: Validação humana antes de executar
- **E**xecute: Implementação task a task com Ralph Loop

## Regras Fundamentais
- Sempre leia \`DARE/BLUEPRINT.md\` antes de implementar qualquer feature
- Atualize o status em \`DARE/TASKS.md\` ao concluir cada task
- Nunca pule o Ralph Loop (build → test → lint) antes de marcar uma task como DONE
- Aprovação humana obrigatória antes de merge para a branch principal
- Use os slash commands \`/dare-design\`, \`/dare-blueprint\`, \`/dare-execute\`

## Estrutura do Projeto
\`\`\`
DARE/
├── DESIGN.md        ← Fase D — requisitos (humano define)
├── BLUEPRINT.md     ← Fase A — arquitetura (IA propõe, humano valida)
├── TASKS.md         ← rastreamento de tasks
├── dare-dag.yaml    ← grafo de dependências
└── EXECUTION/       ← logs de execução por task
\`\`\`

${backend && backendRules[backend] ? backendRules[backend] : ''}

${frontend && frontendRules[frontend] ? frontendRules[frontend] : ''}

## Contexto (${graphrag})
${mcp ? `- Consulte o DARE MCP Server em http://localhost:3000 para queries de contexto
- Use POST /context/query com {"type": "architecture"|"task"|"dependency", "query": "..."}
- Evite reler arquivos inteiros — use queries direcionadas` : `- Use DARE/BLUEPRINT.md como fonte única de verdade para contexto`}

## Ralph Loop (obrigatório antes de DONE)
1. Build — compile e verifique erros
2. Test — rode a suite de testes completa
3. Lint — rode o linter/formatter
4. Só marque DONE se os 3 passos passarem sem erros
`;
}

export function generateMcpClaudeCodeRules(config: McpTemplateConfig): string {
  const { mcpTransport = 'stdio', mcpLanguage = 'node-ts', mcpFeatures = ['tools'], graphrag, mcp } = config;
  const featuresStr = mcpFeatures.join(', ');

  const langRules = mcpLanguage === 'python'
    ? `## Linguagem: Python
- Use FastMCP com decoradores @mcp.tool, @mcp.resource, @mcp.prompt
- Type hints obrigatórios — FastMCP gera o JSON Schema automaticamente
- Use docstrings como descrição das tools/resources/prompts
- Ralph Loop: \`python -m py_compile main.py && pytest && ruff check .\`
- Inspecione com: \`npx @modelcontextprotocol/inspector python main.py\``
    : `## Linguagem: TypeScript
- Importe de \`@modelcontextprotocol/sdk/server/index.js\`
- Defina \`inputSchema\` estrito para cada tool — Claude depende dele para chamadas corretas
- Use zod para validação em runtime quando necessário
- Ralph Loop: \`npm run build && npm test\`
- Inspecione com: \`npm run inspect\``;

  const transportNote = mcpTransport === 'stdio'
    ? `- Transport \`stdio\` — comunicação via stdin/stdout, sem porta HTTP`
    : mcpTransport === 'sse'
    ? `- Transport \`SSE\` — expõe GET /sse e POST /messages`
    : `- Transport \`HTTP Stream\` — use StreamableHTTPServerTransport`;

  return `# DARE Framework — MCP Server

## Metodologia
Você é o Claude Code implementando um servidor MCP com o método DARE:
- **D**esign: Quais tools/resources/prompts este servidor expõe?
- **A**rchitect: Schemas das tools, estratégia de transport e auth
- **R**eview: Teste cada tool com MCP Inspector antes de marcar DONE
- **E**xecute: Implementação task a task com Ralph Loop

## Configuração do MCP Server
- Transport: ${mcpTransport}
- Features: ${featuresStr}
${transportNote}

## Regras Fundamentais
- Leia \`DARE/BLUEPRINT.md\` antes de implementar qualquer tool
- Atualize \`DARE/TASKS.md\` ao concluir cada task
- Nunca pule o Ralph Loop antes de marcar DONE
- Teste cada tool com MCP Inspector antes de marcar DONE
- Valide que o \`inputSchema\` corresponde exatamente ao handler

${langRules}

## Boas Práticas MCP
- Nomes de tools em snake_case e descritivos
- Retorne arrays de \`content\`, não strings puras
- Trate nomes de tools/resources desconhecidos com erros explícitos
- Nunca exponha secrets via outputs de tools ou conteúdo de resources
- Documente cada argumento no campo \`description\` do inputSchema

## Contexto (${graphrag})
${mcp ? `- Consulte o DARE MCP Server em http://localhost:3000 para contexto do projeto` : `- Use DARE/BLUEPRINT.md como fonte de verdade`}

## Ralph Loop (obrigatório antes de DONE)
1. Build (npm run build / python -m py_compile)
2. Test (npm test / pytest)
3. Inspect — teste as tools com MCP Inspector
4. Só marque DONE se os 3 passos passarem
`;
}

export function generateClaudeCommands(structure: string): Record<string, string> {
  const isMcp = structure === 'mcp-server';

  return {
    'dare-design.md': `# /dare-design

Gera ou atualiza o \`DARE/DESIGN.md\` a partir de uma descrição.

## Como usar
\`/dare-design Quero uma API REST de autenticação com JWT e refresh token\`

## O que fazer
1. Leia o contexto atual do projeto (package.json, estrutura de pastas)
2. Se \`DARE/DESIGN.md\` já existir, leia-o antes de atualizar
3. Crie ou atualize \`DARE/DESIGN.md\` com:
   - **Descrição** do que será construído
   - **Objetivos** (checkboxes mensuráveis)
   - **Restrições** técnicas e de negócio
   - **Critérios de sucesso** verificáveis
4. Confirme com o usuário antes de prosseguir para blueprint

$ARGUMENTS
`,
    'dare-blueprint.md': `# /dare-blueprint

Gera o \`DARE/BLUEPRINT.md\`, \`DARE/dare-dag.yaml\` e \`DARE/TASKS.md\` a partir do DESIGN.md.

## Como usar
\`/dare-blueprint\`

## O que fazer
1. Leia \`DARE/DESIGN.md\` — obrigatório
2. Gere \`DARE/BLUEPRINT.md\` com:
   - Stack tecnológico detalhado
   - Módulos e responsabilidades
   - Contratos de API (endpoints, schemas)
   - Modelo de dados
   - Decisões arquiteturais justificadas
3. Gere \`DARE/dare-dag.yaml\` com tasks em grafo de dependências
4. Gere \`DARE/TASKS.md\` com tabela de status
5. **Aguarde aprovação humana antes de executar qualquer task**

$ARGUMENTS
`,
    'dare-execute.md': `# /dare-execute

Executa uma task específica do \`DARE/dare-dag.yaml\` seguindo o Ralph Loop.

## Como usar
\`/dare-execute task-001\`
\`/dare-execute task-003 --force\`

## O que fazer
1. Leia \`DARE/BLUEPRINT.md\` — obrigatório antes de qualquer implementação
2. Leia a task especificada em \`DARE/dare-dag.yaml\`
3. Verifique se todas as dependências da task estão com status DONE
4. Implemente a task
5. Execute o Ralph Loop:
   - Build: compile sem erros
   - Test: todos os testes passando
   - Lint: sem warnings${isMcp ? '\n   - Inspect: teste com MCP Inspector' : ''}
6. Atualize o status da task em \`DARE/TASKS.md\` para DONE
7. Informe o usuário e sugira a próxima task disponível

$ARGUMENTS
`,
    'dare-tasks.md': `# /dare-tasks

Exibe o status atual de todas as tasks do projeto.

## Como usar
\`/dare-tasks\`
\`/dare-tasks --pending\`

## O que fazer
1. Leia \`DARE/TASKS.md\` e \`DARE/dare-dag.yaml\`
2. Exiba uma tabela com: ID, título, status, dependências
3. Destaque as tasks que estão prontas para execução (dependências satisfeitas)
4. Calcule e exiba o progresso geral (% concluído)

$ARGUMENTS
`,
  };
}

export function generateClaudeSettings(stack: { backend?: string; frontend?: string; structure: string }): string {
  const buildCmd = stack.backend === 'rust-axum'
    ? 'cargo build'
    : stack.backend === 'python-fastapi' || stack.structure === 'mcp-server'
    ? 'python -m py_compile main.py'
    : 'npm run build';

  const testCmd = stack.backend === 'rust-axum'
    ? 'cargo test'
    : stack.backend === 'python-fastapi' || stack.structure === 'mcp-server'
    ? 'pytest'
    : 'npm test';

  const lintCmd = stack.backend === 'rust-axum'
    ? 'cargo clippy'
    : stack.backend === 'python-fastapi' || stack.structure === 'mcp-server'
    ? 'ruff check .'
    : 'npx eslint src';

  return JSON.stringify({
    permissions: {
      allow: [
        'Bash(git:*)',
        `Bash(${buildCmd})`,
        `Bash(${testCmd})`,
        `Bash(${lintCmd})`,
        'Read(DARE/**)',
        'Write(DARE/**)',
        'Read(src/**)',
        'Write(src/**)',
      ],
    },
    hooks: {
      PostToolUse: [
        {
          matcher: 'Write',
          hooks: [
            {
              type: 'command',
              command: `echo "✅ File saved. Remember to run Ralph Loop: ${buildCmd} && ${testCmd} && ${lintCmd}"`,
            },
          ],
        },
      ],
    },
  }, null, 2);
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
