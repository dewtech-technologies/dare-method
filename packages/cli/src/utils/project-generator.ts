import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { createRequire } from 'module';

const requireFromHere = createRequire(import.meta.url);

/** Reads the CLI's own version from its bundled package.json. */
function getFrameworkVersion(): string {
  const pkg = requireFromHere('../../package.json') as { version: string };
  return pkg.version;
}
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
import { defaultVerificationConfigForProject } from '../verification/config.js';
import { defaultHookConfigForProject } from '../hooks/config.js';
import { assertWithinCwd } from '../commands/init-validation.js';

export interface ProjectConfig {
  name: string;
  structure: 'monorepo' | 'backend' | 'frontend' | 'mcp-server';
  backend?: string;
  frontend?: string;
  mcpTransport?: 'stdio' | 'sse' | 'http-stream';
  mcpLanguage?: 'node-ts' | 'python' | 'rust' | 'go';
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
  /** single: crates/server + crates/web | multi: {slug}-core/-server/-web/-cli */
  rustWorkspaceLayout?: 'single' | 'multi';
  /** Short prefix for multi-crate names, e.g. "ars" → ars-core/ars-server/ars-web/ars-cli */
  cratePrefix?: string;
}

export async function generateProjectStructure(config: ProjectConfig): Promise<void> {
  const { outputDir, name, structure, backend, frontend, ide, graphrag, mcp } = config;

  assertWithinCwd(process.cwd(), path.resolve(outputDir));
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
    version: getFrameworkVersion(),
    // Anti-stub gates introduced in v2.17.
    // `review.onComplete` is opt-in (default off) so existing projects don't
    // change behavior on upgrade; new projects get it on.
    review: {
      onComplete: true,
      strict: false,
    },
    refine: {
      // Thresholds map heuristic score → LOW/MED/HIGH/CRITICAL. See
      // `complexity-analyzer.ts` for defaults; override per project here.
      thresholds: { low: 5, med: 12, high: 20 },
    },
    verification: defaultVerificationConfigForProject(),
    hooks: defaultHookConfigForProject(),
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
  //
  // v3.1: when bootstrap runs (the normal path), every stack — backend, MCP,
  // and rails — is fully produced by its internalized registry scaffolder in
  // `runStackBootstrap`. We must NOT overlay the legacy inline templates on
  // top (that clobbered the scaffolder's package.json/server.ts in v3.0.x).
  //
  // The legacy generators remain only as the `skipBootstrap` fallback, used by
  // tests/CI that intentionally skip the scaffold step. Frontend stacks still
  // use their own bootstrap (vite/leptos) and the legacy frontend template
  // fallback when skipped.
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

  const configData: Record<string, unknown> = { name, structure, backend, frontend, ide, graphrag, mcp, version: getFrameworkVersion(), installedAt: new Date().toISOString() };
  if (structure === 'mcp-server') {
    configData.mcpTransport = config.mcpTransport;
    configData.mcpLanguage = config.mcpLanguage;
    configData.mcpFeatures = config.mcpFeatures;
  }
  await fs.writeJSON(path.join(outputDir, 'dare.config.json'), configData, { spaces: 2 });

  await fs.writeFile(path.join(outputDir, 'DARE', 'README.md'), generateSharedConfig(name));
  await writeDareTemplates(outputDir);
  await writeGraphragConfig(outputDir, { ...config, outputDir });

  await installIdeFiles(outputDir, config);
}

/**
 * Installs the IDE-specific rules + the full set of DARE slash-commands/skills
 * for the configured IDE. Idempotent — safe to call repeatedly. Extracted so
 * brownfield commands (reverse/dna/migrate) can ensure the agent-side skills
 * exist without re-running a full init.
 */
