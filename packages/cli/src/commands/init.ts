import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { generateProjectStructure } from '../utils/project-generator.js';

export const initCommand = new Command('init')
  .description('Initialize a new DARE project with interactive setup')
  .argument('[project-name]', 'Project name')
  .action(async (projectName?: string) => {
    console.log(chalk.blue.bold('\n🚀 DARE Framework - Project Initialization\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: projectName || 'my-dare-project',
        when: !projectName,
        validate: (input: string) => {
          if (!input.trim()) return 'Project name cannot be empty';
          if (!/^[a-z0-9-_]+$/.test(input)) return 'Use only lowercase letters, numbers, hyphens and underscores';
          return true;
        },
      },
      {
        type: 'list',
        name: 'structure',
        message: 'Project structure:',
        choices: [
          { name: '🏗️  Monorepo (backend + frontend)', value: 'monorepo' },
          { name: '⚙️  Backend only', value: 'backend' },
          { name: '🎨 Frontend only', value: 'frontend' },
          { name: '🔌 MCP Server', value: 'mcp-server' },
        ],
      },

      // ── MCP Server questions ──────────────────────────────────────────────
      {
        type: 'list',
        name: 'mcpLanguage',
        message: 'MCP server language:',
        when: (ans) => ans.structure === 'mcp-server',
        choices: [
          { name: '🟦 TypeScript / Node.js', value: 'node-ts' },
          { name: '🐍 Python', value: 'python' },
        ],
      },
      {
        type: 'list',
        name: 'mcpTransport',
        message: 'Transport type:',
        when: (ans) => ans.structure === 'mcp-server',
        choices: [
          { name: '📟 stdio  (CLI tools, local agents)', value: 'stdio' },
          { name: '🌐 SSE   (web integrations, remote)', value: 'sse' },
          { name: '⚡ HTTP Stream (streamable HTTP)', value: 'http-stream' },
        ],
      },
      {
        type: 'checkbox',
        name: 'mcpFeatures',
        message: 'MCP capabilities to include:',
        when: (ans) => ans.structure === 'mcp-server',
        choices: [
          { name: '🔧 Tools     (callable functions)', value: 'tools', checked: true },
          { name: '📦 Resources (readable context)', value: 'resources', checked: false },
          { name: '💬 Prompts   (prompt templates)', value: 'prompts', checked: false },
        ],
        validate: (selected: string[]) => selected.length > 0 || 'Select at least one capability',
      },

      // ── Standard backend / frontend questions ─────────────────────────────
      {
        type: 'list',
        name: 'backend',
        message: 'Backend stack:',
        when: (ans) => ans.structure !== 'frontend' && ans.structure !== 'mcp-server',
        choices: [
          { name: '🦀 Rust / Axum', value: 'rust-axum' },
          { name: '🟢 Node.js / NestJS', value: 'node-nestjs' },
          { name: '🐍 Python / FastAPI', value: 'python-fastapi' },
          { name: '🐘 PHP / Laravel', value: 'php-laravel' },
          { name: '🐹 Go / Gin', value: 'go-gin' },
          { name: '🐹 Go / stdlib (no framework, net/http only)', value: 'go-stdlib' },
        ],
      },
      {
        type: 'list',
        name: 'frontend',
        message: 'Frontend stack:',
        when: (ans) => ans.structure !== 'backend' && ans.structure !== 'mcp-server',
        choices: [
          { name: '⚛️  React 18+ (TypeScript)', value: 'react' },
          { name: '💚 Vue 3+ (Composition API)', value: 'vue' },
          { name: '🦀 Leptos fullstack (Rust SSR + WASM)', value: 'rust-leptos' },
          { name: '🦀 Leptos CSR-only (Rust WASM + trunk)', value: 'rust-leptos-csr' },
          { name: '🚫 None (backend only)', value: 'none' },
        ],
      },

      // ── Common questions ──────────────────────────────────────────────────
      {
        type: 'list',
        name: 'ide',
        message: 'Primary IDE / Agent:',
        choices: [
          { name: '🤖 Claude Code', value: 'claude-code' },
          { name: '🖱️  Cursor', value: 'cursor' },
          { name: '🚀 Antigravity', value: 'antigravity' },
          { name: '🔀 Cursor + Antigravity (Hybrid)', value: 'hybrid' },
          { name: '🔀 Claude Code + Cursor (Hybrid)', value: 'claude-hybrid' },
        ],
      },
      {
        type: 'list',
        name: 'graphrag',
        message: 'GraphRAG backend:',
        choices: [
          { name: '🗄️  SQLite (recommended - fast, local)', value: 'sqlite' },
          { name: '📄 JSON Graph (simple, no dependencies)', value: 'json' },
          { name: '🐳 Neo4j Docker (enterprise)', value: 'neo4j' },
        ],
      },
      {
        type: 'confirm',
        name: 'mcp',
        message: 'Enable DARE MCP Server for context queries?',
        default: true,
      },
      {
        type: 'list',
        name: 'toolchain',
        message: 'Toolchain for scaffolding (composer / npm / cargo / python / go):',
        choices: [
          {
            name: '🤖 Auto — use native if on PATH, else Docker (recommended)',
            value: 'auto',
          },
          {
            name: '🔧 Native only — require the CLI on PATH (faster, no Docker pulls)',
            value: 'native',
          },
          {
            name: '🐳 Docker only — always use the official image (hermetic, no host install)',
            value: 'docker',
          },
        ],
        default: 'auto',
      },
    ]);

    const name = projectName || answers.name;
    const spinner = ora(`Creating project ${chalk.cyan(name)}...`).start();

    try {
      await generateProjectStructure({
        name,
        structure: answers.structure,
        backend: answers.backend,
        frontend: answers.frontend,
        mcpTransport: answers.mcpTransport,
        mcpLanguage: answers.mcpLanguage,
        mcpFeatures: answers.mcpFeatures,
        ide: answers.ide,
        graphrag: answers.graphrag,
        mcp: answers.mcp,
        toolchain: answers.toolchain,
        outputDir: path.resolve(process.cwd(), name),
      });

      spinner.succeed(chalk.green(`Project ${chalk.bold(name)} created successfully!`));

      console.log(chalk.cyan('\n📋 Next steps:\n'));
      console.log(`  ${chalk.gray('1.')} cd ${name}`);

      if (answers.structure === 'mcp-server') {
        const installCmd = answers.mcpLanguage === 'python' ? 'pip install -r requirements.txt' : 'npm install';
        const devCmd = answers.mcpLanguage === 'python' ? 'python main.py' : 'npm run dev';
        const inspectCmd = answers.mcpLanguage === 'python'
          ? 'npx @modelcontextprotocol/inspector python main.py'
          : 'npm run inspect';
        console.log(`  ${chalk.gray('2.')} ${installCmd}`);
        console.log(`  ${chalk.gray('3.')} dare design "Describe what this MCP server exposes"`);
        console.log(`  ${chalk.gray('4.')} dare blueprint`);
        console.log(`  ${chalk.gray('5.')} dare execute --parallel`);
        console.log(`  ${chalk.gray('6.')} ${inspectCmd}  ${chalk.gray('← test with MCP Inspector')}`);
        console.log(`  ${chalk.gray('7.')} ${devCmd}\n`);
      } else {
        console.log(`  ${chalk.gray('2.')} dare design "Describe your project here"`);
        console.log(`  ${chalk.gray('3.')} dare blueprint`);
        console.log(`  ${chalk.gray('4.')} dare execute --parallel\n`);
      }

      const isClaudeCode = answers.ide === 'claude-code' || answers.ide === 'claude-hybrid';
      if (isClaudeCode) {
        console.log(chalk.gray(`  Claude Code tip: use /dare-design, /dare-blueprint, /dare-execute as slash commands\n`));
      }

      const isRustFullstack =
        answers.backend === 'rust-axum' &&
        answers.frontend === 'rust-leptos' &&
        answers.structure === 'monorepo';
      if (isRustFullstack) {
        console.log(chalk.cyan('🦀 Rust full-stack workspace created!'));
        console.log(chalk.gray('   Cargo.toml workspace unifies backend/ and frontend/ into a single Cargo workspace.'));
        console.log(chalk.gray('   See .cargo/config.toml — do NOT add a global [build] target (breaks WASM + native crates).\n'));
        console.log(chalk.gray('   Tip: use /dare-rust-leptos for Leptos idioms and /dare-rust-workspace for multi-crate decisions.\n'));
      }

      const isLeptos = answers.frontend === 'rust-leptos' || answers.frontend === 'rust-leptos-csr';
      if (isLeptos && !isRustFullstack) {
        console.log(chalk.gray(`  Leptos tip: use /dare-rust-leptos for component patterns, server functions and workspace config.\n`));
      }
    } catch (err) {
      spinner.fail(chalk.red('Failed to create project'));
      console.error(err);
      process.exit(1);
    }
  });
