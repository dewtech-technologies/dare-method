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

// ============================================================
// REAL CONTENT FROM implementations/ — embedded for distribution
// ============================================================

// Code-fence helper: avoids escaping backticks inside template literals
const CB = '```';

export function getCursorCommands(): Record<string, string> {
  return {
    'generate-design.md': `# Comando: /generate-design

## Descrição
Este comando inicia o Método DARE (Design) gerando um documento de requisitos a partir de uma ideia inicial.

## Instruções para o Cursor Composer

1. **Leia a Ideia Inicial:** Analise o prompt fornecido pelo usuário (\`$ARGUMENTS\`) que descreve o que ele deseja construir.
2. **Leia o Template:** Utilize a estrutura definida em \`templates/DESIGN-template.md\`.
3. **Analise o Contexto Global:** Leia o arquivo \`.cursorrules\` (ou equivalente na pasta \`.cursor/rules/\`) para entender a stack técnica do projeto e preencher automaticamente a seção de STACK TÉCNICA.
4. **Gere o Documento:**
   - Preencha o template com as informações extraídas do prompt.
   - Organize as funcionalidades de forma clara.
   - Identifique possíveis requisitos técnicos implícitos e restrições.
   - **Integre Requisitos de Segurança (OWASP):** Adicione obrigatoriamente requisitos de segurança na seção correspondente (ex: Rate Limiting, HTTPS, Proteção contra Força Bruta) baseando-se na skill \`skill-security.mdc\`.
   - Defina claramente o que fica FORA DO ESCOPO para manter o foco da versão.
5. **Salve o Arquivo:** Crie o arquivo \`DARE/DESIGN.md\` com o conteúdo gerado.
6. **Mensagem Final:** Informe ao usuário: "Documento DESIGN.md gerado com sucesso. Por favor, revise e aprove o documento. Quando estiver pronto, execute \`/generate-blueprint DARE/DESIGN.md\`."
`,

    'generate-blueprint.md': `# Comando: /generate-blueprint

## Descrição
Este comando avança o Método DARE para a fase Architect, lendo o Design aprovado e gerando a arquitetura completa de implementação.

## Instruções para o Cursor Composer

1. **Leia o Documento Design:** Acesse e leia o arquivo \`$ARGUMENTS\` (geralmente \`DARE/DESIGN.md\`) que contém os requisitos do projeto.
2. **Leia o Template:** Utilize a estrutura definida em \`templates/BLUEPRINT-template.md\`.
3. **Analise o Contexto Global:** Leia o arquivo \`.cursorrules\` (ou equivalente) para entender as regras, convenções de nomenclatura e padrões de arquitetura exigidos pela stack do projeto.
4. **Analise Exemplos:** Se houver arquivos na pasta \`examples/\`, analise-os para extrair os padrões de código esperados e incluí-los na seção "CÓDIGO-BASE / PADRÕES A SEGUIR".
5. **Gere a Arquitetura (O Blueprint):**
   - **Visão Geral:** Defina a arquitetura apropriada para o projeto (Monolito, Microserviços, Hexagonal, MVC).
   - **Segurança (OWASP):** Adicione uma subseção explicando como as diretrizes da \`skill-security.mdc\` serão implementadas (ex: Bcrypt para senhas, Middlewares de Rate Limit, Validação estrita).
   - **Modelo de Dados:** Projete o esquema completo do banco de dados (tabelas, campos, tipos, relacionamentos) e apresente em formato Markdown ou SQL simplificado. Certifique-se de que dados sensíveis estão protegidos.
   - **Endpoints:** Liste todas as rotas da API necessárias com Request e Response esperados em uma tabela Markdown, incluindo as necessidades de Autenticação/Autorização.
   - **Estrutura:** Esboce a árvore de diretórios dos arquivos que serão criados.
   - **Plano de Execução:** Divida o projeto em Fases lógicas e sequenciais. A Fase 2 geralmente deve incluir o Setup de Segurança (Auth, Middlewares).
   - **Comandos:** Liste comandos de setup (ex: migrations, composer install).
6. **Salve o Arquivo:** Crie o arquivo \`DARE/BLUEPRINT.md\` com o conteúdo gerado.
7. **Mensagem Final:** Informe ao usuário: "Documento BLUEPRINT.md gerado com sucesso. Por favor, revise a arquitetura e os endpoints. Quando estiver aprovado, execute \`/generate-tasks DARE/BLUEPRINT.md\`."
`,

    'generate-tasks.md': `# Comando: /generate-tasks

## Descrição
Este comando avança o Método DARE lendo o Blueprint aprovado e gerando as tarefas atômicas isoladas para execução.

## Instruções para o Cursor Composer

1. **Leia o Documento Blueprint:** Acesse e leia o arquivo \`$ARGUMENTS\` (geralmente \`DARE/BLUEPRINT.md\`) que contém a arquitetura completa.
2. **Leia os Templates:** Utilize a estrutura definida em \`templates/TASKS-template.md\` e \`templates/TASK-SPEC-template.md\`.
3. **Analise o Contexto Global:** Leia o arquivo \`.cursorrules\` (ou equivalente) para garantir que as instruções de código sigam as convenções do projeto.
4. **Desdobre as Fases em Tarefas Atômicas:**
   - Para cada Fase definida no Blueprint, crie tarefas granulares e executáveis.
   - Uma tarefa deve ser pequena o suficiente para ser concluída em um único prompt do Composer.
   - **Tarefas de Segurança:** Garanta que requisitos de segurança (ex: Middlewares, Validação de FormRequests, Criptografia) tenham tarefas específicas ou estejam explicitamente incluídos nas tarefas relevantes.
   - Exemplo: "Fase 2: Autenticação" vira "Task 003: Migration de Users", "Task 004: AuthController (com Rate Limit e Bcrypt)", etc.
5. **Gere os Arquivos de Tarefas:**
   - **TASKS.md:** Crie o arquivo \`DARE/TASKS.md\` com a visão geral de todas as tarefas e suas dependências.
   - **Especificações Isoladas:** Para CADA tarefa criada, crie um arquivo em \`DARE/EXECUTION/task-[id].md\` seguindo o template \`TASK-SPEC-template.md\`.
   - Preencha as instruções de implementação detalhadas para cada arquivo de task isolada, incluindo os Validation Gates apropriados para a stack (ex: PHPUnit para Laravel, Pytest para Python).
6. **Mensagem Final:** Informe ao usuário: "Documento TASKS.md e especificações isoladas geradas em DARE/EXECUTION/ com sucesso. Revise as tarefas. Para iniciar a implementação, execute \`/execute-task task-001\`."
`,

    'execute-task.md': `# Comando: /execute-task

## Descrição
Este comando finaliza o Método DARE (Execute) implementando o código e validando os testes de uma tarefa específica isolada.

## Instruções para o Cursor Composer

1. **Identifique a Tarefa:** Leia o \`$ARGUMENTS\` (ID da tarefa ou caminho do arquivo, ex: \`task-001\` ou \`DARE/EXECUTION/task-001.md\`).
2. **Leia a Especificação da Tarefa:** Abra e leia a especificação detalhada da tarefa em \`DARE/EXECUTION/[id].md\`.
3. **Analise o Contexto Global:** Leia o arquivo \`.cursorrules\` (ou equivalente) e a arquitetura geral em \`DARE/BLUEPRINT.md\` para garantir que o código será gerado dentro dos padrões do projeto.
4. **Implemente o Código:**
   - Execute passo a passo as instruções da seção "ESPECIFICAÇÃO DE IMPLEMENTAÇÃO".
   - Crie ou modifique os arquivos necessários.
   - Siga rigorosamente os padrões de código, tratamento de erros e convenções definidos nas regras globais e exemplos fornecidos.
5. **O Loop de Validação (Ralph Loop):**
   - Após a implementação, execute OBRIGATORIAMENTE os comandos definidos na seção "CRITÉRIOS DE SUCESSO (VALIDATION GATES)".
   - Exemplo: \`php artisan test --filter=NomeDoTeste\` ou \`./vendor/bin/pint\`.
   - Se algum comando falhar, LEIA O ERRO, CORRIJA O CÓDIGO e RODE O COMANDO NOVAMENTE até que todos passem com sucesso.
6. **Mensagem Final:** Após o sucesso dos testes, atualize o status da tarefa no arquivo \`DARE/TASKS.md\` (marque com um \`[x]\`) e informe ao usuário: "Tarefa [ID] implementada e validada com sucesso. Os testes passaram."
`,

    'generate-bugfix-design.md': `---
description: Analisa o projeto existente e gera um Design DARE focado na resolucao de um bug. Use quando precisar investigar e corrigir um erro complexo no sistema atual.
globs: *
---

# Generate Bugfix Design

## Objetivo
Analisar a base de código atual, diagnosticar um problema relatado e gerar um documento de Design (\`DARE/DESIGN-Bugfix-[Nome].md\`) focado especificamente na **correção do bug**, mapeando a causa raiz e o plano de ação cirúrgico.

## Contexto
Este comando é para **projetos legados** ou em andamento onde um erro foi encontrado. O foco aqui é **diagnóstico e correção**: encontrar a causa raiz, analisar impacto e planejar a correção mais segura possível.

## Passos que a IA deve seguir:

1. **Análise de Contexto:**
   - Entender o comportamento atual (o bug) vs o comportamento esperado
   - Analisar logs, stack traces ou descrições de erro fornecidas
   - Identificar a área do código responsável pelo problema

2. **Diagnóstico da Causa Raiz:**
   - Por que o erro está ocorrendo?
   - É um problema de lógica, banco de dados, concorrência ou segurança?

3. **Geração do Documento:**
   - Criar o arquivo \`DARE/DESIGN-Bugfix-[Nome-do-Bug].md\`

## Estrutura do Documento Gerado:

${CB}markdown
# Bugfix Design: [Nome do Bug]

## Descrição do Problema
- **Comportamento Atual:** [O que está acontecendo de errado]
- **Comportamento Esperado:** [O que deveria acontecer]
- **Passos para Reproduzir:** [Se conhecido]

## Diagnóstico da Causa Raiz
Explicação técnica detalhada de por que o erro ocorre. (Ex: "A query N+1 está estourando a memória", ou "A validação não verifica campos nulos").

## Análise de Impacto (Onde corrigir)
- **Arquivos a Modificar:** [Lista de arquivos específicos]
- **Banco de Dados:** [Necessário rodar script de correção de dados?]
- **Riscos da Correção:** [O que pode quebrar ao consertar isso?]

## Plano de Ação (Correção Cirúrgica)
1. [Passo 1: Ajustar a query no Repository]
2. [Passo 2: Adicionar teste unitário para cobrir o caso]
3. [Passo 3: Validar comportamento]

## Testes Necessários
- **Validation Gates:** [O que testar para garantir que o bug sumiu]
- **Testes de Regressão:** [O que testar para garantir que não quebrou o resto]

## Próximas Etapas
1. Revisar e aprovar este Bugfix Design
2. Executar \`/generate-blueprint DARE/DESIGN-Bugfix-[Nome].md\` (opcional, se a correção for grande)
3. Ou ir direto para \`/generate-tasks DARE/DESIGN-Bugfix-[Nome].md\`
${CB}

## Regras de Ouro:
- **Seja Cirúrgico:** A correção deve ser o menor código possível para resolver o problema sem efeitos colaterais.
- **Causa Raiz:** Não trate apenas o sintoma, identifique e corrija a causa raiz.
- **Evite Regressão:** Sempre mapeie os riscos da correção.
`,

    'generate-feature-design.md': `---
description: Analisa o projeto existente e gera um Design DARE focado na adicao de uma nova feature. Use quando precisar adicionar uma funcionalidade nova sem reescrever o Design de todo o sistema.
globs: *
---

# Generate Feature Design

## Objetivo
Analisar a base de código atual e gerar um documento de Design (\`DARE/DESIGN-Feature-[Nome].md\`) focado especificamente na **adição de uma nova feature**, respeitando a arquitetura existente do projeto.

## Contexto
Este comando é para **projetos legados** onde você quer adicionar uma funcionalidade nova. O foco aqui é **expansão**: novos endpoints, novas tabelas, novas integrações.

## Passos que a IA deve seguir:

1. **Análise de Contexto:**
   - Identificar a stack e arquitetura (MVC, Hexagonal, etc.)
   - Identificar padrões de projeto existentes para seguir o mesmo estilo
   - Identificar banco de dados e dependências chave

2. **Entendimento da Feature:**
   - Qual é o objetivo da nova funcionalidade?
   - Como ela se conecta com o que já existe?

3. **Geração do Documento:**
   - Criar o arquivo \`DARE/DESIGN-Feature-[Nome-da-Feature].md\`

## Estrutura do Documento Gerado:

${CB}markdown
# Feature Design: [Nome da Feature]

## Contexto no Projeto
Como esta feature se encaixa no ecossistema atual.

## Objetivos da Feature
- [Objetivo 1]
- [Objetivo 2]

## Análise de Impacto (O que muda)
- **Novos Arquivos:** [Controllers, Models, etc. a serem criados]
- **Arquivos Modificados:** [Arquivos existentes que sofrerão alteração]
- **Banco de Dados:** [Novas tabelas ou colunas]

## Requisitos Técnicos
### Funcionalidades
- [Funcionalidade 1]
- [Funcionalidade 2]

### Segurança (OWASP)
- [Validações e controles de acesso específicos para esta feature]

## Restrições
- O que NÃO deve ser alterado no sistema legado.

## Próximas Etapas
1. Revisar e aprovar este Design
2. Executar \`/generate-blueprint DARE/DESIGN-Feature-[Nome].md\`
${CB}

## Regras de Ouro:
- **Siga o Padrão Local:** Se o projeto usa um padrão específico, a feature deve segui-lo.
- **Isolamento:** Tente isolar o código novo do legado.
- **Segurança:** Aplique regras OWASP na nova feature.
`,

    'generate-docker-compose.md': `# Comando: /generate-docker-compose

## Descrição
Este comando analisa a arquitetura definida no BLUEPRINT.md e gera um \`docker-compose.yml\` completo com todos os serviços necessários (App, DB, Cache, etc).

## Instruções para o Cursor Composer

1. **Leia o Documento Blueprint:** Acesse o \`DARE/BLUEPRINT.md\` (se existir) para identificar as dependências do sistema (ex: PostgreSQL, Redis, Mailhog).
2. **Leia o Contexto Global:** Leia o \`.cursorrules\` para confirmar as versões do banco de dados e outras ferramentas.
3. **Leia a Skill Docker:** Leia \`.cursor/rules/skill-docker.mdc\` para aplicar boas práticas (Healthchecks, Redes, Volumes).
4. **Gere o docker-compose.yml:**
   - Crie um arquivo \`docker-compose.yml\` na raiz do projeto.
   - **Serviço App:** Use o \`build: .\` (Dockerfile gerado). Exponha a porta correta. Defina variáveis de ambiente ou carregue do \`.env\`. Configure \`depends_on\` para DB/Cache.
   - **Serviço Webserver (Laravel):** Se for Laravel, crie um serviço \`nginx\` dependente do \`app\` (PHP-FPM) e configure os volumes para compartilhar a pasta \`/var/www/html\`.
   - **Serviço Banco de Dados:** Adicione o banco de dados (ex: \`postgres:16-alpine\` ou \`mysql:8.0\`). Defina variáveis de ambiente para usuário, senha e database (\`POSTGRES_DB\`, \`POSTGRES_USER\`). Adicione um \`healthcheck\` para testar a conexão (\`pg_isready -U user\`). Crie um volume nomeado para os dados (\`db_data:/var/lib/postgresql/data\`).
   - **Serviço Cache (Opcional):** Se o projeto usar Redis, adicione o serviço \`redis:7-alpine\`.
   - **Redes e Volumes:** Defina as redes customizadas (ex: \`app-network\`) e volumes (\`db_data\`, \`redis_data\`) no final do arquivo.
5. **Mensagem Final:** Informe ao usuário: "Arquivo docker-compose.yml gerado com sucesso. Todos os serviços (App, [DB], [Cache]) foram configurados com healthchecks, volumes persistentes e redes isoladas. Revise as portas e variáveis de ambiente no .env antes de executar \`docker-compose up -d\`."
`,

    'generate-dockerfile.md': `# Comando: /generate-dockerfile

## Descrição
Este comando analisa a stack do projeto (definida no DESIGN.md ou .cursorrules) e gera um \`Dockerfile\` otimizado para produção e desenvolvimento.

## Instruções para o Cursor Composer

1. **Analise o Contexto:** Leia o arquivo \`.cursorrules\` e o \`DARE/DESIGN.md\` (se existir) para identificar a stack tecnológica principal (Linguagem, Framework, Versões).
2. **Leia a Skill Docker:** Leia as regras em \`.cursor/rules/skill-docker.mdc\` para aplicar as melhores práticas de containerização.
3. **Gere o Dockerfile:**
   - Crie um Dockerfile na raiz do projeto (\`./Dockerfile\`).
   - **Para PHP/Laravel:** Use multi-stage build. Instale extensões necessárias (pdo_mysql/pgsql, mbstring, exif, pcntl, bcmath, gd). Configure o \`www-data\` e ajuste permissões de \`/var/www/html/storage\` e \`bootstrap/cache\`.
   - **Para Python:** Use \`python:slim\`. Crie um usuário não-root. Copie \`requirements.txt\` primeiro, instale dependências e depois copie o código.
   - **Para Go:** Use multi-stage. Estágio 1: \`golang:alpine\` para build (\`go build -o app\`). Estágio 2: \`alpine\` ou \`scratch\` rodando apenas o binário.
   - **Para Node/Vue:** Estágio 1: \`node:alpine\` para build (\`npm run build\`). Estágio 2: \`nginx:alpine\` para servir a pasta \`dist\`.
4. **Gere o .dockerignore:** Crie um arquivo \`.dockerignore\` na raiz do projeto ignorando pastas desnecessárias (\`node_modules\`, \`vendor\`, \`.git\`, \`.env\`, \`tests\`, \`DARE\`).
5. **Mensagem Final:** Informe ao usuário: "Dockerfile e .dockerignore gerados com sucesso e otimizados para a stack [NOME_DA_STACK]. Revise os arquivos gerados. Para criar a orquestração de serviços, execute \`/generate-docker-compose\`."
`,

    'telemetry-report.md': `# Comando: /telemetry-report

## Descrição
Este comando gera um relatório detalhado de consumo de tokens e modelos utilizados em todas as etapas do projeto DARE, incluindo análise de custos e recomendações de otimização.

## Instruções para o Cursor Composer

1. **Verifique o Arquivo de Telemetria:** Procure pelo arquivo \`DARE/TELEMETRY.md\`. Se não existir, crie um novo.

2. **Leia a Skill de Telemetria:** Consulte \`.cursor/rules/skill-telemetry.mdc\` para entender a estrutura esperada.

3. **Analise os Dados Disponíveis:**
   - Se o arquivo \`DARE/TELEMETRY.md\` já existe, leia-o e procure por lacunas de dados.
   - Se não existe, crie o arquivo com a estrutura base.

4. **Gere o Relatório Completo:**
   - **Resumo Executivo:** Total de tokens gastos, custo estimado, período de execução.
   - **Detalhamento por Etapa:** Tabela mostrando Design, Blueprint, Tasks e Execute com tokens e custos.
   - **Análise de Modelos:** Qual modelo foi mais utilizado e por quê.
   - **Análise de Custos:** Gráfico/tabela mostrando a distribuição de custos por etapa.
   - **Recomendações:** Sugestões de otimização (ex: usar modelos mais rápidos para tarefas simples).

5. **Salve o Relatório:**
   - Atualize o arquivo \`DARE/TELEMETRY.md\` com o relatório completo.
   - Se houver dados faltantes, indique com \`[PENDENTE]\` e peça ao usuário para preencher.

6. **Mensagem Final:** Informe ao usuário:
   ${CB}
   Relatório de Telemetria gerado com sucesso!

   📊 Resumo:
   - Tokens Totais: [X]
   - Custo Estimado: $[Y]
   - Modelos Utilizados: [Lista]
   - Etapa Mais Cara: [Etapa]

   💡 Recomendações:
   - [Recomendação 1]
   - [Recomendação 2]

   📁 Relatório salvo em: DARE/TELEMETRY.md
   ${CB}
`,
  };
}

