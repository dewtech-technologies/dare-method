#!/usr/bin/env node

import { createMcpServer } from '../server.js';
import chalk from 'chalk';

const PORT = parseInt(process.env.DARE_MCP_PORT || '3000', 10);
const PROJECT_PATH = process.env.DARE_PROJECT_PATH || process.cwd();

const app = createMcpServer(PROJECT_PATH);

const server = app.listen(PORT, () => {
  console.log(chalk.blue.bold('\n🔌 DARE MCP Server\n'));
  console.log(`  ${chalk.gray('Status:')}  ${chalk.green('Running')}`);
  console.log(`  ${chalk.gray('Port:')}    ${chalk.cyan(PORT)}`);
  console.log(`  ${chalk.gray('Project:')} ${chalk.cyan(PROJECT_PATH)}`);
  console.log(`\n  ${chalk.gray('Endpoints:')}`);
  console.log(`  ${chalk.cyan('GET')}  /health`);
  console.log(`  ${chalk.cyan('GET')}  /tools`);
  console.log(`  ${chalk.cyan('POST')} /context/query`);
  console.log(`  ${chalk.cyan('GET')}  /blueprint`);
  console.log(`  ${chalk.cyan('GET')}  /dag`);
  console.log(`  ${chalk.cyan('GET')}  /tasks/:taskId`);
  console.log(`  ${chalk.cyan('PUT')}  /tasks/:taskId`);
  console.log(`  ${chalk.cyan('GET')}  /project\n`);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n⚠️  Shutting down MCP Server...'));
  server.close(() => process.exit(0));
});
