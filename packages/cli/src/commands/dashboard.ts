import { spawn } from 'node:child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import type { Express } from 'express';
import { createApp, finalizeApp } from '../http/app.js';
import { mountDashboardRoutes } from '../dashboard/routes.js';
import { redactToken } from '../mcp-server/middleware/auth.js';
import { resolveMcpBindHost, resolveMcpToken } from '../mcp-server/boot-config.js';

const DEFAULT_PORT = 4100;

export interface DashboardServerOptions {
  readonly projectRoot?: string;
  readonly port?: number;
  readonly host?: string;
  readonly token?: string;
  readonly openBrowser?: boolean;
}

export function createDashboardApp(projectRoot: string, token: string): Express {
  const app = createApp({ token, projectRoot, allowLoopbackWithoutToken: true });
  mountDashboardRoutes(app, { projectRoot });
  return finalizeApp(app);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  const cmd = platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}

export async function startDashboardServer(opts: DashboardServerOptions = {}): Promise<{
  url: string;
  token: string;
  close: () => Promise<void>;
}> {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const host = opts.host ?? resolveMcpBindHost();
  const port = opts.port ?? DEFAULT_PORT;
  const token = opts.token ?? resolveMcpToken();
  const app = createDashboardApp(projectRoot, token);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const addr = server.address();
      const actualPort =
        typeof addr === 'object' && addr && typeof addr.port === 'number' ? addr.port : port;
      const url = `http://${host}:${actualPort}/dashboard`;
      console.log(chalk.blue.bold('\n📊 DARE Telemetry Dashboard\n'));
      console.log(`  ${chalk.gray('Status:')}  ${chalk.green('Running')}`);
      console.log(`  ${chalk.gray('Host:')}    ${chalk.cyan(host)}`);
      console.log(`  ${chalk.gray('Port:')}    ${chalk.cyan(String(port))}`);
      console.log(`  ${chalk.gray('URL:')}     ${chalk.cyan(url)}`);
      console.log(`  ${chalk.gray('Token:')}   ${chalk.yellow(redactToken(token))}`);
      console.log(`\n  ${chalk.gray('Read-only')} — local loopback + token (reuses MCP hardening)\n`);

      if (opts.openBrowser !== false) {
        openBrowser(url);
      }

      resolve({
        url,
        token,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });

    server.on('error', reject);
  });
}

interface DashboardCommandOptions {
  port?: string;
  open?: boolean;
}

export const dashboardCommand = new Command('dashboard')
  .description('Local telemetry dashboard (read-only, loopback + token)')
  .option('--port <n>', 'HTTP port', String(DEFAULT_PORT))
  .option('--no-open', 'Do not open the browser')
  .action(async (options: DashboardCommandOptions) => {
    const port = parseInt(options.port ?? String(DEFAULT_PORT), 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      console.error(chalk.red('Invalid --port value'));
      process.exit(1);
    }

    const { close } = await startDashboardServer({
      port,
      openBrowser: options.open !== false,
    });

    const shutdown = async () => {
      console.log(chalk.yellow('\n⚠️  Shutting down dashboard...'));
      await close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
