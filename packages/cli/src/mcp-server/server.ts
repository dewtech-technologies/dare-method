import { type Express } from 'express';
import { createApp, finalizeApp } from '../http/app.js';
import {
  mountContextRoutes,
  type ContextQuery,
  type ContextResult,
  type TaskStatus,
} from '../serve/routes/context.js';

export type { ContextQuery, ContextResult, TaskStatus };

export interface McpServerOptions {
  authToken?: string;
  allowLoopbackWithoutToken?: boolean;
}

export function createMcpServer(
  projectRoot: string = process.env.DARE_PROJECT_PATH || process.cwd(),
  options: McpServerOptions = {},
): Express {
  const authToken = options.authToken ?? process.env.DARE_MCP_TOKEN ?? 'dare-mcp-dev-token';

  const app = createApp({
    token: authToken,
    projectRoot,
    allowLoopbackWithoutToken: options.allowLoopbackWithoutToken ?? true,
  });

  mountContextRoutes(app, projectRoot);

  return finalizeApp(app);
}
