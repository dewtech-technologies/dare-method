import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { generateProjectStructure } from '../utils/project-generator.js';
import {
  validateProjectName,
  resolveProjectOutputDir,
} from './init-validation.js';

export const initCommand = new Command('init')
  .description('Initialize a new DARE project with interactive setup')
  .argument('[project-name]', 'Project name')
  .option('--stack <id>', 'Backend stack id (skips the interactive prompt)')
  .option('--mcp <language>', 'MCP server language: node-ts | python | rust | go')
  .option('--transport <mode>', 'MCP transport: stdio | sse | http', 'stdio')
  .option('--toolchain <mode>', 'native | docker | auto', 'auto')
  .option('--non-interactive', 'Fail instead of prompting; requires --stack or --mcp')
  .action(async (projectName: string | undefined, options: {
    stack?: string;
    mcp?: string;
    transport?: string;
    toolchain?: string;
    nonInteractive?: boolean;
  }) => {
    // ── Non-interactive path (CI / scripting / smoke tests) ──────────────────
    if (options.nonInteractive || options.stack || options.mcp) {
      await runNonInteractive(projectName, options);
      return;
    }

    console.log(chalk.blue.bold('\n🚀 DARE Framework - Project Initialization\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: projectName || 'my-dare-project',
        when: !projectName,
        validate: (input: string) => {
          const result = validateProjectName(input);
          if (!result.ok) {
            return result.error.startsWith('Error: ')
              ? result.error.slice('Error: '.length)
              : result.error;
          }
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
          { name: '🦀 Rust (beta)', value: 'rust' },
          { name: '🐹 Go (beta)', value: 'go' },
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
          { name: '💎 Ruby / Rails 8', value: 'ruby-rails-8' },
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

      // ── Rust workspace layout (only for monorepo + rust-axum + rust-leptos*) ──
      {
        type: 'list',
        name: 'rustWorkspaceLayout',
        message: 'Cargo workspace layout:',
        when: (ans) =>
          ans.structure === 'monorepo' &&
          ans.backend === 'rust-axum' &&
          (ans.frontend === 'rust-leptos' || ans.frontend === 'rust-leptos-csr'),
        choices: [
          {
            name: '📦 Single-crate  — crates/server + crates/web  (app simples, recomendado para começar)',
            value: 'single',
          },
          {
            name: '🏗️  Multi-crate   — {name}-core / {name}-server / {name}-web / {name}-cli  (produto / plataforma)',
            value: 'multi',
          },
        ],
        default: 'single',
      },

      // ── Crate prefix for multi-crate layout ──────────────────────────────
      {
        type: 'input',
        name: 'cratePrefix',
        message: 'Short crate prefix (e.g. "ars" → ars-core / ars-server / ars-web / ars-cli):',
        when: (ans) =>
          ans.structure === 'monorepo' &&
          ans.backend === 'rust-axum' &&
          (ans.frontend === 'rust-leptos' || ans.frontend === 'rust-leptos-csr') &&
          ans.rustWorkspaceLayout === 'multi',
        default: (ans: Record<string, string>) => {
          const slug = (ans.name || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
          const initials = slug.split('-').map((p: string) => p[0] ?? '').join('');
          return initials.length >= 2 ? initials : slug.slice(0, 6) || 'app';
        },
        validate: (input: string) => {
          if (!input.trim()) return 'Prefix cannot be empty';
          if (!/^[a-z][a-z0-9-]*$/.test(input.trim())) return 'Use only lowercase letters, numbers, hyphens (must start with a letter)';
          return true;
        },
      },

      // ── Common questions ──────────────────────────────────────────────────
      {
        type: 'list',
        name: 'ide',
        message: 'Primary IDE / Agent:',
        choices: [
          { name: '🤖 Claude Code', value: 'claude-code' },
          { name: '⌨️  Codex CLI', value: 'codex' },
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

    const rawName = projectName || answers.name;
    const validated = validateProjectName(rawName);
    if (!validated.ok) {
      console.error(chalk.red(validated.error));
      process.exit(1);
    }
    const name = validated.sanitized;
    const outputDir = resolveProjectOutputDir(process.cwd(), name);
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
        rustWorkspaceLayout: answers.rustWorkspaceLayout,
        cratePrefix: answers.cratePrefix,
        outputDir,
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

      const isRustMonorepo =
        answers.backend === 'rust-axum' &&
        (answers.frontend === 'rust-leptos' || answers.frontend === 'rust-leptos-csr') &&
        answers.structure === 'monorepo';
      if (isRustMonorepo) {
        const layout = answers.rustWorkspaceLayout ?? 'single';
        const sanitized = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
        console.log(chalk.cyan('🦀 Rust workspace created!'));
        if (layout === 'single') {
          console.log(chalk.gray(`   crates/server/  (rust-axum)  +  crates/web/  (${answers.frontend})`));
        } else {
          console.log(chalk.gray(`   crates/${sanitized}-core  |  crates/${sanitized}-server  |  crates/${sanitized}-web  |  crates/${sanitized}-cli`));
        }
        console.log(chalk.gray('   See .cargo/config.toml — do NOT add a global [build] target (breaks WASM + native crates).\n'));
        console.log(chalk.gray('   Tip: /dare-rust-leptos for Leptos idioms · /dare-rust-workspace for workspace decisions.\n'));
      }

      const isLeptos = answers.frontend === 'rust-leptos' || answers.frontend === 'rust-leptos-csr';
      if (isLeptos && !isRustMonorepo) {
        console.log(chalk.gray(`  Leptos tip: use /dare-rust-leptos for component patterns, server functions and workspace config.\n`));
      }
    } catch (err) {
      spinner.fail(chalk.red('Failed to create project'));
      console.error(err);
      process.exit(1);
    }
  });

// ── Non-interactive scaffolding (CI / scripting / smoke tests) ─────────────
//
// Mirrors the interactive path but takes the stack from flags. Backend stacks
// go through `--stack <id>`; MCP servers through `--mcp <language>`. Both route
// through generateProjectStructure → registry scaffolders, exactly like the
// interactive flow.
const BACKEND_STACK_IDS = new Set([
  'ruby-rails-8',
  'node-nestjs',
  'python-fastapi',
  'php-laravel',
  'rust-axum',
  'go-gin',
  'go-stdlib',
]);
const MCP_LANGUAGES = new Set(['node-ts', 'python', 'rust', 'go']);

async function runNonInteractive(
  projectName: string | undefined,
  options: { stack?: string; mcp?: string; transport?: string; toolchain?: string; nonInteractive?: boolean },
): Promise<void> {
  const rawName = projectName ?? 'my-dare-project';
  const validated = validateProjectName(rawName);
  if (!validated.ok) {
    console.error(chalk.red(validated.error));
    process.exit(1);
  }
  const name = validated.sanitized;
  const outputDir = resolveProjectOutputDir(process.cwd(), name);

  if (!options.stack && !options.mcp) {
    console.error(chalk.red('Error: --non-interactive requires --stack <id> or --mcp <language>'));
    process.exit(1);
  }
  if (options.stack && !BACKEND_STACK_IDS.has(options.stack)) {
    console.error(
      chalk.red(
        `Error: unknown stack '${options.stack}'. Valid: ${[...BACKEND_STACK_IDS].sort().join(', ')}`,
      ),
    );
    process.exit(1);
  }
  if (options.mcp && !MCP_LANGUAGES.has(options.mcp)) {
    console.error(
      chalk.red(
        `Error: unknown mcp language '${options.mcp}'. Valid: ${[...MCP_LANGUAGES].sort().join(', ')}`,
      ),
    );
    process.exit(1);
  }

  const toolchain = (options.toolchain ?? 'auto') as 'native' | 'docker' | 'auto';
  const transport = (options.transport ?? 'stdio') as 'stdio' | 'sse' | 'http';
  const spinner = ora(`Creating project ${chalk.cyan(name)}...`).start();

  try {
    if (options.mcp) {
      await generateProjectStructure({
        name,
        structure: 'mcp-server',
        mcpLanguage: options.mcp as 'node-ts' | 'python' | 'rust' | 'go',
        // ProjectConfig uses the historical 'http-stream' label; runStackBootstrap
        // normalizes it back to 'http' for the scaffolder.
        mcpTransport: transport === 'http' ? 'http-stream' : transport,
        ide: 'cursor',
        graphrag: 'sqlite',
        mcp: false,
        toolchain,
        outputDir,
      });
    } else {
      await generateProjectStructure({
        name,
        structure: 'backend',
        backend: options.stack,
        ide: 'cursor',
        graphrag: 'sqlite',
        mcp: false,
        toolchain,
        outputDir,
      });
    }
    spinner.succeed(chalk.green(`Project ${chalk.bold(name)} created.`));
    console.log(chalk.gray(`  Stack: ${options.stack ?? `mcp-${options.mcp}`}`));
  } catch (err) {
    spinner.fail(chalk.red('Failed to create project'));
    console.error(err);
    process.exit(1);
  }
}
