import fs from 'fs-extra';
import path from 'path';
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
  getCursorCommands,
  getCursorRules,
  getAntigravitySkills,
  getDareTemplates,
} from './templates.js';

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
}

export async function generateProjectStructure(config: ProjectConfig): Promise<void> {
  const { outputDir, name, structure, backend, frontend, ide, graphrag, mcp } = config;

  await fs.ensureDir(outputDir);

  // Create DARE directory
  await fs.ensureDir(path.join(outputDir, 'DARE'));
  await fs.ensureDir(path.join(outputDir, 'DARE', 'EXECUTION'));

  // Write dare.config.json
  const configData: Record<string, unknown> = { name, structure, backend, frontend, ide, graphrag, mcp, version: '0.1.0' };
  if (structure === 'mcp-server') {
    configData.mcpTransport = config.mcpTransport;
    configData.mcpLanguage = config.mcpLanguage;
    configData.mcpFeatures = config.mcpFeatures;
  }
  await fs.writeJSON(path.join(outputDir, 'dare.config.json'), configData, { spaces: 2 });

  // Write .gitignore
  const gitignoreExtras = structure === 'mcp-server' && config.mcpLanguage === 'python'
    ? '\n__pycache__/\n*.py[cod]\n.venv/\n'
    : '';
  await fs.writeFile(
    path.join(outputDir, '.gitignore'),
    `node_modules/\ndist/\nbuild/\n*.db\n*.db-shm\n*.db-wal\n.env\n.env.local\n.dare/\nlogs/\n*.log\n${gitignoreExtras}`
  );

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

  // Generate project templates
  if (structure === 'mcp-server') {
    await generateMcpTemplate(outputDir, config);
  } else {
    if (structure !== 'frontend' && backend) {
      const backendDir = structure === 'monorepo' ? path.join(outputDir, 'backend') : outputDir;
      await generateBackendTemplate(backendDir, backend);
    }
    if (structure !== 'backend' && frontend) {
      const frontendDir = structure === 'monorepo' ? path.join(outputDir, 'frontend') : outputDir;
      await generateFrontendTemplate(frontendDir, frontend);
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

  const configData: Record<string, unknown> = { name, structure, backend, frontend, ide, graphrag, mcp, version: '0.1.0', installedAt: new Date().toISOString() };
  if (structure === 'mcp-server') {
    configData.mcpTransport = config.mcpTransport;
    configData.mcpLanguage = config.mcpLanguage;
    configData.mcpFeatures = config.mcpFeatures;
  }
  await fs.writeJSON(path.join(outputDir, 'dare.config.json'), configData, { spaces: 2 });

  await fs.writeFile(path.join(outputDir, 'DARE', 'README.md'), generateSharedConfig(name));
  await writeDareTemplates(outputDir);

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
// ─────────────────────────────────────────────────────────────────────────────
async function writeCursorFiles(dir: string, config: ProjectConfig): Promise<void> {
  const { structure, backend, frontend } = config;

  await fs.ensureDir(path.join(dir, '.cursor', 'rules'));
  await fs.ensureDir(path.join(dir, '.cursor', 'commands'));

  // ── Real commands (all 9) ──────────────────────────────────────────────────
  const commands = getCursorCommands();
  for (const [filename, content] of Object.entries(commands)) {
    await fs.writeFile(path.join(dir, '.cursor', 'commands', filename), content);
  }

  // ── Core rules (always written for every project) ─────────────────────────
  const rules = getCursorRules();
  const coreRules = ['skill-security.mdc', 'skill-docker.mdc', 'skill-bugfix-design.mdc', 'skill-feature-design.mdc', 'skill-telemetry.mdc'];
  for (const ruleName of coreRules) {
    await fs.writeFile(path.join(dir, '.cursor', 'rules', ruleName), rules[ruleName]);
  }

  // ── Stack-specific rules ───────────────────────────────────────────────────
  if (structure === 'mcp-server') {
    await fs.writeFile(
      path.join(dir, '.cursor', 'rules', 'skill-mcp-server.mdc'),
      generateMcpStackSkill(config.mcpLanguage || 'node-ts')
    );
  } else {
    if (backend === 'php-laravel') {
      // Use real Laravel skill from implementations
      await fs.writeFile(path.join(dir, '.cursor', 'rules', 'skill-laravel-api.mdc'), rules['skill-laravel-api.mdc']);
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
// ─────────────────────────────────────────────────────────────────────────────
async function writeAntigravityFiles(dir: string, _config: ProjectConfig): Promise<void> {
  const skills = getAntigravitySkills();

  for (const [skillName, content] of Object.entries(skills)) {
    const skillDir = path.join(dir, '.agents', 'skills', skillName);
    await fs.ensureDir(skillDir);
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content);
  }

  await fs.ensureDir(path.join(dir, '.agents', 'workflows'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: write all DARE template files into templates/
// ─────────────────────────────────────────────────────────────────────────────
async function writeDareTemplates(dir: string): Promise<void> {
  const templatesDir = path.join(dir, 'templates');
  await fs.ensureDir(templatesDir);

  const templates = getDareTemplates();
  for (const [filename, content] of Object.entries(templates)) {
    await fs.writeFile(path.join(templatesDir, filename), content);
  }
}

async function generateClaudeFiles(dir: string, config: ProjectConfig): Promise<void> {
  const { structure, backend, frontend, graphrag, mcp } = config;

  // CLAUDE.md — principal arquivo de contexto do Claude Code
  const claudeMdContent = structure === 'mcp-server'
    ? generateMcpClaudeCodeRules({ mcpTransport: config.mcpTransport, mcpLanguage: config.mcpLanguage, mcpFeatures: config.mcpFeatures, graphrag, mcp })
    : generateClaudeCodeRules({ backend, frontend, graphrag, mcp });

  await fs.writeFile(path.join(dir, 'CLAUDE.md'), claudeMdContent);

  // .claude/commands/ — slash commands
  await fs.ensureDir(path.join(dir, '.claude', 'commands'));
  const commands = generateClaudeCommands(structure);
  for (const [filename, content] of Object.entries(commands)) {
    await fs.writeFile(path.join(dir, '.claude', 'commands', filename), content);
  }

  // .claude/settings.json — permissões e hooks
  await fs.writeFile(
    path.join(dir, '.claude', 'settings.json'),
    generateClaudeSettings({ backend, frontend, structure })
  );
}

async function generateBackendTemplate(dir: string, stack: string): Promise<void> {
  await fs.ensureDir(path.join(dir, 'src'));

  switch (stack) {
    case 'rust-axum':
      await fs.writeFile(path.join(dir, 'Cargo.toml'), `[package]\nname = "api"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\naxum = "0.7"\ntokio = { version = "1", features = ["full"] }\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n`);
      await fs.writeFile(path.join(dir, 'src', 'main.rs'), `use axum::{routing::get, Router};\n\n#[tokio::main]\nasync fn main() {\n    let app = Router::new().route("/health", get(health));\n    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();\n    axum::serve(listener, app).await.unwrap();\n}\n\nasync fn health() -> &'static str { "OK" }\n`);
      break;
    case 'node-nestjs':
      await fs.writeJSON(path.join(dir, 'package.json'), { name: 'api', version: '0.1.0', scripts: { start: 'nest start', build: 'nest build', test: 'jest' }, dependencies: { '@nestjs/core': '^10.0.0', '@nestjs/common': '^10.0.0', '@nestjs/platform-express': '^10.0.0' } }, { spaces: 2 });
      await fs.writeFile(path.join(dir, 'src', 'main.ts'), `import { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\nasync function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  await app.listen(3000);\n}\nbootstrap();\n`);
      break;
    case 'python-fastapi':
      await fs.writeFile(path.join(dir, 'main.py'), `from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/health")\ndef health():\n    return {"status": "ok"}\n`);
      await fs.writeFile(path.join(dir, 'requirements.txt'), `fastapi>=0.100.0\nuvicorn>=0.23.0\npydantic>=2.0.0\n`);
      break;
    case 'php-laravel':
      await fs.writeJSON(path.join(dir, 'composer.json'), { name: 'app/api', require: { php: '^8.2', 'laravel/framework': '^11.0' }, scripts: { 'post-install-cmd': ['@php artisan key:generate'] } }, { spaces: 2 });
      break;
  }
}

async function generateFrontendTemplate(dir: string, stack: string): Promise<void> {
  await fs.ensureDir(path.join(dir, 'src', 'components'));

  switch (stack) {
    case 'react':
      await fs.writeJSON(path.join(dir, 'package.json'), { name: 'frontend', version: '0.1.0', scripts: { dev: 'vite', build: 'vite build', test: 'vitest' }, dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' }, devDependencies: { vite: '^5.0.0', '@vitejs/plugin-react': '^4.0.0', typescript: '^5.0.0' } }, { spaces: 2 });
      await fs.writeFile(path.join(dir, 'src', 'App.tsx'), `import React from 'react';\n\nexport default function App() {\n  return <div><h1>DARE Framework - React App</h1></div>;\n}\n`);
      break;
    case 'vue':
      await fs.writeJSON(path.join(dir, 'package.json'), { name: 'frontend', version: '0.1.0', scripts: { dev: 'vite', build: 'vite build', test: 'vitest' }, dependencies: { vue: '^3.0.0' }, devDependencies: { vite: '^5.0.0', '@vitejs/plugin-vue': '^5.0.0', typescript: '^5.0.0' } }, { spaces: 2 });
      await fs.writeFile(path.join(dir, 'src', 'App.vue'), `<template>\n  <div><h1>DARE Framework - Vue App</h1></div>\n</template>\n\n<script setup lang="ts">\n// Composition API\n</script>\n`);
      break;
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

function generateStackSkill(stack: string): string {
  const skills: Record<string, string> = {
    'rust-axum': `---\ndescription: Rust/Axum API development skill\n---\n# Rust/Axum Skill\n- Use Axum for HTTP routing\n- Use Tokio for async runtime\n- Use SQLx for database\n- Run clippy and cargo test\n`,
    'node-nestjs': `---\ndescription: Node.js/NestJS development skill\n---\n# NestJS Skill\n- Use NestJS modules and DI\n- Use DTOs with class-validator\n- Write Jest tests\n`,
    'python-fastapi': `---\ndescription: Python/FastAPI development skill\n---\n# FastAPI Skill\n- Use Pydantic for validation\n- Use async endpoints\n- Write pytest tests\n`,
    'php-laravel': `---\ndescription: PHP/Laravel development skill\n---\n# Laravel Skill\n- Use FormRequests\n- Use API Resources\n- Write PHPUnit tests\n`,
    react: `---\ndescription: React development skill\n---\n# React Skill\n- Use functional components\n- Use TypeScript\n- Use React Query\n- Write Vitest tests\n`,
    vue: `---\ndescription: Vue 3 development skill\n---\n# Vue Skill\n- Use Composition API\n- Use Pinia\n- Write Vitest tests\n`,
  };
  return skills[stack] || `---\ndescription: ${stack} skill\n---\n# ${stack} Skill\n`;
}
