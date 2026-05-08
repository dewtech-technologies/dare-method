import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import {
  generateCursorRules,
  generateAntigravityRules,
  generateSharedConfig,
  generateMcpCursorRules,
  generateMcpAntigravityRules,
  generateClaudeCodeRules,
  generateMcpClaudeCodeRules,
  generateClaudeCommands,
  generateClaudeSettings,
} from './templates.js';
import {
  bootstrapBackend,
  bootstrapFrontend,
  bootstrapMcp,
  type BackendStack,
  type FrontendStack,
  type McpLanguage,
  type ToolchainMode,
} from './stack-bootstrap.js';

export interface ProjectConfig {
  name: string;
  structure: 'monorepo' | 'backend' | 'frontend' | 'mcp-server';
  backend?: string;
  frontend?: string;
  mcpTransport?: 'stdio' | 'sse' | 'http-stream';
  mcpLanguage?: 'node-ts' | 'python';
  mcpFeatures?: ('tools' | 'resources' | 'prompts')[];
  ide: 'cursor' | 'antigravity' | 'hybrid' | 'claude-code' | 'claude-hybrid';
  graphrag: 'sqlite' | 'json' | 'neo4j';
  mcp: boolean;
  outputDir: string;
  /**
   * Skip the official scaffold step (composer create-project, npm create vite,
   * etc.). Useful in tests and CI where the toolchains are not installed.
   * Defaults to false — i.e., scaffolding is the normal path.
   */
  skipBootstrap?: boolean;
  /**
   * Toolchain preference for the scaffold step (and reused by `dare bootstrap`):
   *   - `auto`   (default): use native CLI if on PATH, otherwise Docker.
   *   - `native`: require composer/npm/cargo/python/go on PATH; fail otherwise.
   *   - `docker`: always run via the official Docker image, even if native is available.
   */
  toolchain?: ToolchainMode;
}

