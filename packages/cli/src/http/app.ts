import express, { type Express } from 'express';
import helmet from 'helmet';
import pino from 'pino';
import { createAuthMiddleware } from '../mcp-server/middleware/auth.js';
import { createCorsMiddleware } from '../mcp-server/middleware/cors.js';
import { createErrorHandler } from '../mcp-server/middleware/error-handler.js';

const logger = pino({ transport: { target: 'pino-pretty' } });

export interface AppOptions {
  readonly token: string;
  readonly projectRoot: string;
  readonly allowLoopbackWithoutToken?: boolean;
}

/**
 * Creates an Express app with the shared security middleware chain
 * (auth loopback+token, CORS allowlist, helmet, JSON body parser).
 * Mount routes on the returned app, then call `finalizeApp` to attach the error handler.
 */
export function createApp(opts: AppOptions): Express {
  const bodyLimit = process.env.DARE_MCP_BODY_LIMIT || '1mb';

  const app: Express = express();
  app.set('trust proxy', true);
  app.locals.projectRoot = opts.projectRoot;

  app.use(
    createAuthMiddleware({
      token: opts.token,
      allowLoopbackWithoutToken: opts.allowLoopbackWithoutToken ?? true,
    }),
  );
  app.use(createCorsMiddleware());
  app.use(helmet());
  app.use(express.json({ limit: bodyLimit }));

  return app;
}

/** Attaches the shared error handler — call after all routes are registered. */
export function finalizeApp(app: Express): Express {
  app.use(createErrorHandler(logger));
  return app;
}