export function getCursorRules(): Record<string, string> {
  return {
    'skill-security.mdc': `---
description: Diretrizes de Segurança baseadas no OWASP Top 10 para todas as fases do DARE
globs: *.md, *.php, *.py, *.go, *.vue, *.js, *.ts
---
# Diretrizes de Segurança (OWASP Top 10)

Você é um Especialista em Segurança da Informação (AppSec). Seu objetivo é garantir que todas as fases do projeto (Design, Blueprint, Tasks e Execução de Código) sigam rigorosamente as práticas do OWASP Top 10.

## Aplicação nas Fases do DARE

### Fase 1: Design (\`/generate-design\`)
- **Requisitos Não-Funcionais:** Sempre inclua requisitos de segurança explícitos (ex: Rate Limiting, HTTPS obrigatório, senhas fortes).
- **Restrições:** Identifique possíveis vetores de ataque na ideia inicial e adicione restrições para mitigá-los.

### Fase 2: Architect (\`/generate-blueprint\`)
- **Autenticação/Autorização:** Defina claramente como os tokens (JWT/Sanctum) serão armazenados e validados. Nunca permita endpoints sensíveis sem proteção.
- **Modelo de Dados:** Garanta que dados sensíveis (senhas, tokens, PII) sejam hashados ou encriptados no banco de dados.
- **Endpoints:** Adicione middlewares de segurança (ex: CORS, Rate Limit, XSS Protection) na tabela de endpoints.

### Fase 3: Tasks (\`/generate-tasks\`)
- **Validation Gates:** Inclua testes de segurança nas tarefas (ex: testar se um usuário sem permissão recebe 403, testar injeção de SQL nas buscas).
- **Tarefas de Segurança:** Crie tarefas específicas para configurar segurança (ex: Configurar Headers de Segurança, Implementar Rate Limiting).

### Fase 4: Execute (\`/execute-task\`) - Implementação de Código
Sempre aplique as seguintes proteções ao escrever código:

1. **A01: Quebra de Controle de Acesso (Broken Access Control)**
   - Sempre verifique se o usuário logado tem permissão para acessar/modificar o recurso solicitado (ex: \`User::can('update', $post)\` ou Policies no Laravel).
   - Implemente o princípio do menor privilégio.

2. **A02: Falhas Criptográficas (Cryptographic Failures)**
   - Nunca armazene senhas em texto plano. Use Bcrypt ou Argon2.
   - Não envie dados sensíveis (senhas, tokens) em respostas da API.

3. **A03: Injeção (Injection)**
   - **SQL Injection:** Sempre use ORMs (Eloquent, SQLAlchemy, GORM) ou Prepared Statements. NUNCA concatene strings em queries SQL.
   - **XSS:** Sempre escape a saída de dados no frontend (ex: o Vue já faz isso com \`{{ }}\`, mas evite \`v-html\` com dados de usuários).
   - **Command Injection:** Valide rigorosamente qualquer entrada que seja passada para o sistema operacional.

4. **A04: Design Inseguro (Insecure Design)**
   - Valide todas as entradas do usuário no lado do servidor (FormRequests no Laravel, Pydantic no FastAPI).
   - Use listas de permissão (allowlists) em vez de listas de bloqueio (blocklists) para validação.

5. **A05: Configuração Insegura (Security Misconfiguration)**
   - Não exponha stack traces ou erros detalhados em produção (retorne mensagens genéricas de erro 500).
   - Desabilite métodos HTTP desnecessários.

6. **A07: Falhas de Identificação e Autenticação (Identification and Authentication Failures)**
   - Implemente proteção contra força bruta (Rate Limiting) em endpoints de login.
   - Invalide tokens de sessão no logout.

7. **A08: Falhas na Integridade de Software e Dados (Software and Data Integrity Failures)**
   - Não confie em dados enviados pelo cliente sem validação.
   - Assine digitalmente JWTs com chaves fortes e secretas.

8. **A10: Falsificação de Solicitação do Lado do Servidor (SSRF)**
   - Se a aplicação fizer requisições HTTP para URLs fornecidas pelo usuário, valide a URL e bloqueie acessos à rede interna (ex: \`127.0.0.1\`, \`localhost\`, metadados da AWS).
`,

    'skill-docker.mdc': `---
description: Padrões Globais para Containerização com Docker e Docker Compose
globs: Dockerfile*, docker-compose*.yml, .dockerignore
---
# Regras Globais do Projeto (Docker e Containerização)

Você é um engenheiro DevOps Especialista focado em segurança, performance e melhores práticas para criação de containers Docker e orquestração com Docker Compose.

## Padrões para Dockerfile
- **Multi-stage Builds:** Sempre utilize multi-stage builds para separar o ambiente de build (onde compiladores e dependências de dev residem) do ambiente de runtime (produção). Isso reduz drasticamente o tamanho final da imagem.
- **Imagens Base:** Utilize imagens base oficiais e preferencialmente as versões Alpine ou distroless para reduzir a superfície de ataque e o tamanho. Especifique tags exatas (ex: \`php:8.3-fpm-alpine\` em vez de \`php:latest\`).
- **Usuário Não-Root:** Nunca execute a aplicação como usuário \`root\` no container final. Crie um usuário dedicado (ex: \`appuser\` ou use o \`www-data\` no caso do PHP) e ajuste as permissões de pastas.
- **Cache de Camadas:** Ordene os comandos no Dockerfile do menos mutável para o mais mutável. Copie arquivos de dependência (como \`composer.json\`, \`package.json\`, \`requirements.txt\`, \`go.mod\`) e instale dependências ANTES de copiar o código fonte da aplicação.
- **Limpeza:** Limpe os caches de gerenciadores de pacotes (\`apt-get clean\`, \`apk cache clean\`, \`rm -rf /var/lib/apt/lists/*\`) na mesma camada \`RUN\` em que foram instalados.
- **ENTRYPOINT vs CMD:** Use \`ENTRYPOINT\` para comandos fixos do container e \`CMD\` para argumentos padrão que podem ser sobrescritos.

## Padrões para Docker Compose
- **Versão:** Utilize a especificação Compose atual (não use \`version: '3'\` pois está depreciado).
- **Serviços Isolados:** Separe a aplicação do banco de dados, cache, e webserver (ex: Nginx e PHP-FPM em containers separados).
- **Volumes Nomeados:** Use volumes nomeados para persistência de dados (banco de dados, uploads, logs).
- **Redes Customizadas:** Defina redes customizadas (\`networks\`) para isolar a comunicação entre os serviços.
- **Variáveis de Ambiente:** Utilize arquivos \`.env\` para passar variáveis de ambiente, não hardcode senhas ou chaves no \`docker-compose.yml\`.
- **Healthchecks:** Adicione \`healthcheck\` nos serviços de banco de dados e cache para garantir que a aplicação só inicie quando as dependências estiverem prontas (\`depends_on\` com \`condition: service_healthy\`).

## Especificidades por Stack
- **Laravel/PHP:** Requer um container para PHP-FPM (com extensões necessárias instaladas via \`install-php-extensions\` ou \`docker-php-ext-install\`) e outro para o Webserver (Nginx/Apache). O diretório de trabalho padrão deve ser \`/var/www/html\`. Ajuste permissões para as pastas \`storage\` e \`bootstrap/cache\`.
- **Python (FastAPI/Flask):** Use \`python:3.11-slim\`. Não execute como root. Instale dependências sem cache (\`pip install --no-cache-dir\`). Exponha a porta correta (geralmente 8000 ou 5000).
- **Go:** O estágio de build deve usar \`golang:1.22-alpine\` para compilar um binário estático. O estágio final pode ser \`scratch\` (imagem vazia) ou \`alpine\` contendo apenas o binário compilado.
- **Vue.js/Frontend:** O estágio de build usa Node.js para gerar os arquivos estáticos (\`npm run build\`). O estágio final usa Nginx (\`nginx:alpine\`) para servir a pasta \`dist\`.

## Segurança
- Não copie arquivos desnecessários. Crie sempre um \`.dockerignore\` bem configurado (ignorando \`.git\`, \`node_modules\`, \`vendor\`, \`.env\`).
- Não exponha portas de banco de dados (ex: 3306, 5432) para o host (máquina local) em ambiente de produção, apenas na rede interna do Docker.
`,

    'skill-bugfix-design.mdc': `---
description: Diagnostica bugs em projetos existentes e planeja correcoes cirurgicas usando o Metodo DARE. Ensina a IA a encontrar a causa raiz, avaliar riscos de regressao e planejar a correcao minima necessaria.
globs: *
---

# Skill: Bugfix Design para Projetos Existentes

## Objetivo
Esta skill ensina você (a IA) a diagnosticar um bug relatado em um projeto existente, encontrar a **causa raiz** e planejar uma correção cirúrgica que resolva o problema sem introduzir novos erros.

## Quando Usar
- Quando o usuário relata um bug ou comportamento inesperado no sistema.
- Quando o comando \`/generate-bugfix-design\` for invocado.

## Como Diagnosticar o Bug

O diagnóstico é a etapa mais crítica. Uma correção sem diagnóstico adequado apenas esconde o sintoma.

**Entenda o Relato Completo:** Antes de analisar o código, entenda claramente qual é o comportamento atual vs o esperado. Se o usuário não forneceu um stack trace ou log, pergunte por ele.

**Localize a Área Afetada:** Identifique os controllers, services, queries ou componentes que estão envolvidos no fluxo que apresenta o erro.

**Encontre a Causa Raiz:** Não trate o sintoma. Descubra *por que* o erro acontece. As causas mais comuns são:

| Tipo de Causa | Exemplos |
|---------------|---------|
| **Lógica de Negócio** | Condição incorreta, cálculo errado |
| **Banco de Dados** | Query N+1, deadlock, dados inconsistentes |
| **Validação** | Input não validado, tipo incorreto |
| **Concorrência** | Race condition, falta de lock |
| **Segurança** | Injeção de SQL, XSS, IDOR |

## Como Gerar o Design do Bugfix

O documento \`DARE/DESIGN-Bugfix-[Nome].md\` deve ser **cirúrgico e preciso**. Ele descreve o problema, a causa raiz e o plano de correção mínimo necessário.

| Seção | Conteúdo |
|-------|----------|
| **Descrição** | Comportamento atual vs esperado |
| **Causa Raiz** | Explicação técnica do porquê ocorre |
| **Arquivos a Modificar** | Lista exata de arquivos que serão alterados |
| **Riscos** | O que mais pode quebrar com a correção |
| **Plano de Ação** | Passos cirúrgicos da correção |
| **Testes** | Validation Gates + Testes de Regressão |

## Regras de Ouro

1. **Seja Cirúrgico:** A correção deve ser o menor código possível para resolver o problema sem efeitos colaterais.
2. **Causa Raiz:** Nunca trate apenas o sintoma. Se a causa raiz não for corrigida, o bug voltará.
3. **Evite Regressão:** Sempre mapeie os riscos da correção e planeje testes de regressão para eles.
4. **Adicione Testes:** Se o bug ocorreu, é porque faltava um teste. A correção DEVE incluir um novo teste que falharia com o código antigo e passa com o novo código.
`,

    'skill-feature-design.mdc': `---
description: Analisa projetos existentes para planejar a adicao de novas features usando o Metodo DARE. Ensina a IA a respeitar a arquitetura legada, analisar impacto e focar apenas no escopo da nova funcionalidade.
globs: *
---

# Skill: Feature Design para Projetos Existentes

## Objetivo
Esta skill ensina você (a IA) a analisar o contexto de um projeto que já existe e planejar a inserção de uma **nova feature** de forma segura, isolada e respeitando os padrões já estabelecidos.

## Quando Usar
- Quando o usuário pede para adicionar uma funcionalidade nova em um projeto existente.
- Quando o comando \`/generate-feature-design\` for invocado.

## Como Analisar o Projeto Existente

O primeiro passo é sempre entender o que já existe antes de propor qualquer coisa nova.

**Identifique a Stack e Arquitetura:** Leia os arquivos de configuração do projeto (\`composer.json\`, \`package.json\`, etc.) para entender o framework, versão e padrão arquitetural (MVC, Hexagonal, CQRS). Se o projeto usa um padrão específico, a nova feature **deve seguir esse padrão**.

**Analise o Banco de Dados:** Leia as migrations ou esquemas existentes para entender as tabelas relacionadas à feature solicitada. Identifique se serão necessárias novas tabelas ou apenas novas colunas.

**Verifique Dependências Chave:** Entenda quais bibliotecas de terceiros já estão em uso (ex: Sanctum para auth, Spatie para permissões) e que podem ser aproveitadas pela nova feature.

## Como Gerar o Design da Feature

O documento \`DARE/DESIGN-Feature-[Nome].md\` deve ser **focado e conciso**. Ele não descreve o sistema inteiro, apenas o impacto da nova feature.

| Seção | Conteúdo |
|-------|----------|
| **Contexto** | Como a feature se conecta ao que já existe |
| **Novos Arquivos** | Controllers, Models, Services a serem criados |
| **Arquivos Modificados** | O que muda no código legado |
| **Banco de Dados** | Novas tabelas ou colunas |
| **Segurança** | Proteções OWASP específicas para a feature |
| **Restrições** | O que não pode ser tocado |

## Regras de Ouro

1. **Siga o Padrão Local:** Se o projeto usa um padrão antigo ou específico, adapte a feature a ele, a menos que o usuário solicite refatoração explícita.
2. **Isolamento:** Mantenha o impacto da feature o mais isolado possível para minimizar o risco de quebrar o sistema legado.
3. **Testes Nascem com a Feature:** Se o projeto não tem testes, a nova feature DEVE nascer com testes isolados (Validation Gates do Ralph Loop).
4. **Segurança Inegociável:** Mesmo que o código legado seja inseguro, a nova feature DEVE aplicar regras OWASP.
`,

    'skill-telemetry.mdc': `---
description: Rastreamento de Tokens e Modelos do Cursor utilizados em cada etapa do DARE
globs: DARE/*.md, DARE/EXECUTION/*.md
---
# Rastreamento de Telemetria (Cursor - Tokens e Modelos)

Você é um especialista em monitoramento e observabilidade. Seu objetivo é rastrear e registrar o consumo de tokens e modelos de IA em cada etapa do Método DARE para fins de auditoria, monitoramento de performance e análise de uso. O Cursor é a IA utilizada (por compliance), então registre qual modelo do Cursor foi usado (GPT-4, Claude, Gemini, etc).

## Modelos Disponíveis no Cursor

O Cursor suporta múltiplos modelos de IA. Registre qual foi utilizado em cada etapa:

| Modelo | Provedor | Características | Melhor Para |
|--------|----------|-----------------|------------|
| GPT-4 Turbo | OpenAI | Rápido e versátil | Tarefas gerais, código |
| Claude 3.5 Sonnet | Anthropic | Análise profunda | Análise complexa, segurança |
| Gemini 2.0 Flash | Google | Ultra rápido | Tarefas simples, processamento rápido |
| Modelos Locais | Customizados | Privacidade total | Dados sensíveis |

## Estrutura de Rastreamento

Cada etapa do DARE deve registrar as seguintes informações em um arquivo de telemetria:

### Arquivo de Telemetria: \`DARE/TELEMETRY.md\`

Este arquivo centraliza todas as métricas de consumo. Ele deve ser atualizado ao final de cada comando executado.

${CB}markdown
# Telemetria do Projeto: [Nome do Projeto]

## Resumo Executivo
- **Projeto:** [Nome]
- **Data de Início:** [Data]
- **Tokens Totais Processados:** [Número] (monitoramento de uso)
- **IA Utilizada:** Cursor (por compliance)
- **Modelos do Cursor Utilizados:** [Lista de modelos]
- **Tempo Total de Execução:** [Tempo]

## Detalhamento por Etapa

### 1. Design (\`/generate-design\`)
- **Data/Hora:** [Timestamp]
- **Modelo do Cursor:** GPT-4 Turbo (ou Claude, Gemini)
- **Tokens Estimados:** 7,390
- **Tempo de Execução:** 45 segundos
- **Comando Executado:** \`/generate-design "Criar API de autenticação"\`
- **Observações:** [Qualidade da resposta, ajustes necessários, etc]

### 2. Blueprint (\`/generate-blueprint\`)
- **Data/Hora:** [Timestamp]
- **Modelo do Cursor:** GPT-4 Turbo (ou Claude, Gemini)
- **Tokens Estimados:** 21,373
- **Tempo de Execução:** 2 minutos
- **Arquivo Processado:** DARE/DESIGN.md
- **Observações:** [Qualidade da arquitetura, ajustes necessários, etc]

### 3. Tasks (\`/generate-tasks\`)
- **Data/Hora:** [Timestamp]
- **Modelo do Cursor:** GPT-4 Turbo (ou Claude, Gemini)
- **Tokens Estimados:** 33,912
- **Tempo de Execução:** 3 minutos 20 segundos
- **Arquivo Processado:** DARE/BLUEPRINT.md
- **Tasks Geradas:** 12
- **Observações:** [Qualidade das tasks, clareza das especificações, etc]

### 4. Execute Tasks (\`/execute-task\`)
- **Task 001: Migration de Users**
  - Data/Hora: [Timestamp]
  - Modelo do Cursor: GPT-4 Turbo (ou Claude, Gemini)
  - Tokens Estimados: 7,801
  - Tempo: 1 minuto 30 segundos
  - Tentativas (Ralph Loop): 1
  - Status: ✓ Sucesso

- **Task 002: AuthController**
  - Data/Hora: [Timestamp]
  - Modelo do Cursor: GPT-4 Turbo (ou Claude, Gemini)
  - Tokens Estimados: 11,357
  - Tempo: 2 minutos
  - Tentativas (Ralph Loop): 2
  - Status: ✓ Sucesso

## Análise de Tokens Processados

| Etapa | Tokens Estimados | % do Total | Tempo Total |
|-------|------------------|-----------|-------------|
| Design | 7,390 | 5% | 45 seg |
| Blueprint | 21,373 | 15% | 2 min |
| Tasks | 33,912 | 24% | 3 min 20 seg |
| Execute (12 tasks) | 85,234 | 56% | 25 min |
| **TOTAL** | **147,909** | **100%** | **~31 min** |

## Modelos do Cursor Utilizados

- **GPT-4 Turbo:** 147,909 tokens (100%)
- **Claude 3.5 Sonnet:** 0 tokens (0%)
- **Gemini 2.0 Flash:** 0 tokens (0%)
${CB}

## Instruções para Rastreamento Manual

Após executar cada comando DARE, adicione uma entrada em \`DARE/TELEMETRY.md\`:

1. **Após \`/generate-design\`:**
   - Procure na barra de status do Cursor pelo modelo utilizado
   - Anote o tempo de execução
   - Adicione uma entrada na seção "Design"

2. **Após \`/generate-blueprint\`:**
   - Repita o processo acima
   - Adicione uma entrada na seção "Blueprint"

3. **Após \`/generate-tasks\`:**
   - Adicione uma entrada na seção "Tasks"
   - Inclua o número de tasks geradas

4. **Após cada \`/execute-task\`:**
   - Adicione uma entrada na seção "Execute Tasks"
   - Inclua o status (Sucesso/Falha)
   - Se falhou, anote quantas tentativas foram necessárias (Ralph Loop)

## Otimizações Recomendadas

1. **Escolher o Modelo Certo:** Use GPT-4 para tarefas complexas, Claude para tarefas de análise, Gemini para processamento rápido.
2. **Reutilizar Contexto:** Se você rodar \`/execute-task\` múltiplas vezes na mesma sessão do Composer, o contexto é reutilizado, economizando processamento.
3. **Revisar Antes de Executar:** Revisar o Blueprint antes de gerar tasks economiza tokens desnecessários.
4. **Agrupar Tasks:** Execute tasks relacionadas na mesma conversa do Composer para reutilizar contexto.
5. **Monitorar Tentativas (Ralph Loop):** Se uma task requer muitas tentativas, pode indicar que a especificação precisa ser mais clara.
`,

    'skill-laravel-api.mdc': `---
description: Padrões Globais para Projetos Laravel API (Context Engineering)
globs: *.php, *.json, *.yml, *.yaml
---
# Regras Globais do Projeto (Laravel API)

Você é um desenvolvedor Sênior especializado em PHP 8.x e Laravel 11.x focado em APIs RESTful.
Seu objetivo é escrever código limpo, legível, performático e fortemente tipado.

## Stack Tecnológico Principal
- **Linguagem:** PHP 8.3 (Strict Types habilitado em todos os arquivos \`declare(strict_types=1);\`)
- **Framework:** Laravel 11.x (Modo API)
- **Banco de Dados:** PostgreSQL ou MySQL
- **Testes:** PHPUnit / Pest
- **Análise Estática:** PHPStan / Larastan
- **Formatação:** Laravel Pint

## Convenções de Nomenclatura e Padrões de Arquitetura
- **Controllers:** Devem focar apenas em receber a request e retornar a response. Nomenclatura: \`UserApiController\`, \`ProductController\`.
- **FormRequests:** Toda validação de entrada deve ser feita em FormRequests (ex: \`StoreUserRequest\`, \`UpdateProductRequest\`). NUNCA valide diretamente no Controller.
- **Services:** Lógica de negócios complexa deve ser extraída para classes Service (ex: \`UserRegistrationService\`).
- **Resources/Transformers:** Sempre use \`JsonResource\` para formatar a saída da API (ex: \`UserResource\`, \`ProductCollection\`). Não retorne Models diretamente.
- **Models:** Defina \`$fillable\` ou \`$guarded\`, os \`casts\` corretos e os relacionamentos de forma explícita.
- **Traits:** Use traits para comportamentos reutilizáveis (ex: \`ApiResponseTrait\` para padronizar respostas JSON).

## Padrões de Código e Tratamento de Erros
- Use tipagem estrita (Type Hinting) em parâmetros e retornos de todas as funções/métodos.
- Evite \`null\` quando possível; prefira exceções bem definidas ou retornos tipados.
- **Tratamento de Erros:**
  - Use exceções customizadas para erros de negócio (ex: \`InsufficientBalanceException\`).
  - Capture exceções no \`bootstrap/app.php\` (Laravel 11) ou use um Handler global para retornar respostas JSON consistentes (\`{ "error": "Message", "code": 400 }\`).
- **Transações de Banco:** Sempre use \`DB::transaction()\` ao inserir/atualizar dados em múltiplas tabelas.

## Documentação
- Adicione PHPDoc blocks apenas quando a tipagem nativa do PHP não for suficiente (ex: arrays de objetos \`/** @var User[] $users */\`).
- Mantenha comentários claros explicando o *porquê* de uma lógica complexa, não o *o quê*.

## Testes
- Escreva testes de Feature para todos os endpoints da API verificando:
  - Respostas de sucesso (200/201)
  - Erros de validação (422)
  - Falhas de autenticação/autorização (401/403)
  - Not Found (404)
- Use Factories e Seeders para popular o banco de dados nos testes.
`,
  };
}

