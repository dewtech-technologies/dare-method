#!/usr/bin/env node

import chalk from 'chalk';
import pino from 'pino';
import { createMcpServer } from '../server.js';
import { redactToken } from '../middleware/auth.js';
import {
  resolveMcpBindHost,
  resolveMcpPort,
  resolveMcpProjectPath,
  resolveMcpToken,
  shouldWarnLanExposure,
} from '../boot-config.js';

const logger = pino({ transport: { target: 'pino-pretty' } });

const PORT = resolveMcpPort();
const HOST = resolveMcpBindHost();
const PROJECT_PATH = resolveMcpProjectPath();
const TOKEN = resolveMcpToken();

if (shouldWarnLanExposure(HOST)) {
  logger.warn('DARE_MCP_BIND=0.0.0.0 exposes MCP to LAN — use only in trusted networks');
}

const app = createMcpServer(PROJECT_PATH, { authToken: TOKEN });

const server = app.listen(PORT, HOST, () => {
  const maskedToken = redactToken(TOKEN);
  console.log(chalk.blue.bold('\n🔌 DARE MCP Server\n'));
  console.log(`  ${chalk.gray('Status:')}  ${chalk.green('Running')}`);
  console.log(`  ${chalk.gray('Host:')}    ${chalk.cyan(HOST)}`);
  console.log(`  ${chalk.gray('Port:')}    ${chalk.cyan(String(PORT))}`);
  console.log(`  ${chalk.gray('Project:')} ${chalk.cyan(PROJECT_PATH)}`);
  console.log(`  ${chalk.gray('Token:')}   ${chalk.yellow(maskedToken)}`);
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