export async function installIdeFiles(
  outputDir: string,
  config: Omit<ProjectConfig, 'outputDir'>,
): Promise<void> {
  const { structure, backend, frontend, ide, graphrag, mcp } = config;

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

/**
 * Ensures the DARE slash-commands/skills are installed for the project at
 * `targetDir`, so the two-layer workflow (CLI command + IDE skill) works.
 *
 * - If `dare.config.json` exists → refreshes the IDE files for the configured
 *   IDE (idempotent). No prompt.
 * - If it does NOT exist (brownfield project never touched by DARE) → installs
 *   for ALL supported IDEs (cursor + antigravity + claude) and writes a minimal
 *   `dare.config.json`, so the workflow works regardless of which IDE is used.
 *
 * Brownfield commands (`dare reverse` / `dna` / `migrate`) call this before
 * their analysis. `dare init` / `discover` already install skills themselves.
 */
export async function ensureDareSkills(targetDir: string): Promise<void> {
  const cfgPath = path.join(targetDir, 'dare.config.json');

  if (await fs.pathExists(cfgPath)) {
    const cfg = (await fs.readJSON(cfgPath)) as Partial<ProjectConfig>;
    const ide = (cfg.ide ?? 'hybrid') as ProjectConfig['ide'];
    await fs.ensureDir(path.join(targetDir, 'DARE', 'EXECUTION'));
    await installIdeFiles(targetDir, {
      name: cfg.name ?? path.basename(targetDir),
      structure: cfg.structure ?? 'backend',
      backend: cfg.backend,
      frontend: cfg.frontend,
      ide,
      graphrag: cfg.graphrag ?? 'sqlite',
      mcp: cfg.mcp ?? false,
      mcpTransport: cfg.mcpTransport,
      mcpLanguage: cfg.mcpLanguage,
      mcpFeatures: cfg.mcpFeatures,
    });
    return;
  }

  // No DARE config yet — install for every IDE so the agent-side skills exist
  // no matter which editor the user runs. Writes a minimal config marker.
  const name = path.basename(targetDir);
  await fs.ensureDir(path.join(targetDir, 'DARE', 'EXECUTION'));
  await fs.writeFile(path.join(targetDir, 'DARE', 'README.md'), generateSharedConfig(name));
  await writeDareTemplates(targetDir);

  for (const ide of ['hybrid', 'claude-code'] as const) {
    await installIdeFiles(targetDir, {
      name,
      structure: 'backend',
      ide,
      graphrag: 'sqlite',
      mcp: false,
    });
  }

  await fs.writeJSON(
    cfgPath,
    {
      name,
      structure: 'backend',
      ide: 'hybrid',
      graphrag: 'sqlite',
      mcp: false,
      version: getFrameworkVersion(),
      installedAt: new Date().toISOString(),
      installedBy: 'ensureDareSkills (brownfield command)',
    },
    { spaces: 2 },
  );
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
  - code_symbol
  - requirement

# Relationship types
edges:
  - depends_on
  - implements
  - uses
  - references
  - related_to
  - contains
  - extends
  - affects
  - derives_from
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
  - code_symbol
  - requirement

# Relationship types
edges:
  - depends_on
  - implements
  - uses
  - references
  - related_to
  - contains
  - extends
  - affects
  - derives_from
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
  - code_symbol
  - requirement

# Relationship types
edges:
  - depends_on
  - implements
  - uses
  - references
  - related_to
  - contains
  - extends
  - affects
  - derives_from
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
  'ruby-rails-8',
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

/** Returns the crate directory for a Rust backend/frontend inside a monorepo. */
function rustMonorepoDir(
  outputDir: string,
  crateType: 'server' | 'web',
  layout: 'single' | 'multi',
  name: string,
  cratePrefix?: string,
): string {
  if (layout === 'multi') {
    const prefix = cratePrefix?.trim() ||
      name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
    return path.join(outputDir, 'crates', `${prefix}-${crateType}`);
  }
  return path.join(outputDir, 'crates', crateType);
}

async function runStackBootstrap(config: ProjectConfig): Promise<void> {
  const { outputDir, name, structure, backend, frontend, mcpLanguage, mcpTransport, toolchain, rustWorkspaceLayout, cratePrefix } = config;
  const isRustMonorepo =
    structure === 'monorepo' &&
    backend === 'rust-axum' &&
    (frontend === 'rust-leptos' || frontend === 'rust-leptos-csr');
  const layout = rustWorkspaceLayout ?? 'single';

  // For Rust monorepo the crate name must differ per member to avoid duplicate
  // package name errors in the workspace. Single layout → "server"/"web";
  // multi layout → "{prefix}-server" / "{prefix}-web".
  const rustCrateName = (type: 'server' | 'web'): string => {
    if (!isRustMonorepo) return name;
    const prefix = cratePrefix?.trim() ||
      name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
    return layout === 'single' ? type : `${prefix}-${type}`;
  };

  // Backend / monorepo backend
  if ((structure === 'backend' || structure === 'monorepo') && backend) {
    if (!BACKEND_STACKS.has(backend as BackendStack)) {
      throw new Error(`Unsupported backend stack: ${backend}`);
    }
    const backendDir = isRustMonorepo
      ? rustMonorepoDir(outputDir, 'server', layout, name, cratePrefix)
      : structure === 'monorepo'
        ? path.join(outputDir, 'backend')
        : outputDir;
    await fs.ensureDir(backendDir);
    await bootstrapBackend({
      stack: backend as BackendStack,
      dir: backendDir,
      projectName: rustCrateName('server'),
      toolchain,
      isMonorepo: structure === 'monorepo',
    });
  }

  // Frontend / monorepo frontend
  if ((structure === 'frontend' || structure === 'monorepo') && frontend && frontend !== 'none') {
    if (!FRONTEND_STACKS.has(frontend as FrontendStack)) {
      throw new Error(`Unsupported frontend stack: ${frontend}`);
    }
    const frontendDir = isRustMonorepo
      ? rustMonorepoDir(outputDir, 'web', layout, name, cratePrefix)
      : structure === 'monorepo'
        ? path.join(outputDir, 'frontend')
        : outputDir;
    await fs.ensureDir(frontendDir);
    await bootstrapFrontend({
      stack: frontend as FrontendStack,
      dir: frontendDir,
      projectName: rustCrateName('web'),
      toolchain,
      isMonorepo: structure === 'monorepo',
    });
  }

  // MCP Server
  if (structure === 'mcp-server') {
    const lang = (mcpLanguage ?? 'node-ts') as McpLanguage;
    // ProjectConfig uses 'http-stream' historically; the scaffolder transport
    // enum is 'http'. Normalize here.
    const transport =
      mcpTransport === 'http-stream' ? 'http' : (mcpTransport ?? 'stdio');
    await bootstrapMcp({
      language: lang,
      dir: outputDir,
      projectName: name,
      toolchain,
      transport: transport as 'stdio' | 'sse' | 'http',
    });
  }

  // Combo: rust-axum + rust-leptos(csr) in monorepo → unified Cargo workspace
  if (isRustMonorepo) {
    await createRustFullstackWorkspace(outputDir, name, layout, frontend as 'rust-leptos' | 'rust-leptos-csr', cratePrefix);
  }

  console.log(chalk.green('\n✓ Stack scaffold complete.\n'));
}

async function createRustFullstackWorkspace(
  outputDir: string,
  projectName: string,
  layout: 'single' | 'multi',
  frontend: 'rust-leptos' | 'rust-leptos-csr',
  cratePrefix?: string,
): Promise<void> {
  const frontendLabel = frontend === 'rust-leptos-csr' ? 'rust-leptos-csr' : 'rust-leptos';
  console.log(chalk.cyan(`\n🦀 Creating unified Cargo workspace (rust-axum + ${frontendLabel}, ${layout})...\n`));

  const fullSlug = projectName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
  // For multi-layout use the user-supplied prefix; fall back to full slug only for single
  const slug = layout === 'multi' ? (cratePrefix?.trim() || fullSlug) : fullSlug;

  // Determine workspace members based on layout
  let members: string[];
  if (layout === 'single') {
    members = ['crates/server', 'crates/web'];
  } else {
    members = [
      `crates/${slug}-core`,
      `crates/${slug}-server`,
      `crates/${slug}-web`,
      `crates/${slug}-cli`,
    ];
  }

  // Root Cargo.toml workspace
  // Note: leptos is NOT in workspace.dependencies — features (ssr/hydrate/csr) must be
  // set per-crate to avoid conflicting feature resolution across the workspace.
  await fs.writeFile(
    path.join(outputDir, 'Cargo.toml'),
    [
      `[workspace]`,
      `resolver = "2"`,
      `members = [`,
      ...members.map((m) => `  "${m}",`),
      `]`,
      ``,
      `# CRÍTICO: NÃO definir [build] target global aqui.`,
      `# Este workspace mistura crates WASM (${layout === 'single' ? 'crates/web' : `crates/${slug}-web`}/Leptos)`,
      `# com crates nativos (${layout === 'single' ? 'crates/server' : `crates/${slug}-server`}/Axum).`,
      `# cargo-leptos gerencia wasm32-unknown-unknown internamente.`,
      ``,
      `# Shared dependencies — reference in crates via { workspace = true }`,
      `[workspace.dependencies]`,
      `tokio = { version = "1", features = ["full"] }`,
      `serde = { version = "1.0", features = ["derive"] }`,
      `serde_json = "1.0"`,
      `tracing = "0.1"`,
      `anyhow = "1.0"`,
      `thiserror = "1.0"`,
      `uuid = { version = "1.10", features = ["v4", "serde"] }`,
      ``,
    ].join('\n'),
  );

  // Root .cargo/config.toml guard
  await fs.ensureDir(path.join(outputDir, '.cargo'));
  await fs.writeFile(
    path.join(outputDir, '.cargo', 'config.toml'),
    `# DARE: Do NOT add a global [build] target here.
# This workspace mixes Leptos WASM crates with native Axum crates.
# A global target breaks one or the other — cargo-leptos manages wasm32 internally.
`,
  );

  // Multi-crate: create core and cli scaffold crates
  if (layout === 'multi') {
    await createCoreCrate(outputDir, slug);
    await createCliCrate(outputDir, slug);
  }

  // Root .gitignore
  const rootGitignore = path.join(outputDir, '.gitignore');
  const rustIgnore = ['', '# Rust / Cargo', 'target/', 'dist/', 'Cargo.lock', ''].join('\n');
  if (await fs.pathExists(rootGitignore)) {
    const existing = await fs.readFile(rootGitignore, 'utf-8');
    if (!existing.includes('target/')) {
      await fs.writeFile(rootGitignore, existing.replace(/\s+$/, '') + rustIgnore);
    }
  } else {
    await fs.writeFile(rootGitignore, rustIgnore);
  }

  console.log(chalk.green(`  ✓ Cargo workspace root created`));
  members.forEach((m) => console.log(chalk.gray(`    ${m}/`)));
  console.log(chalk.yellow(`\n  ⚠  Cargo.lock gitignored — commit it for binary deployments.\n`));
}

async function createCoreCrate(outputDir: string, slug: string): Promise<void> {
  const dir = path.join(outputDir, 'crates', `${slug}-core`);
  await fs.ensureDir(path.join(dir, 'src'));
  await fs.writeFile(
    path.join(dir, 'Cargo.toml'),
    [
      `[package]`,
      `name = "${slug}-core"`,
      `version = "0.1.0"`,
      `edition = "2021"`,
      ``,
      `[lib]`,
      ``,
      `[dependencies]`,
      `serde = { workspace = true }`,
      `serde_json = { workspace = true }`,
      `thiserror = { workspace = true }`,
      `anyhow = { workspace = true }`,
      `tracing = { workspace = true }`,
      `uuid = { workspace = true }`,
      ``,
    ].join('\n'),
  );
  await fs.writeFile(path.join(dir, 'src', 'lib.rs'), `// ${slug}-core — shared domain types and business logic\n`);
}

async function createCliCrate(outputDir: string, slug: string): Promise<void> {
  const dir = path.join(outputDir, 'crates', `${slug}-cli`);
  await fs.ensureDir(path.join(dir, 'src'));
  await fs.writeFile(
    path.join(dir, 'Cargo.toml'),
    [
      `[package]`,
      `name = "${slug}-cli"`,
      `version = "0.1.0"`,
      `edition = "2021"`,
      ``,
      `[[bin]]`,
      `name = "${slug}-cli"`,
      `path = "src/main.rs"`,
      ``,
      `[dependencies]`,
      `${slug}-core = { path = "../${slug}-core" }`,
      `clap = { version = "4", features = ["derive"] }`,
      `anyhow = { workspace = true }`,
      `tokio = { workspace = true }`,
      ``,
    ].join('\n'),
  );
  await fs.writeFile(
    path.join(dir, 'src', 'main.rs'),
    [
      `use clap::Parser;`,
      ``,
      `#[derive(Parser)]`,
      `#[command(name = "${slug}-cli")]`,
      `struct Cli {}`,
      ``,
      `#[tokio::main]`,
      `async fn main() {`,
      `    let _cli = Cli::parse();`,
      `}`,
      ``,
    ].join('\n'),
  );
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
