import { randomUUID } from 'node:crypto';

export function resolveMcpBindHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.DARE_MCP_BIND ?? '127.0.0.1';
}

export function resolveMcpPort(env: NodeJS.ProcessEnv = process.env): number {
  return parseInt(env.DARE_MCP_PORT || '3000', 10);
}

export function resolveMcpProjectPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.DARE_PROJECT_PATH || process.cwd();
}

export function resolveMcpToken(env: NodeJS.ProcessEnv = process.env): string {
  return env.DARE_MCP_TOKEN ?? randomUUID();
}

export function shouldWarnLanExposure(host: string): boolean {
  return host === '0.0.0.0';
}