export async function generateProjectStructure(config: ProjectConfig): Promise<void> {
  const { outputDir, name, structure, backend, frontend, ide, graphrag, mcp } = config;

  await fs.ensureDir(outputDir);

  // 0) Run the official scaffold for the chosen stack BEFORE laying down DARE
  //    artifacts. The scaffold needs an empty (or near-empty) directory.
  if (!config.skipBootstrap) {
    await assertOutputDirIsEmpty(config);
    await runStackBootstrap(config);
  }

  // Create DARE directory
  await fs.ensureDir(path.join(outputDir, 'DARE'));
  await fs.ensureDir(path.join(outputDir, 'DARE', 'EXECUTION'));

  // Write dare.config.json
  const configData: Record<string, unknown> = {
    name,
    structure,
    backend,
    frontend,
    ide,
    graphrag,
    mcp,
    toolchain: config.toolchain ?? 'auto',
    version: '0.1.0',
  };
  if (structure === 'mcp-server') {
    configData.mcpTransport = config.mcpTransport;
    configData.mcpLanguage = config.mcpLanguage;
    configData.mcpFeatures = config.mcpFeatures;
  }
  await fs.writeJSON(path.join(outputDir, 'dare.config.json'), configData, { spaces: 2 });

  // Merge .gitignore — preserves whatever the official scaffold wrote and
  // appends DARE-specific entries (avoids losing framework-aware rules like
  // /vendor, /node_modules variants, /storage/*.key, etc).
  const dareExtras = [
    '',
    '# DARE Framework',
    '.dare/',
    '*.db',
    '*.db-shm',
    '*.db-wal',
    'DARE/.canvas.md',
    structure === 'mcp-server' && config.mcpLanguage === 'python'
      ? '.venv/\n__pycache__/\n*.py[cod]'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const gitignorePath = path.join(outputDir, '.gitignore');
  if (await fs.pathExists(gitignorePath)) {
    const existing = await fs.readFile(gitignorePath, 'utf-8');
    if (!existing.includes('# DARE Framework')) {
      await fs.writeFile(gitignorePath, existing.replace(/\s+$/, '') + '\n' + dareExtras + '\n');
    }
  } else {
    await fs.writeFile(
      gitignorePath,
      [
        'node_modules/',
        'dist/',
        'build/',
        '.env',
        '.env.local',
        'logs/',
        '*.log',
        dareExtras,
      ].join('\n') + '\n',
    );
  }

  // Cursor rules
  if (ide === 'cursor' || ide === 'hybrid') {
    const cursorRulesContent = structure === 'mcp-server'
      ? generateMcpCursorRules({ mcpTransport: config.mcpTransport, mcpLanguage: config.mcpLanguage, mcpFeatures: config.mcpFeatures, graphrag, mcp })
      : generateCursorRules({ backend, frontend, graphrag, mcp });

    await fs.writeFile(path.join(outputDir, '.cursorrules'), cursorRulesContent);
    await writeCursorFiles(outputDir, config);
  }

  // Claude Code files
  if (ide === 'claude-code' || ide === 'claude-hybrid') {
    await generateClaudeFiles(outputDir, config);
  }

  // Antigravity rules
  if (ide === 'antigravity' || ide === 'hybrid') {
    const antigravityContent = structure === 'mcp-server'
      ? generateMcpAntigravityRules({ mcpTransport: config.mcpTransport, mcpLanguage: config.mcpLanguage, mcpFeatures: config.mcpFeatures, graphrag, mcp })
      : generateAntigravityRules({ backend, frontend, graphrag, mcp });

    await fs.writeFile(path.join(outputDir, '.antigravityrules'), antigravityContent);
    await writeAntigravityFiles(outputDir, config);
  }

  // Write shared DARE README and templates
  await fs.writeFile(path.join(outputDir, 'DARE', 'README.md'), generateSharedConfig(name));
  await writeDareTemplates(outputDir);

  // Write graphrag config
  await writeGraphragConfig(outputDir, config);

  // Project source code is now produced by the official scaffold (run earlier
  // in `runStackBootstrap`). The legacy fake templates are only used when
  // bootstrap is explicitly skipped (tests / CI without toolchains) or for
  // the MCP server, which has no widely-adopted scaffold to defer to.
  if (config.skipBootstrap) {
    if (structure === 'mcp-server') {
      await generateMcpTemplate(outputDir, config);
    } else {
      if (structure !== 'frontend' && backend) {
        const backendDir =
          structure === 'monorepo' ? path.join(outputDir, 'backend') : outputDir;
        await generateBackendTemplate(backendDir, backend);
      }
      if (structure !== 'backend' && frontend) {
        const frontendDir =
          structure === 'monorepo' ? path.join(outputDir, 'frontend') : outputDir;
        await generateFrontendTemplate(frontendDir, frontend);
      }
    }
  } else if (structure === 'mcp-server') {
    // Even with bootstrap, the MCP server still needs the DARE-flavored
    // starter (server.ts / main.py with the right transport wired up). The
    // bootstrap step only ran `npm init` / `python -m venv`, no source code.
    await generateMcpTemplate(outputDir, config);
  }
}

export async function installDareToExistingProject(
  projectDir: string,
  config: Omit<ProjectConfig, 'outputDir'>
): Promise<void> {
  const outputDir = projectDir;
  const { name, structure, backend, frontend, ide, graphrag, mcp } = config;

  await fs.ensureDir(path.join(outputDir, 'DARE'));
  await fs.ensureDir(path.join(outputDir, 'DARE', 'EXECUTION'));

  const configData: Record<string, unknown> = { name, structure, backend, frontend, ide, graphrag, mcp, version: '0.1.0', installedAt: new Date().toISOString() };
  if (structure === 'mcp-server') {
    configData.mcpTransport = config.mcpTransport;
    configData.mcpLanguage = config.mcpLanguage;
    configData.mcpFeatures = config.mcpFeatures;
  }
  await fs.writeJSON(path.join(outputDir, 'dare.config.json'), configData, { spaces: 2 });

  await fs.writeFile(path.join(outputDir, 'DARE', 'README.md'), generateSharedConfig(name));
  await writeDareTemplates(outputDir);
  await writeGraphragConfig(outputDir, { ...config, outputDir });

  if (ide === 'cursor' || ide === 'hybrid') {
    const cursorRulesContent = structure === 'mcp-server'
      ? generateMcpCursorRules({ mcpTransport: config.mcpTransport, mcpLanguage: config.mcpLanguage, mcpFeatures: config.mcpFeatures, graphrag, mcp })
      : generateCursorRules({ backend, frontend, graphrag, mcp });

    await fs.writeFile(path.join(outputDir, '.cursorrules'), cursorRulesContent);
    await writeCursorFiles(outputDir, { ...config, outputDir });
  }

  if (ide === 'antigravity' || ide === 'hybrid') {
    const antigravityContent = structure === 'mcp-server'
      ? generateMcpAntigravityRules({ mcpTransport: config.mcpTransport, mcpLanguage: config.mcpLanguage, mcpFeatures: config.mcpFeatures, graphrag, mcp })
      : generateAntigravityRules({ backend, frontend, graphrag, mcp });

    await fs.writeFile(path.join(outputDir, '.antigravityrules'), antigravityContent);
    await writeAntigravityFiles(outputDir, { ...config, outputDir });
  }

  if (ide === 'claude-code' || ide === 'claude-hybrid') {
    await generateClaudeFiles(outputDir, { ...config, outputDir });
  }
}

async function generateMcpTemplate(dir: string, config: ProjectConfig): Promise<void> {
  const { mcpLanguage = 'node-ts', mcpTransport = 'stdio', mcpFeatures = ['tools'] } = config;
  await fs.ensureDir(path.join(dir, 'src'));

  if (mcpLanguage === 'node-ts') {
    const hasResources = mcpFeatures.includes('resources');
    const hasPrompts = mcpFeatures.includes('prompts');

    const capabilities: string[] = [];
    if (mcpFeatures.includes('tools')) capabilities.push('tools: {}');
    if (hasResources) capabilities.push('resources: {}');
    if (hasPrompts) capabilities.push('prompts: {}');

    const transportImport = mcpTransport === 'stdio'
      ? `import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';`
      : `import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';\nimport express from 'express';`;

    const transportSetup = mcpTransport === 'stdio'
      ? `const transport = new StdioServerTransport();\nawait server.connect(transport);`
      : `const app = express();\napp.get('/sse', async (req, res) => {\n  const transport = new SSEServerTransport('/messages', res);\n  await server.connect(transport);\n});\napp.post('/messages', express.json(), (req, res) => { /* message handler */ });\napp.listen(3000, () => console.error('MCP SSE server running on :3000'));`;

    const resourceSection = hasResources ? `
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'resource://example',
      name: 'Example Resource',
      description: 'An example resource',
      mimeType: 'text/plain',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === 'resource://example') {
    return { contents: [{ uri: request.params.uri, mimeType: 'text/plain', text: 'Example content' }] };
  }
  throw new Error(\`Unknown resource: \${request.params.uri}\`);
});
` : '';

    const promptSection = hasPrompts ? `
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'example-prompt',
      description: 'An example prompt template',
      arguments: [{ name: 'topic', description: 'Topic to write about', required: true }],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === 'example-prompt') {
    const topic = request.params.arguments?.topic ?? 'general';
    return {
      description: 'Example prompt',
      messages: [{ role: 'user', content: { type: 'text', text: \`Write about: \${topic}\` } }],
    };
  }
  throw new Error(\`Unknown prompt: \${request.params.name}\`);
});
` : '';

    const indexContent = `import { Server } from '@modelcontextprotocol/sdk/server/index.js';
${transportImport}
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: '${config.name}', version: '0.1.0' },
  { capabilities: { ${capabilities.join(', ')} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'hello',
      description: 'Says hello to a given name',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
        },
        required: ['name'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'hello') {
    const { name } = request.params.arguments as { name: string };
    return { content: [{ type: 'text', text: \`Hello, \${name}!\` }] };
  }
  throw new Error(\`Unknown tool: \${request.params.name}\`);
});
${resourceSection}${promptSection}
${transportSetup}
`;

    await fs.writeFile(path.join(dir, 'src', 'index.ts'), indexContent);

    const extraDeps: Record<string, string> = mcpTransport !== 'stdio' ? { express: '^4.18.0' } : {};
    const extraDevDeps: Record<string, string> = mcpTransport !== 'stdio' ? { '@types/express': '^4.17.0' } : {};

    await fs.writeJSON(
      path.join(dir, 'package.json'),
      {
        name: config.name,
        version: '0.1.0',
        type: 'module',
        scripts: {
          build: 'tsc',
          start: 'node dist/index.js',
          dev: 'tsx src/index.ts',
          test: 'vitest',
          inspect: `npx @modelcontextprotocol/inspector node dist/index.js`,
        },
        dependencies: {
          '@modelcontextprotocol/sdk': '^1.0.0',
          ...extraDeps,
        },
        devDependencies: {
          typescript: '^5.0.0',
          tsx: '^4.0.0',
          vitest: '^1.0.0',
          '@types/node': '^20.0.0',
          ...extraDevDeps,
        },
      },
      { spaces: 2 }
    );

    await fs.writeJSON(
      path.join(dir, 'tsconfig.json'),
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'Node16',
          moduleResolution: 'Node16',
          outDir: 'dist',
          rootDir: 'src',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
        include: ['src'],
      },
      { spaces: 2 }
    );

  } else {
    // Python MCP
    const hasResources = mcpFeatures.includes('resources');
    const hasPrompts = mcpFeatures.includes('prompts');

    const resourceSection = hasResources ? `

@mcp.resource("resource://example")
def example_resource() -> str:
    """An example resource."""
    return "Example content"
` : '';

    const promptSection = hasPrompts ? `

@mcp.prompt()
def example_prompt(topic: str) -> str:
    """An example prompt template."""
    return f"Write about: {topic}"
` : '';

    const transportLine = mcpTransport === 'stdio' ? '' : '\n# For SSE transport:\n# mcp.run(transport="sse", host="0.0.0.0", port=8000)\n';

    await fs.writeFile(
      path.join(dir, 'main.py'),
      `from mcp.server.fastmcp import FastMCP

mcp = FastMCP("${config.name}")


@mcp.tool()
def hello(name: str) -> str:
    """Says hello to a given name."""
    return f"Hello, {name}!"
${resourceSection}${promptSection}

if __name__ == "__main__":
    mcp.run()${transportLine}
`
    );

    await fs.writeFile(
      path.join(dir, 'requirements.txt'),
      `mcp>=1.0.0\n`
    );

    await fs.writeFile(
      path.join(dir, 'pyproject.toml'),
      `[project]
name = "${config.name}"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["mcp>=1.0.0"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: write all real Cursor command and rule files
// Source of truth: implementations/cursor/ → synced to templates/ide/cursor/
// ─────────────────────────────────────────────────────────────────────────────
async function writeCursorFiles(dir: string, config: ProjectConfig): Promise<void> {
  const { structure, backend, frontend } = config;
  const ideTemplatesDir = path.join(getTemplatesDir(), 'ide', 'cursor');

  await fs.ensureDir(path.join(dir, '.cursor', 'rules'));
  await fs.ensureDir(path.join(dir, '.cursor', 'commands'));

  // ── Commands: copy all from templates/ide/cursor/.cursor/commands/ ─────────
  const commandsSrc = path.join(ideTemplatesDir, '.cursor', 'commands');
  if (await fs.pathExists(commandsSrc)) {
    await fs.copy(commandsSrc, path.join(dir, '.cursor', 'commands'), { overwrite: true });
  }

  // ── Core rules: always copy all except stack-specific ones ─────────────────
  const rulesSrc = path.join(ideTemplatesDir, '.cursor', 'rules');
  if (await fs.pathExists(rulesSrc)) {
    const stackSpecific = new Set(['skill-laravel-api.mdc']);
    const entries = await fs.readdir(rulesSrc, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (stackSpecific.has(entry.name)) continue; // handled below based on stack
      await fs.copy(
        path.join(rulesSrc, entry.name),
        path.join(dir, '.cursor', 'rules', entry.name),
        { overwrite: true },
      );
    }
  }

  // ── Stack-specific rules ───────────────────────────────────────────────────
  if (structure === 'mcp-server') {
    await fs.writeFile(
      path.join(dir, '.cursor', 'rules', 'skill-mcp-server.mdc'),
      generateMcpStackSkill(config.mcpLanguage || 'node-ts')
    );
  } else {
    if (backend === 'php-laravel') {
      const laravelRule = path.join(rulesSrc, 'skill-laravel-api.mdc');
      if (await fs.pathExists(laravelRule)) {
        await fs.copy(laravelRule, path.join(dir, '.cursor', 'rules', 'skill-laravel-api.mdc'), { overwrite: true });
      }
    } else if (backend) {
      await fs.writeFile(
        path.join(dir, '.cursor', 'rules', `skill-${backend}.mdc`),
        generateStackSkill(backend)
      );
    }
    if (frontend) {
      await fs.writeFile(
        path.join(dir, '.cursor', 'rules', `skill-${frontend}.mdc`),
        generateStackSkill(frontend)
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: write all real Antigravity SKILL.md files
// Source of truth: implementations/antigravity/ → synced to templates/ide/antigravity/
// ─────────────────────────────────────────────────────────────────────────────
async function writeAntigravityFiles(dir: string, _config: ProjectConfig): Promise<void> {
  const ideTemplatesDir = path.join(getTemplatesDir(), 'ide', 'antigravity');
  const skillsSrc = path.join(ideTemplatesDir, '.agents', 'skills');

  if (await fs.pathExists(skillsSrc)) {
    await fs.ensureDir(path.join(dir, '.agents', 'skills'));
    await fs.copy(skillsSrc, path.join(dir, '.agents', 'skills'), { overwrite: true });
  }

  await fs.ensureDir(path.join(dir, '.agents', 'workflows'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: write dare-graph.yml — graphrag configuration
// ─────────────────────────────────────────────────────────────────────────────
async function writeGraphragConfig(dir: string, config: ProjectConfig): Promise<void> {
  const { graphrag } = config;

  let content: string;

  if (graphrag === 'sqlite') {
    content = `# DARE Knowledge Graph — SQLite
backend: sqlite

sqlite:
  path: .dare/graph.db

# Node types tracked in the graph
nodes:
  - task
  - file
  - schema
  - endpoint
  - component
  - entity
  - concept

# Relationship types
edges:
  - depends_on
  - implements
  - uses
  - references
  - related_to
  - contains
  - extends
`;
  } else if (graphrag === 'neo4j') {
    content = `# DARE Knowledge Graph — Neo4j
backend: neo4j

neo4j:
  url: http://localhost:7474   # Neo4j HTTP API endpoint (not Bolt)
  database: dare               # database name
  username: neo4j
  password: password
  # auth: "Bearer <token>"     # alternative to username/password

# Node types tracked in the graph
nodes:
  - task
  - file
  - schema
  - endpoint
  - component
  - entity
  - concept

# Relationship types
edges:
  - depends_on
  - implements
  - uses
  - references
  - related_to
  - contains
  - extends
`;
  } else {
    // json
    content = `# DARE Knowledge Graph — JSON
backend: json

json:
  path: .dare/graph.json

# Node types tracked in the graph
nodes:
  - task
  - file
  - schema
  - endpoint
  - component
  - entity
  - concept

# Relationship types
edges:
  - depends_on
  - implements
  - uses
  - references
  - related_to
  - contains
  - extends
`;
  }

  const destPath = path.join(dir, 'dare-graph.yml');
  if (!await fs.pathExists(destPath)) {
    await fs.writeFile(destPath, content);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: write all DARE template files into templates/
// Source of truth: implementations/cursor/templates/ (or antigravity/templates/)
// ─────────────────────────────────────────────────────────────────────────────
async function writeDareTemplates(dir: string): Promise<void> {
  const destDir = path.join(dir, 'templates');
  await fs.ensureDir(destDir);

  // Use cursor templates as canonical source (identical to antigravity)
  const templatesSrc = path.join(getTemplatesDir(), 'ide', 'cursor', 'templates');
  if (await fs.pathExists(templatesSrc)) {
    await fs.copy(templatesSrc, destDir, { overwrite: true });
  }
}

async function generateClaudeFiles(dir: string, config: ProjectConfig): Promise<void> {
  const { structure, backend, frontend, graphrag, mcp } = config;
  const ideTemplatesDir = path.join(getTemplatesDir(), 'ide', 'claude');

  // CLAUDE.md — copiar de implementations/claude/ (com fallback para gerar dinâmico)
  const claudeMdSrc = path.join(ideTemplatesDir, 'CLAUDE.md');
  if (await fs.pathExists(claudeMdSrc)) {
    await fs.copy(claudeMdSrc, path.join(dir, 'CLAUDE.md'), { overwrite: true });
  } else {
    const claudeMdContent = structure === 'mcp-server'
      ? generateMcpClaudeCodeRules({ mcpTransport: config.mcpTransport, mcpLanguage: config.mcpLanguage, mcpFeatures: config.mcpFeatures, graphrag, mcp })
      : generateClaudeCodeRules({ backend, frontend, graphrag, mcp });
    await fs.writeFile(path.join(dir, 'CLAUDE.md'), claudeMdContent);
  }

  // .claude/commands/ — copiar de implementations/claude/.claude/commands/
  const commandsSrc = path.join(ideTemplatesDir, '.claude', 'commands');
  await fs.ensureDir(path.join(dir, '.claude', 'commands'));
  if (await fs.pathExists(commandsSrc)) {
    await fs.copy(commandsSrc, path.join(dir, '.claude', 'commands'), { overwrite: true });
  } else {
    const commands = generateClaudeCommands(structure);
    for (const [filename, content] of Object.entries(commands)) {
      await fs.writeFile(path.join(dir, '.claude', 'commands', filename), content);
    }
  }

  // .claude/settings.json — sempre dinâmico (depende do stack)
  await fs.writeFile(
    path.join(dir, '.claude', 'settings.json'),
    generateClaudeSettings({ backend, frontend, structure })
  );
}

// Resolve templates directory (works both locally and after npm install)
function getTemplatesDir(): string {
  return path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), '..', '..', '..', 'templates');
}

async function copyTemplate(templatePath: string, destDir: string, projectName: string): Promise<void> {
  if (!await fs.pathExists(templatePath)) return;

  await fs.copy(templatePath, destDir, {
    overwrite: false,
    filter: () => true,
  });

  // Replace {{PROJECT_NAME}} placeholder in all text files
  await replaceProjectName(destDir, projectName);
}

async function replaceProjectName(dir: string, projectName: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const textExts = new Set(['.ts', '.tsx', '.vue', '.js', '.json', '.php', '.py', '.toml', '.yaml', '.yml', '.md', '.env', '.example', '.txt', '.rs', '.html']);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await replaceProjectName(fullPath, projectName);
    } else {
      const ext = path.extname(entry.name);
      if (textExts.has(ext) || entry.name.startsWith('.')) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          if (content.includes('{{PROJECT_NAME}}')) {
            await fs.writeFile(fullPath, content.split('{{PROJECT_NAME}}').join(projectName));
          }
        } catch {
          // skip binary files
        }
      }
    }
  }
}

async function generateBackendTemplate(dir: string, stack: string, projectName = 'api'): Promise<void> {
  const templatesDir = getTemplatesDir();
  const stackMap: Record<string, string> = {
    'node-nestjs': 'node-nestjs',
    'python-fastapi': 'python-fastapi',
    'rust-axum': 'rust-axum',
    'php-laravel': 'php-laravel',
  };
  const templateName = stackMap[stack];
  if (templateName) {
    await copyTemplate(path.join(templatesDir, 'backend', templateName), dir, projectName);
  }
  // Copy shared docker-compose
  const sharedCompose = path.join(templatesDir, 'shared', 'docker-compose.yml');
  if (await fs.pathExists(sharedCompose)) {
    await fs.copy(sharedCompose, path.join(dir, 'docker-compose.yml'), { overwrite: false });
    await replaceProjectName(dir, projectName);
  }
}

async function generateFrontendTemplate(dir: string, stack: string, projectName = 'frontend'): Promise<void> {
  const templatesDir = getTemplatesDir();
  const stackMap: Record<string, string> = {
    react: 'react',
    vue: 'vue',
    'rust-leptos': 'leptos-fullstack',
    'rust-leptos-csr': 'leptos-csr',
  };
  const templateName = stackMap[stack];
  if (templateName) {
    await copyTemplate(path.join(templatesDir, 'frontend', templateName), dir, projectName);
  }
}

function generateMcpStackSkill(language: string): string {
  if (language === 'python') {
    return `---
description: Python MCP server development skill
---
# Python MCP Skill
- Use FastMCP for rapid server development
- Decorate tools with @mcp.tool(), resources with @mcp.resource(), prompts with @mcp.prompt()
- Use type hints — FastMCP derives the JSON schema automatically
- Test with: npx @modelcontextprotocol/inspector python main.py
- Use mcp.run() for stdio, mcp.run(transport="sse") for SSE
`;
  }
  return `---
description: Node.js/TypeScript MCP server development skill
---
# TypeScript MCP Skill
- Import Server from @modelcontextprotocol/sdk/server/index.js
- Use StdioServerTransport for CLI tools, SSEServerTransport for web integrations
- Define tools with ListToolsRequestSchema + CallToolRequestSchema handlers
- Keep inputSchema strict — Claude uses it to call your tools correctly
- Test with: npm run inspect (uses @modelcontextprotocol/inspector)
- Build before shipping: npm run build
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stack bootstrap orchestration
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_STACKS = new Set<BackendStack>([
  'php-laravel',
  'node-nestjs',
  'python-fastapi',
  'rust-axum',
  'go-gin',
  'go-stdlib',
]);
const FRONTEND_STACKS = new Set<FrontendStack>(['react', 'vue', 'rust-leptos', 'rust-leptos-csr']);

/**
 * Official scaffolders (composer create-project, npx degit, cargo init,
 * `npm create`, etc.) all refuse to run inside a directory that already
 * has files. We check for that BEFORE running the scaffold so the user gets
 * a single clear error — not a cryptic stack trace from inside Composer or
 * Cargo. We tolerate `.git` because some users initialize a repo first.
 */
async function assertOutputDirIsEmpty(config: ProjectConfig): Promise<void> {
  const dirsToCheck: string[] = [];

  if (config.structure === 'mcp-server' || config.structure === 'frontend') {
    dirsToCheck.push(config.outputDir);
  } else if (config.structure === 'backend') {
    dirsToCheck.push(config.outputDir);
  } else if (config.structure === 'monorepo') {
    if (config.backend) dirsToCheck.push(path.join(config.outputDir, 'backend'));
    if (config.frontend) dirsToCheck.push(path.join(config.outputDir, 'frontend'));
  }

  for (const dir of dirsToCheck) {
    if (!(await fs.pathExists(dir))) continue;
    const entries = (await fs.readdir(dir)).filter(
      (e) => e !== '.git' && e !== '.gitkeep',
    );
    if (entries.length > 0) {
      const preview = entries.slice(0, 8).join(', ');
      const more = entries.length > 8 ? `, … (+${entries.length - 8})` : '';
      throw new Error(
        `Target directory is not empty: ${dir}\n` +
          `  Found: ${preview}${more}\n\n` +
          `Likely cause: a previous \`dare init\` for this project failed midway and left files behind.\n` +
          `Resolve by either:\n` +
          `  1) Removing the directory and trying again:  Remove-Item -Recurse -Force "${dir}"\n` +
          `  2) Choosing a different project name.\n` +
          `  3) Running \`dare bootstrap --force\` if you want to reuse the existing directory and overwrite framework files.`,
      );
    }
  }
}

async function runStackBootstrap(config: ProjectConfig): Promise<void> {
  const { outputDir, name, structure, backend, frontend, mcpLanguage, toolchain } = config;

  // Backend / monorepo backend
  if ((structure === 'backend' || structure === 'monorepo') && backend) {
    if (!BACKEND_STACKS.has(backend as BackendStack)) {
      throw new Error(`Unsupported backend stack: ${backend}`);
    }
    const backendDir =
      structure === 'monorepo' ? path.join(outputDir, 'backend') : outputDir;
    await fs.ensureDir(backendDir);
    await bootstrapBackend({
      stack: backend as BackendStack,
      dir: backendDir,
      projectName: name,
      toolchain,
    });
  }

  // Frontend / monorepo frontend
  if ((structure === 'frontend' || structure === 'monorepo') && frontend) {
    if (!FRONTEND_STACKS.has(frontend as FrontendStack)) {
      throw new Error(`Unsupported frontend stack: ${frontend}`);
    }
    const frontendDir =
      structure === 'monorepo' ? path.join(outputDir, 'frontend') : outputDir;
    await fs.ensureDir(frontendDir);
    await bootstrapFrontend({
      stack: frontend as FrontendStack,
      dir: frontendDir,
      projectName: name,
      toolchain,
      isMonorepo: structure === 'monorepo',
    });
  }

  // MCP Server
  if (structure === 'mcp-server') {
    const lang = (mcpLanguage ?? 'node-ts') as McpLanguage;
    await bootstrapMcp({
      language: lang,
      dir: outputDir,
      projectName: name,
      toolchain,
    });
  }

  // Combo: rust-axum + rust-leptos in monorepo → unify into a single Cargo workspace
  if (structure === 'monorepo' && backend === 'rust-axum' && frontend === 'rust-leptos') {
    await createRustFullstackWorkspace(outputDir, name);
  }

  console.log(chalk.green('\n✓ Stack scaffold complete.\n'));
}

async function createRustFullstackWorkspace(outputDir: string, projectName: string): Promise<void> {
  console.log(chalk.cyan('\n🦀 Creating unified Cargo workspace (rust-axum + rust-leptos)...\n'));

  const sanitized = projectName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'app';

  // Root Cargo.toml workspace
  await fs.writeFile(
    path.join(outputDir, 'Cargo.toml'),
    [
      `[workspace]`,
      `resolver = "2"`,
      `members = [`,
      `  "backend",`,
      `  "frontend",`,
      `]`,
      ``,
      `# Shared dependencies — pin versions here, reference in crates via { workspace = true }`,
      `[workspace.dependencies]`,
      `tokio = { version = "1", features = ["full"] }`,
      `serde = { version = "1.0", features = ["derive"] }`,
      `serde_json = "1.0"`,
      `tracing = "0.1"`,
      `anyhow = "1.0"`,
      `thiserror = "1.0"`,
      `uuid = { version = "1.10", features = ["v4", "serde"] }`,
      `leptos = { version = "0.7", features = [] }`,
      ``,
    ].join('\n'),
  );

  // Root .cargo/config.toml — MUST NOT have global [build] target
  await fs.ensureDir(path.join(outputDir, '.cargo'));
  await fs.writeFile(
    path.join(outputDir, '.cargo', 'config.toml'),
    `# DARE: Do NOT add a global [build] target here.
# This workspace mixes Leptos WASM crates (frontend) with native crates (backend).
# A global target would make cargo try to compile Axum for wasm32 or Leptos for x86 — both fail.
# cargo-leptos manages the wasm32-unknown-unknown target for the frontend crate automatically.
`,
  );

  // Root .gitignore additions
  const rootGitignore = path.join(outputDir, '.gitignore');
  const rustIgnore = [
    '',
    '# Rust / Cargo',
    'target/',
    'dist/',
    'Cargo.lock',
    '',
  ].join('\n');
  if (await fs.pathExists(rootGitignore)) {
    const existing = await fs.readFile(rootGitignore, 'utf-8');
    if (!existing.includes('target/')) {
      await fs.writeFile(rootGitignore, existing.replace(/\s+$/, '') + rustIgnore);
    }
  } else {
    await fs.writeFile(rootGitignore, rustIgnore);
  }

  console.log(chalk.green(`  ✓ Cargo workspace root created`));
  console.log(chalk.gray(`  backend/ (rust-axum) and frontend/ (rust-leptos) are workspace members.\n`));
  console.log(chalk.yellow(`  ⚠  Cargo.lock is gitignored at root — commit it if this is a binary deployment.\n`));
}

function generateStackSkill(stack: string): string {
  const skills: Record<string, string> = {
    'rust-leptos': `---
description: Leptos fullstack (SSR + WASM) development skill
---
# Leptos Fullstack Skill
- Use \`#[component]\` macro for all components — no class components
- State: \`signal()\` (RwSignal), \`ReadSignal\`/\`WriteSignal\` — fine-grained reactivity
- Async data: \`Resource\` for fetching, never \`Effect\` that calls fetch
- Mutations: \`Action\` for server calls (forms, submits)
- Loading states: \`Suspense\` and \`Transition\` — never block the render
- Conditionals: \`Show\`, \`For\` components — not if/for in view!
- Server functions: \`#[server]\` macro — only available with \`ssr\` feature
- Shared types (server + WASM): use \`#[cfg_attr(feature = "ssr", derive(sqlx::FromRow))]\`
- Avoid: \`tokio::spawn\` on client (no async runtime in WASM), \`panic!\` in components, \`wasm_bindgen\` direct
- Build: \`cargo leptos build\` (not \`cargo build\`)
- Test: \`cargo test --workspace\` (not \`cargo leptos test\` — that doesn't exist)
- Lint: \`cargo clippy --all-targets --all-features -- -D warnings && cargo fmt --check\`
- Dev server: \`cargo leptos watch\` (port 3000 + hot reload on port 3001)
`,
    'rust-leptos-csr': `---
description: Leptos CSR (WASM + trunk) development skill
---
# Leptos CSR Skill
- Pure client-side WASM — no server rendering, no \`#[server]\` functions
- Use \`#[component]\` macro for all components
- State: \`signal()\`, \`create_memo()\` for derived state
- Async data: \`Resource\` — never \`Effect\` that calls fetch
- Entry point: \`leptos::mount::mount_to_body(App)\` called from \`main()\`
- Build tool: \`trunk build\` (NOT \`cargo leptos build\` — wrong tool for CSR)
- Dev server: \`trunk serve\` (port 3001 by default, configured in Trunk.toml)
- Test: \`cargo test --workspace\`
- Lint: \`cargo clippy --all-targets --all-features -- -D warnings && cargo fmt --check\`
- Deploy: \`trunk build --release\` produces \`dist/\` — static files, deployable to any CDN
`,
    'rust-axum': `---\ndescription: Rust/Axum API development skill\n---\n# Rust/Axum Skill\n- Use Axum for HTTP routing\n- Use Tokio for async runtime\n- Use SQLx for database\n- Run clippy and cargo test\n`,
    'go-gin': `---\ndescription: Go/Gin API development skill\n---\n# Go + Gin Skill\n- Use Gin for HTTP routing (github.com/gin-gonic/gin)\n- Project layout: cmd/api/main.go (entrypoint), internal/handlers, internal/middleware, internal/services, internal/repository\n- Use context.Context propagation in every handler/service\n- Use struct tags for binding/validation (binding:"required" on DTOs)\n- For SQL: prefer database/sql + sqlx, parametrize ALL queries, no string concat\n- Errors: return wrapped errors (fmt.Errorf("...: %w", err)), not panics\n- Tests: use net/http/httptest + table-driven tests; place *_test.go alongside the package\n- Ralph Loop: \`go build ./...\`, \`go test ./...\`, \`go vet ./...\`\n`,
    'go-stdlib': `---\ndescription: Go API development with stdlib only (no framework)\n---\n# Go stdlib Skill (net/http only)\n- Use \`net/http\` from stdlib — NO framework (no Gin, Echo, Chi, Fiber). Adding one defeats the purpose of this stack.\n- Routing: \`http.NewServeMux()\` with the Go 1.22+ pattern syntax: \`mux.HandleFunc("GET /api/v1/users/{id}", h)\`, \`mux.HandleFunc("POST /api/v1/users", h)\`. Use \`r.PathValue("id")\` to extract path params.\n- Project layout: \`cmd/api/main.go\` (entrypoint), \`internal/handlers/\`, \`internal/middleware/\`, \`internal/services/\`, \`internal/repository/\`.\n- Middleware = function wrapping http.Handler. Compose with \`middleware.Recover(middleware.Logger(mux))\` style — no framework chain.\n- JSON: \`json.NewDecoder(r.Body).Decode(&dto)\` for input, \`json.NewEncoder(w).Encode(obj)\` for output. Always set \`Content-Type: application/json\` and the status code explicitly.\n- Validation: prefer \`github.com/go-playground/validator/v10\` for struct tags (lightweight, no framework lock-in). For trivial cases, manual validation in the handler is fine.\n- Logging: \`log/slog\` from stdlib. \`slog.Info("...", "key", val)\` style. Configure JSON handler in main.\n- Context propagation: \`r.Context()\` flows through every layer. NEVER use context.Background() inside handlers.\n- For SQL: prefer \`database/sql\` + \`github.com/jmoiron/sqlx\` or \`github.com/jackc/pgx/v5\`. Parametrize ALL queries.\n- Errors: \`fmt.Errorf("doing X: %w", err)\`. Map domain errors to HTTP status in the handler layer, not deeper.\n- Tests: \`net/http/httptest\` + table-driven. \`httptest.NewRequest\` + \`httptest.NewRecorder\`. Test each handler in isolation.\n- Ralph Loop: \`go build ./...\`, \`go test ./...\`, \`go vet ./...\`.\n- Avoid: middleware libraries that pull in heavyweight deps; ORM (use sqlx); reflection-based DI (wire by hand in main).\n`,
    'node-nestjs': `---\ndescription: Node.js/NestJS development skill\n---\n# NestJS Skill\n- Use NestJS modules and DI\n- Use DTOs with class-validator\n- Write Jest tests\n`,
    'python-fastapi': `---\ndescription: Python/FastAPI development skill\n---\n# FastAPI Skill\n- Use Pydantic for validation\n- Use async endpoints\n- Write pytest tests\n`,
    'php-laravel': `---\ndescription: PHP/Laravel development skill\n---\n# Laravel Skill\n- Use FormRequests\n- Use API Resources\n- Write PHPUnit tests\n`,
    react: `---\ndescription: React development skill\n---\n# React Skill\n- Use functional components\n- Use TypeScript\n- Use React Query\n- Write Vitest tests\n`,
    vue: `---\ndescription: Vue 3 development skill\n---\n# Vue Skill\n- Use Composition API\n- Use Pinia\n- Write Vitest tests\n`,
  };
  return skills[stack] || `---\ndescription: ${stack} skill\n---\n# ${stack} Skill\n`;
}