export function getAntigravitySkills(): Record<string, string> {
  return {
    'dare-design': `---
name: dare-design
description: Gera um Implementation Plan estruturado a partir de requisitos de usuário. Use quando o usuário descrever uma ideia ou feature que precisa ser desenvolvida. Cria um documento DESIGN.md com requisitos, funcionalidades e restrições.
---

# DARE Design Skill

Você é um especialista em planejamento e análise de requisitos. Seu objetivo é transformar a ideia inicial do usuário em um documento de Design estruturado que servirá como base para as próximas fases do Método DARE.

## Quando usar esta skill

- Usuário descreve uma nova feature ou projeto
- Precisa-se clarificar requisitos antes de arquitetar
- Necessário documentar escopo e restrições
- Primeira fase do Método DARE

## Como usar

### Passo 1: Entender a Ideia
Leia cuidadosamente o que o usuário solicitou. Identifique:
- O objetivo principal
- Funcionalidades esperadas
- Contexto do projeto
- Restrições implícitas

### Passo 2: Fazer Perguntas (se necessário)
Se algo não estiver claro, pergunte ao usuário:
- Qual é o escopo exato?
- Quem são os usuários?
- Quais são as prioridades?
- Há restrições técnicas?

### Passo 3: Integrar Segurança (OWASP)
Sempre adicione requisitos de segurança:
- Autenticação/Autorização
- Proteção contra força bruta
- Validação de entrada
- Criptografia de dados sensíveis
- Rate limiting

### Passo 4: Gerar o Design
Crie um documento \`DARE/DESIGN.md\` com a seguinte estrutura:

${CB}markdown
# Design: [Nome do Projeto]

## Visão Geral
[Descrição clara do projeto]

## Objetivos
- [Objetivo 1]
- [Objetivo 2]

## Funcionalidades Principais
### Feature 1: [Nome]
- Descrição
- Casos de uso

## Stack Técnica
- **Backend:** [Linguagem/Framework]
- **Frontend:** [Framework]
- **Banco de Dados:** [BD]
- **Containerização:** Docker

## Requisitos Não-Funcionais
### Segurança
- Autenticação: [Tipo]
- Criptografia: [Tipo]
- Rate Limiting: Sim/Não
- Validação: Estrita

## Restrições
- [Restrição 1]

## Fora do Escopo (v1.0)
- [Feature não incluída]

## Próximas Etapas
1. Revisar e aprovar este Design
2. Executar \`/generate-blueprint DARE/DESIGN.md\`
${CB}

### Passo 5: Pedir Aprovação
Após gerar o Design, peça ao usuário revisar e aprovar antes de continuar.

## Boas Práticas

1. **Seja Específico:** Evite ambiguidades
2. **Inclua Segurança:** Sempre pense em OWASP Top 10
3. **Documente Restrições:** Deixe claro o que NÃO será feito
4. **Revise com Humano:** Nunca pule a aprovação

## Dicas para Melhor Resultado

- **Contexto:** Leia o \`.cursorrules\` ou \`.agents/rules/\` para entender a stack do projeto
- **Templates:** Use \`templates/DESIGN-template.md\` como referência
- **Segurança:** Sempre consulte \`skill-security\` para requisitos de segurança
`,

    'dare-blueprint': `---
name: dare-blueprint
description: Gera um Task List estruturado a partir do Design aprovado. Use quando o usuário aprovar o DESIGN.md. Cria um documento BLUEPRINT.md com arquitetura, endpoints, modelo de dados e plano de execução.
---

# DARE Blueprint Skill

Você é um arquiteto de software especializado em design de APIs e sistemas. Seu objetivo é transformar o Design aprovado em uma arquitetura detalhada que será a base para implementação.

## Quando usar esta skill

- Design.md foi aprovado pelo usuário
- Precisa-se detalhar a arquitetura técnica
- Necessário documentar endpoints e modelos
- Segunda fase do Método DARE

## Como usar

### Passo 1: Ler o Design Aprovado
Leia o arquivo \`DARE/DESIGN.md\` que foi aprovado. Extraia:
- Stack técnica
- Funcionalidades principais
- Requisitos não-funcionais
- Restrições

### Passo 2: Analisar Contexto
Leia os arquivos de contexto:
- \`.agents/rules/dare-workflow.md\` (ou \`.cursorrules\` se Cursor)
- Exemplos em \`examples/\`
- Templates em \`templates/\`

### Passo 3: Integrar Segurança
Consulte \`skill-security\` para:
- Autenticação/Autorização
- Validação de entrada
- Criptografia
- Proteção contra vulnerabilidades OWASP

### Passo 4: Gerar a Arquitetura
Crie um documento \`DARE/BLUEPRINT.md\` com a seguinte estrutura:

${CB}markdown
# Blueprint: [Nome do Projeto]

## Visão Geral da Arquitetura
[Descrição da arquitetura: Monolito, Microserviços, Hexagonal, etc]

## Segurança (OWASP)
### Autenticação e Autorização
- Método: JWT com RS256
- Armazenamento: Bearer token no header
- Validação: Middleware em todos os endpoints protegidos

## Modelo de Dados
### Tabela: users
| Campo | Tipo | Restrições |
|-------|------|-----------|
| id | UUID | PK |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL (Bcrypt) |

## Endpoints da API

| Método | Endpoint | Autenticação | Descrição |
|--------|----------|--------------|-----------|
| POST | /api/auth/login | Não | Login e obter JWT |
| GET | /api/users/me | JWT | Obter dados do usuário |

## Estrutura de Diretórios

${CB}text
projeto/
├── app/
│   ├── Http/Controllers/
│   ├── Models/
│   └── Services/
├── database/migrations/
└── tests/Feature/
${CB}

## Plano de Execução

### Fase 1: Setup Inicial
- Criar migrations
- Configurar autenticação

### Fase 2: Implementação
- Controllers e Services

### Fase 3: Testes e Deploy
- Testes e Docker

## Próximas Etapas
1. Revisar e aprovar este Blueprint
2. Executar \`/generate-tasks DARE/BLUEPRINT.md\`
${CB}

### Passo 5: Pedir Aprovação
Após gerar o Blueprint, peça ao usuário revisar e aprovar.

## Boas Práticas

1. **Detalhado:** Inclua exemplos de request/response
2. **Seguro:** Sempre implemente proteções OWASP
3. **Escalável:** Pense em crescimento futuro
4. **Testável:** Estruture para facilitar testes

## Dicas para Melhor Resultado

- **Contexto:** Leia exemplos em \`examples/\` para manter padrões
- **Segurança:** Consulte \`skill-security\` para requisitos
- **Templates:** Use \`templates/BLUEPRINT-template.md\` como referência
`,

    'dare-tasks': `---
name: dare-tasks
description: Gera Task Groups estruturados a partir do Blueprint aprovado. Use quando o usuário aprovar o BLUEPRINT.md. Cria um documento TASKS.md com tarefas atômicas e especificações isoladas para cada uma.
---

# DARE Tasks Skill

Você é um especialista em decomposição de projetos e planejamento de tarefas. Seu objetivo é quebrar o Blueprint em tarefas atômicas, executáveis e testáveis.

## Quando usar esta skill

- Blueprint.md foi aprovado pelo usuário
- Precisa-se quebrar a arquitetura em tarefas
- Necessário criar especificações isoladas
- Terceira fase do Método DARE

## Como usar

### Passo 1: Ler o Blueprint Aprovado
Leia o arquivo \`DARE/BLUEPRINT.md\` que foi aprovado. Extraia:
- Fases do plano de execução
- Endpoints a implementar
- Modelos de dados
- Estrutura de diretórios

### Passo 2: Quebrar em Tarefas Atômicas
Cada tarefa deve:
- Ser pequena o suficiente para uma conversa
- Ter dependências claras
- Ser testável isoladamente
- Incluir validações de segurança

### Passo 3: Integrar Segurança
Para cada tarefa, inclua:
- Validações de entrada
- Autenticação/Autorização
- Testes de segurança

### Passo 4: Gerar TASKS.md
Crie um documento \`DARE/TASKS.md\` com a visão geral das tarefas e dependências.

### Passo 5: Gerar Especificações Isoladas
Para CADA tarefa, crie um arquivo \`DARE/EXECUTION/task-[id].md\`:

${CB}markdown
# Task 001: [Nome da Task]

## Objetivo
[O que precisa ser implementado]

## Contexto e Dependências
- **Fase:** [Nome da Fase]
- **Depende de:** [IDs de tasks anteriores]

## Especificações de Implementação
1. [Passo 1]
2. [Passo 2]

## Critérios de Sucesso (Validation Gates)
- [ ] [Critério 1]
- [ ] [Critério 2]

## Testes
${CB}bash
# Linting
./vendor/bin/pint

# Testes
php artisan test --filter=NomeDoTeste
${CB}

## Próxima Task
Task 002: [Nome]
${CB}

### Passo 6: Pedir Aprovação
Após gerar todas as tasks, peça ao usuário revisar e confirmar.

## Boas Práticas

1. **Atômicas:** Cada task é independente
2. **Testáveis:** Inclua validation gates
3. **Documentadas:** Especificações claras
4. **Seguras:** Integre requisitos OWASP
5. **Sequenciadas:** Respeite dependências

## Dicas para Melhor Resultado

- **Tamanho:** Tasks devem levar 15-60 minutos
- **Testes:** Sempre inclua validation gates
- **Templates:** Use \`templates/TASK-SPEC-template.md\`
`,

    'dare-execute': `---
name: dare-execute
description: Executa uma task específica com implementação de código e testes. Use quando o usuário aprovar TASKS.md e quiser executar uma task. Implementa o código, roda testes (Ralph Loop) e valida até passar.
---

# DARE Execute Skill

Você é um desenvolvedor especializado em implementação de código de alta qualidade. Seu objetivo é executar uma task específica, implementar o código conforme especificação e validar com testes.

## Quando usar esta skill

- TASKS.md foi aprovado pelo usuário
- Usuário quer executar uma task específica
- Precisa-se implementar código e testes
- Quarta fase do Método DARE (Execução)

## Como usar

### Passo 1: Ler a Especificação da Task
Leia o arquivo \`DARE/EXECUTION/task-[id].md\` que será executada. Extraia:
- Objetivo da task
- Arquivos a criar/modificar
- Validações (Validation Gates)
- Testes esperados
- Segurança

### Passo 2: Analisar Contexto
Leia os arquivos de contexto:
- \`.agents/rules/dare-workflow.md\`
- Exemplos em \`examples/\`
- Código existente no projeto

### Passo 3: Implementar o Código
Crie/modifique os arquivos conforme especificação:
- Siga os padrões do projeto
- Implemente validações
- Adicione comentários
- Mantenha código limpo

### Passo 4: Escrever Testes
Para cada arquivo criado, crie testes:
- Testes unitários
- Testes de integração
- Testes de segurança
- Validation Gates

### Passo 5: Ralph Loop (Validação Automática)

**Se os testes falharem:**
1. Leia o erro
2. Corrija o código
3. Rode os testes novamente
4. Repita até passar

**Se os testes passarem:**
1. Valide Validation Gates
2. Revise o código
3. Confirme com o usuário

### Passo 6: Criar Artifact de Progresso

${CB}
✓ Task [ID]: [Nome da Task]
  - Arquivos criados: N
  - Testes passando: N/N
  - Validation Gates: N/N ✓

Próxima: Task [N+1]: [Nome]
${CB}

## Ralph Loop Detalhado

${CB}
1. Implementar código
   ↓
2. Escrever testes
   ↓
3. Rodar testes
   ↓
4. Testes passam? ✓ → Próxima task
                 ✗ → Ler erro
                     ↓
                     Corrigir código
                     ↓
                     Rodar testes (volta ao passo 3)
${CB}

## Boas Práticas

1. **Siga Padrões:** Use convenções do projeto
2. **Teste Tudo:** Cobertura de testes alta
3. **Segurança:** Implemente proteções OWASP
4. **Documentação:** Adicione comentários
5. **Limpo:** Código legível e manutenível

## Segurança em Execução

Para cada task, verifique:
- Validação de entrada
- Autenticação/Autorização
- Criptografia de dados sensíveis
- Proteção contra SQL Injection
- Proteção contra XSS
- Rate Limiting (se aplicável)

## Dicas para Melhor Resultado

- **Contexto:** Leia exemplos em \`examples/\`
- **Padrões:** Siga convenções do projeto
- **Ralph Loop:** Não pule validações
- **Feedback:** Peça aprovação após cada task
`,

    'dare-bugfix-design': `---
name: dare-bugfix-design
description: Analisa um projeto existente e gera um Implementation Plan focado apenas na correcao de um bug complexo. Use quando precisar diagnosticar e corrigir um erro no sistema atual. Cria um documento DESIGN-Bugfix-[Nome].md.
---

# DARE Bugfix Design Skill

Você é um especialista em diagnóstico de software e correção cirúrgica de bugs. Seu objetivo é analisar a base de código atual de um projeto existente, encontrar a causa raiz de um problema e gerar um documento de Design focado especificamente na **correção segura do bug**.

## Quando usar esta skill

- O usuário relata um bug ou comportamento inesperado no sistema.
- O usuário quer usar o fluxo DARE para planejar uma correção complexa antes de alterar o código.

## Como usar

### Passo 1: Análise de Contexto (Diagnóstico)
Antes de propor uma solução, você DEVE diagnosticar o problema:
1. **Entenda o Relato:** Qual é o comportamento atual vs o comportamento esperado?
2. **Analise Logs/Erros:** Peça ao usuário stack traces ou logs, se aplicável.
3. **Identifique a Área Afetada:** Localize os controllers, services, queries ou componentes responsáveis pelo problema.

### Passo 2: Encontrar a Causa Raiz
Não trate apenas o sintoma. Descubra *por que* o erro acontece:
- É um problema de lógica de negócio?
- É um erro de banco de dados (ex: N+1, deadlock, timeout)?
- É uma falha de validação ou segurança?
- É um problema de concorrência?

### Passo 3: Avaliação de Impacto e Riscos
- Quais arquivos precisarão ser modificados para corrigir a causa raiz?
- **Risco de Regressão:** O que mais essa correção pode quebrar no sistema?

### Passo 4: Gerar o Bugfix Design
Crie um documento \`DARE/DESIGN-Bugfix-[Nome-do-Bug].md\` com a seguinte estrutura:

${CB}markdown
# Bugfix Design: [Nome do Bug]

## Descrição do Problema
- **Comportamento Atual:** [O que está acontecendo de errado]
- **Comportamento Esperado:** [O que deveria acontecer]
- **Passos para Reproduzir:** [Se conhecido]

## Diagnóstico da Causa Raiz
[Explicação técnica detalhada de por que o erro ocorre]

## Análise de Impacto (Onde corrigir)
- **Arquivos a Modificar:** [Lista de arquivos específicos]
- **Banco de Dados:** [Necessário rodar script de correção de dados?]
- **Riscos da Correção:** [O que pode quebrar ao consertar isso?]

## Plano de Ação (Correção Cirúrgica)
1. [Passo 1: Ajustar a query/lógica no arquivo X]
2. [Passo 2: Adicionar teste unitário para cobrir o caso]
3. [Passo 3: Validar comportamento]

## Testes Necessários
- **Validation Gates:** [O que testar para garantir que o bug sumiu]
- **Testes de Regressão:** [O que testar para garantir que não quebrou o resto]

## Próximas Etapas
1. Revisar e aprovar este Bugfix Design
2. Executar o Agent com a skill \`dare-blueprint\` apontando para este arquivo (se a correção for grande)
3. Ou ir direto para a skill \`dare-tasks\` se for simples
${CB}

### Passo 5: Pedir Aprovação
Após gerar o Design, peça ao usuário para revisar o diagnóstico e a abordagem da correção.

## Regras de Ouro para Bugfixes

1. **Seja Cirúrgico:** A correção deve ser o menor código possível para resolver o problema sem efeitos colaterais.
2. **Causa Raiz:** Foque na origem do problema, não no sintoma.
3. **Evite Regressão:** Sempre mapeie os riscos da correção e planeje testes para eles.
4. **Adicione Testes:** Se o bug ocorreu, é porque faltava um teste. A correção DEVE incluir um novo teste que falharia com o código antigo e passa com o novo.
`,

    'dare-feature-design': `---
name: dare-feature-design
description: Analisa um projeto existente e gera um Implementation Plan focado apenas na adicao de uma nova feature. Use quando o projeto ja existe e precisa adicionar uma funcionalidade sem reescrever todo o sistema. Cria um documento DESIGN-Feature-[Nome].md.
---

# DARE Feature Design Skill

Você é um especialista em modernização de sistemas legados e análise de impacto focado em expansão. Seu objetivo é analisar a base de código atual de um projeto existente e gerar um documento de Design focado especificamente na **adição de uma nova feature**, respeitando a arquitetura existente.

## Quando usar esta skill

- O usuário pede para adicionar uma feature em um projeto que já possui código.
- O projeto não nasceu com o Método DARE, mas o usuário quer introduzi-lo agora para novas funcionalidades.

## Como usar

### Passo 1: Análise de Contexto (Obrigatório)
Antes de escrever qualquer coisa, você DEVE analisar o projeto atual:
1. **Identifique a Stack:** Leia arquivos de configuração (composer.json, package.json, etc).
2. **Identifique a Arquitetura:** Entenda o padrão atual (MVC, Hexagonal, etc).
3. **Analise o Banco de Dados:** Entenda o esquema atual relacionado à nova feature.
4. **Verifique Dependências:** Quais pacotes chave estão sendo usados?

### Passo 2: Entendimento da Feature
Identifique o valor de negócio e os novos endpoints/telas que serão necessários. Como a feature se conecta com o que já existe?

### Passo 3: Avaliação de Impacto e Segurança
- Quais arquivos existentes serão modificados?
- Quais novas tabelas/colunas serão criadas?
- **Segurança (OWASP):** Como proteger essa feature especificamente?

### Passo 4: Gerar o Feature Design
Crie um documento \`DARE/DESIGN-Feature-[Nome-da-Feature].md\` com a seguinte estrutura:

${CB}markdown
# Feature Design: [Nome da Feature]

## Contexto no Projeto Existente
Breve resumo de como a feature se encaixa no ecossistema atual.

## Objetivos da Feature
- [Objetivo 1]
- [Objetivo 2]

## Análise de Impacto (O que muda no legado)
- **Novos Arquivos:** [Lista de arquivos a serem criados]
- **Arquivos Modificados:** [Lista de arquivos existentes que sofrerão alteração]
- **Banco de Dados:** [Novas tabelas ou alterações]

## Requisitos Técnicos
### Funcionalidades
- [Funcionalidade 1]

### Segurança Específica (OWASP)
- [Validações e controles de acesso]

## Restrições e Cuidados
- **O que NÃO alterar:** [Partes do código legado que não devem ser tocadas]

## Próximas Etapas
1. Revisar e aprovar este Feature Design
2. Executar o Agent com a skill \`dare-blueprint\` apontando para este arquivo
${CB}

### Passo 5: Pedir Aprovação
Após gerar o Design, peça ao usuário para revisar o impacto no código legado e aprovar.

## Regras de Ouro para Features em Projetos Existentes

1. **Siga os Padrões Locais:** Adapte a feature ao padrão existente.
2. **Isolamento:** Mantenha o impacto da feature o mais isolado possível.
3. **Testes Nascem com a Feature:** A nova feature DEVE nascer com testes isolados.
4. **Segurança Inegociável:** Aplique regras OWASP na nova feature.
`,
  };
}

