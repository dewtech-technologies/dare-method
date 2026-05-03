import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { detectProject, formatDetectionReport } from '../utils/project-detector.js';
import { installDareToExistingProject } from '../utils/project-generator.js';

export const discoverCommand = new Command('discover')
  .description('Detect an existing project and install DARE methodology files')
  .option('-d, --dir <path>', 'Target directory (default: current directory)')
  .option('--check', 'Only show detection results without installing')
  .action(async (opts: { dir?: string; check?: boolean }) => {
    const targetDir = path.resolve(opts.dir ?? process.cwd());

    console.log(chalk.blue.bold('\n🔍 DARE Framework - Project Discovery\n'));
    console.log(chalk.gray(`  Scanning: ${targetDir}\n`));

    const spinner = ora('Analyzing project...').start();
    const detected = await detectProject(targetDir);
    spinner.stop();

    // ── Show detection results ─────────────────────────────────────────────
    console.log(chalk.yellow('Detection results:\n'));
    console.log(formatDetectionReport(detected));
    console.log('');

    if (opts.check) {
      if (detected.hasDare) {
        console.log(chalk.green('✅ DARE is already installed in this project.'));
        if (detected.dareConfig) {
          console.log(chalk.gray('\nCurrent dare.config.json:'));
          console.log(chalk.gray(JSON.stringify(detected.dareConfig, null, 2)));
        }
      } else {
        console.log(chalk.yellow('⚠️  DARE is not installed. Run `dare discover` without --check to install it.'));
      }
      return;
    }

    // ── Already installed — offer reconfigure ─────────────────────────────
    if (detected.hasDare) {
      console.log(chalk.green('✅ DARE is already installed in this project.\n'));

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '🔄 Reconfigure DARE (update rules and config)', value: 'reconfigure' },
            { name: '🚪 Exit', value: 'exit' },
          ],
        },
      ]);

      if (action === 'exit') return;
    }

    // ── Confirm or correct detected values ────────────────────────────────
    console.log(chalk.cyan('Confirm project details (press Enter to accept detected values):\n'));

    const structureChoices = [
      { name: '🏗️  Monorepo (backend + frontend)', value: 'monorepo' },
      { name: '⚙️  Backend only', value: 'backend' },
      { name: '🎨 Frontend only', value: 'frontend' },
      { name: '🔌 MCP Server', value: 'mcp-server' },
      { name: '❓ Unknown / Other', value: 'unknown' },
    ];

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: detected.name,
        validate: (input: string) => {
          if (!input.trim()) return 'Project name cannot be empty';
          return true;
        },
      },
      {
        type: 'list',
        name: 'structure',
        message: 'Project structure:',
        default: detected.structure !== 'unknown' ? detected.structure : 'backend',
        choices: structureChoices,
      },

      // ── MCP-specific ────────────────────────────────────────────────────
      {
        type: 'list',
        name: 'mcpLanguage',
        message: 'MCP server language:',
        when: (ans) => ans.structure === 'mcp-server',
        default: detected.mcpLanguage ?? 'node-ts',
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
        default: detected.mcpTransport ?? 'stdio',
        choices: [
          { name: '📟 stdio  (CLI tools, local agents)', value: 'stdio' },
          { name: '🌐 SSE   (web integrations, remote)', value: 'sse' },
          { name: '⚡ HTTP Stream (streamable HTTP)', value: 'http-stream' },
        ],
      },
      {
        type: 'checkbox',
        name: 'mcpFeatures',
        message: 'MCP capabilities present in this project:',
        when: (ans) => ans.structure === 'mcp-server',
        choices: [
          { name: '🔧 Tools     (callable functions)', value: 'tools', checked: true },
          { name: '📦 Resources (readable context)', value: 'resources', checked: false },
          { name: '💬 Prompts   (prompt templates)', value: 'prompts', checked: false },
        ],
        validate: (selected: string[]) => selected.length > 0 || 'Select at least one capability',
      },

      // ── Backend stack ───────────────────────────────────────────────────
      {
        type: 'list',
        name: 'backend',
        message: 'Backend stack:',
        when: (ans) => ans.structure === 'backend' || ans.structure === 'monorepo',
        default: detected.backend ?? 'node-nestjs',
        choices: [
          { name: '🦀 Rust / Axum', value: 'rust-axum' },
          { name: '🟢 Node.js / NestJS', value: 'node-nestjs' },
          { name: '🐍 Python / FastAPI', value: 'python-fastapi' },
          { name: '🐘 PHP / Laravel', value: 'php-laravel' },
          { name: '📦 Other / Not listed', value: 'other' },
        ],
      },
      {
        type: 'list',
        name: 'frontend',
        message: 'Frontend stack:',
        when: (ans) => ans.structure === 'frontend' || ans.structure === 'monorepo',
        default: detected.frontend ?? 'react',
        choices: [
          { name: '⚛️  React 18+', value: 'react' },
          { name: '💚 Vue 3+', value: 'vue' },
          { name: '💚 Nuxt 3', value: 'nuxt' },
          { name: '📦 Other / Not listed', value: 'other' },
        ],
      },

      // ── Common ──────────────────────────────────────────────────────────
      {
        type: 'list',
        name: 'ide',
        message: 'Primary IDE / Agent:',
        choices: [
          { name: '🖱️  Cursor', value: 'cursor' },
          { name: '🚀 Antigravity', value: 'antigravity' },
          { name: '🔀 Both (Hybrid)', value: 'hybrid' },
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
        type: 'confirm',
        name: 'confirmInstall',
        message: (ans) => {
          const files = buildFileList(ans);
          return `Ready to install DARE. Files to create:\n${files}\n  Proceed?`;
        },
        default: true,
      },
    ]);

    if (!answers.confirmInstall) {
      console.log(chalk.yellow('\nInstallation cancelled.\n'));
      return;
    }

    const installSpinner = ora('Installing DARE...').start();

    try {
      await installDareToExistingProject(targetDir, {
        name: answers.name,
        structure: answers.structure,
        backend: answers.backend,
        frontend: answers.frontend,
        mcpTransport: answers.mcpTransport,
        mcpLanguage: answers.mcpLanguage,
        mcpFeatures: answers.mcpFeatures,
        ide: answers.ide,
        graphrag: answers.graphrag,
        mcp: answers.mcp,
      });

      installSpinner.succeed(chalk.green('DARE installed successfully!'));

      console.log(chalk.cyan('\n📋 Next steps:\n'));
      console.log(`  ${chalk.gray('1.')} dare design "Describe what this project does"`);
      console.log(`  ${chalk.gray('2.')} dare blueprint`);
      console.log(`  ${chalk.gray('3.')} dare execute --parallel\n`);

      if (answers.structure === 'mcp-server') {
        const inspectCmd = answers.mcpLanguage === 'python'
          ? 'npx @modelcontextprotocol/inspector python main.py'
          : 'npx @modelcontextprotocol/inspector node dist/index.js';
        console.log(chalk.gray(`  Tip: test your MCP server with: ${inspectCmd}\n`));
      }
    } catch (err) {
      installSpinner.fail(chalk.red('Failed to install DARE'));
      console.error(err);
      process.exit(1);
    }
  });

function buildFileList(ans: Record<string, unknown>): string {
  const files: string[] = [
    '    · dare.config.json',
    '    · DARE/ (README.md, EXECUTION/)',
  ];

  const ide = ans.ide as string;
  if (ide === 'cursor' || ide === 'hybrid') {
    files.push('    · .cursorrules');
    files.push('    · .cursor/rules/ + .cursor/commands/');
  }
  if (ide === 'antigravity' || ide === 'hybrid') {
    files.push('    · .antigravityrules');
    files.push('    · .agents/skills/ + .agents/workflows/');
  }

  return files.join('\n');
}
