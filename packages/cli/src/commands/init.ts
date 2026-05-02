import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
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
        ],
      },
      {
        type: 'list',
        name: 'backend',
        message: 'Backend stack:',
        when: (ans) => ans.structure !== 'frontend',
        choices: [
          { name: '🦀 Rust / Axum', value: 'rust-axum' },
          { name: '🟢 Node.js / NestJS', value: 'node-nestjs' },
          { name: '🐍 Python / FastAPI', value: 'python-fastapi' },
          { name: '🐘 PHP / Laravel', value: 'php-laravel' },
        ],
      },
      {
        type: 'list',
        name: 'frontend',
        message: 'Frontend stack:',
        when: (ans) => ans.structure !== 'backend',
        choices: [
          { name: '⚛️  React 18+', value: 'react' },
          { name: '💚 Vue 3+', value: 'vue' },
        ],
      },
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
        message: 'Enable MCP Server for context queries?',
        default: true,
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
        ide: answers.ide,
        graphrag: answers.graphrag,
        mcp: answers.mcp,
        outputDir: path.resolve(process.cwd(), name),
      });

      spinner.succeed(chalk.green(`Project ${chalk.bold(name)} created successfully!`));

      console.log(chalk.cyan('\n📋 Next steps:\n'));
      console.log(`  ${chalk.gray('1.')} cd ${name}`);
      console.log(`  ${chalk.gray('2.')} dare design "Describe your project here"`);
      console.log(`  ${chalk.gray('3.')} dare blueprint`);
      console.log(`  ${chalk.gray('4.')} dare execute --parallel\n`);
    } catch (err) {
      spinner.fail(chalk.red('Failed to create project'));
      console.error(err);
      process.exit(1);
    }
  });