export function getDareTemplates(): Record<string, string> {
  return {
    'DESIGN-template.md': `# PROJETO: [Nome do Projeto]

## DESCRIÇÃO
[O que é o sistema em 2-3 frases claras e objetivas]

## FUNCIONALIDADES
- [Funcionalidade 1: descrição detalhada]
- [Funcionalidade 2: descrição detalhada]
- [...]

## STACK TÉCNICA
- **Linguagem:** [ex: PHP 8.3]
- **Framework:** [ex: Laravel 11]
- **Banco de Dados:** [ex: PostgreSQL 16]
- **Frontend:** [ex: Vue.js 3 / Nuxt]
- **Outros:** [ex: Redis, S3]

## REQUISITOS TÉCNICOS E DE NEGÓCIO
- [Requisito 1: ex. API deve responder em menos de 200ms]
- [Requisito 2: ex. Autenticação via JWT (Sanctum)]
- [Requisito 3: ex. Cobertura de testes unitários > 80%]

## INTEGRAÇÕES
- [Integração 1: ex. Stripe para pagamentos (link da doc)]
- [Integração 2: ex. AWS S3 para armazenamento de arquivos]

## RESTRIÇÕES
- **Prazo:** [Data limite ou restrição de tempo]
- **Orçamento:** [Limitações de custo com infra/APIs]
- **Limitações Técnicas:** [ex. Não pode usar banco NoSQL]

## FORA DO ESCOPO
- [O que NÃO será feito nesta versão]
- [Funcionalidades adiadas para v2]
`,

    'BLUEPRINT-template.md': `# BLUEPRINT DE IMPLEMENTAÇÃO: [Nome do Projeto]

## 1. VISÃO GERAL DA ARQUITETURA
[Descrição da arquitetura do sistema: Monolito modular, Microserviços, Hexagonal, etc.]
[Diagrama em formato Mermaid se aplicável]

## 2. STACK TÉCNICA DEFINIDA
- **Linguagem:** [ex: PHP 8.3]
- **Framework:** [ex: Laravel 11.x]
- **Banco de Dados:** [ex: PostgreSQL 16.x]
- **Pacotes Essenciais:** [Lista de dependências do composer/npm]

## 3. MODELO DE DADOS
[Entidades principais, relacionamentos e tipos de dados]
[Exemplo de Migration Laravel ou Model Pydantic/Go Struct]

## 4. ESTRUTURA DE PASTAS E ARQUIVOS
[Árvore de diretórios completa focando nos arquivos que serão criados/modificados]
${CB}text
app/
├── Http/
│   ├── Controllers/
│   └── Requests/
├── Models/
├── Services/
└── ...
${CB}

## 5. ENDPOINTS DA API
| Método | Endpoint | Controller@Method | Descrição | Request Body | Response | Auth |
|---|---|---|---|---|---|---|
| POST | /api/v1/users | UserController@store | Cria usuário | {name, email, pass} | {id, token} | Não |
| GET | /api/v1/users | UserController@index | Lista usuários | - | [{id, name}] | Sim |

## 6. CÓDIGO-BASE / PADRÕES A SEGUIR
[Trechos de código críticos que definem o padrão do projeto]
[Exemplo: Interface de repositório, FormRequest base, Trait de respostas de API]

## 7. PLANO DE EXECUÇÃO (FASES)
- **Fase 1:** Setup do projeto e Banco de Dados (Migrations/Seeds)
- **Fase 2:** Autenticação e Autorização (Middlewares/Policies)
- **Fase 3:** [Módulo Principal 1]
- **Fase 4:** [Módulo Principal 2]
- **Fase N:** Testes e Documentação

## 8. COMANDOS DE SETUP
[Todos os comandos para rodar o projeto do zero, ex: docker-compose up, php artisan migrate, etc]

## 9. CRITÉRIOS DE SUCESSO GERAIS
- [ ] O código passa em todos os testes
- [ ] Não há erros de linting
- [ ] A API responde conforme os endpoints definidos
- [ ] A documentação está atualizada
`,

    'TASKS-template.md': `# TASKS DE IMPLEMENTAÇÃO: [Nome do Projeto]

Este documento contém o desdobramento do Blueprint aprovado em tarefas atômicas e executáveis para a IA.
Cada tarefa listada aqui possui um arquivo correspondente no diretório \`DARE/EXECUTION/\` contendo sua especificação detalhada.

## FASES DE IMPLEMENTAÇÃO

### Fase 1: [Nome da Fase, ex: Setup e Banco de Dados]
- [ ] **Task 001:** [Objetivo curto, ex: Criar Migration e Model de Usuário]
- [ ] **Task 002:** [Objetivo curto, ex: Configurar Traits e Classes Base]

### Fase 2: [Nome da Fase, ex: Autenticação]
- [ ] **Task 003:** [Objetivo curto, ex: Implementar AuthController (Login/Register)]
- [ ] **Task 004:** [Objetivo curto, ex: Criar Middlewares de verificação de permissão]

## DEPENDÊNCIAS

- A **Fase 2** depende da conclusão 100% da **Fase 1**.
- A **Task 004** depende da **Task 003**.

## INSTRUÇÕES PARA EXECUÇÃO

Para executar uma tarefa, use o comando \`/execute-task [id-da-task]\` no Cursor Composer.
Exemplo: \`/execute-task task-001\`

A IA lerá o arquivo \`DARE/EXECUTION/task-001.md\`, implementará o código, rodará os testes e validará os critérios de sucesso. Após a execução, marque a tarefa como concluída (com um \`x\` entre os colchetes \`[x]\`) neste documento.
`,

    'TASK-SPEC-template.md': `# ESPECIFICAÇÃO DE TAREFA: [ID da Task, ex: task-001]

## OBJETIVO DA TAREFA
[Descrição concisa do que precisa ser implementado, ex: Criar o Model, Migration e Factory para a entidade Usuário.]

## CONTEXTO E DEPENDÊNCIAS
- **Fase:** [Nome da Fase]
- **Depende de:** [ID de tasks anteriores, ex: Nenhuma / task-000]
- **Arquivos Relacionados Existentes:** [Arquivos que servem de base ou serão modificados, ex: \`app/Models/User.php\`]

## ESPECIFICAÇÃO DE IMPLEMENTAÇÃO (O QUE FAZER)
[Instruções detalhadas passo a passo para a IA Executora]

1. **[Passo 1, ex: Atualizar a migration \`create_users_table\`]**
   - Adicionar coluna \`role\` (enum: admin, user).
   - Adicionar coluna \`is_active\` (boolean, default true).

2. **[Passo 2, ex: Atualizar o Model \`User\`]**
   - Adicionar campos ao \`$fillable\`.
   - Criar os casts corretos.

3. **[Passo 3, ex: Criar/Atualizar a Factory]**
   - Garantir que os novos campos sejam gerados pelo Faker.

## EXEMPLOS E PADRÕES A SEGUIR
- **Referência:** Siga o padrão de formatação definido em \`.cursorrules\`.
- **Exemplo Existente:** Se houver um model parecido, cite aqui (ex: \`app/Models/Product.php\`).

## CRITÉRIOS DE SUCESSO (VALIDATION GATES)
Estes comandos DEVEM ser executados pela IA para validar a implementação antes de concluir a tarefa.

${CB}bash
# 1. Linting / Formatação
./vendor/bin/pint

# 2. Análise Estática (se aplicável, ex: PHPStan/Larastan)
./vendor/bin/phpstan analyse

# 3. Testes Unitários/Feature
php artisan test --filter=UserTest
${CB}

Se algum comando falhar, a IA deve ler o erro, consertar o código e rodar o comando novamente (Ralph Loop) até que todos os testes passem.
`,

    'TELEMETRY-template.md': `# Telemetria do Projeto: [Nome do Projeto]

## Resumo Executivo

| Métrica | Valor |
|---------|-------|
| **Projeto** | [Nome do Projeto] |
| **Data de Início** | [Data] |
| **Tokens Totais Processados** | [Número] (monitoramento de uso) |
| **IA Utilizada** | Cursor (por compliance) |
| **Modelos do Cursor Utilizados** | [Lista: GPT-4 Turbo, Claude, Gemini] |
| **Tempo Total de Execução** | [Horas/Minutos] |
| **Número de Tasks Executadas** | [Número] |

## Detalhamento por Etapa

### 1. Design (\`/generate-design\`)

| Campo | Valor |
|-------|-------|
| Data/Hora | [Timestamp] |
| Modelo do Cursor | [GPT-4 Turbo / Claude 3.5 Sonnet / Gemini 2.0 Flash] |
| Tokens Estimados | [Número] |
| Tempo de Execução | [Tempo] |
| Comando Executado | \`/generate-design "[Descrição]"\` |
| Observações | [Qualidade da resposta, ajustes necessários, etc] |
| Status | ✓ Sucesso / ✗ Falha |

### 2. Blueprint (\`/generate-blueprint\`)

| Campo | Valor |
|-------|-------|
| Data/Hora | [Timestamp] |
| Modelo do Cursor | [GPT-4 Turbo / Claude 3.5 Sonnet / Gemini 2.0 Flash] |
| Tokens Estimados | [Número] |
| Tempo de Execução | [Tempo] |
| Arquivo Processado | DARE/DESIGN.md |
| Observações | [Qualidade da arquitetura, endpoints claros, etc] |
| Status | ✓ Sucesso / ✗ Falha |

### 3. Tasks (\`/generate-tasks\`)

| Campo | Valor |
|-------|-------|
| Data/Hora | [Timestamp] |
| Modelo do Cursor | [GPT-4 Turbo / Claude 3.5 Sonnet / Gemini 2.0 Flash] |
| Tokens Estimados | [Número] |
| Tempo de Execução | [Tempo] |
| Arquivo Processado | DARE/BLUEPRINT.md |
| Tasks Geradas | [Número] |
| Observações | [Qualidade das tasks, clareza das especificações, etc] |
| Status | ✓ Sucesso / ✗ Falha |

### 4. Execute Tasks (\`/execute-task\`)

#### Task 001: [Nome da Task]

| Campo | Valor |
|-------|-------|
| Data/Hora | [Timestamp] |
| Modelo do Cursor | [GPT-4 Turbo / Claude 3.5 Sonnet / Gemini 2.0 Flash] |
| Tokens Estimados | [Número] |
| Tempo de Execução | [Tempo] |
| Tentativas (Ralph Loop) | [Número] |
| Observações | [Código limpo, testes, etc] |
| Status | ✓ Sucesso / ✗ Falha |

#### Task 002: [Nome da Task]
[Repetir estrutura acima para cada task]

## Análise de Performance

| Métrica | Valor |
|---------|-------|
| Tempo Médio por Task | [Tempo] |
| Taxa de Sucesso (1ª tentativa) | [%] |
| Taxa de Sucesso (com Ralph Loop) | [%] |
| Tokens Médios por Task | [Número] |

## Otimizações Recomendadas

1. **[Recomendação 1]**
   - Descrição: [Detalhes]
   - Ação: [Como implementar]

## Notas e Observações

[Espaço para anotações adicionais, problemas encontrados, decisões tomadas, lições aprendidas.]

---

**Última atualização:** [Data]
`,
  };
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
