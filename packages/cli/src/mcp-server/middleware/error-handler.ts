import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler } from 'express';

export interface SanitizedErrorBody {
  readonly success: false;
  readonly error: string;
  readonly correlationId: string;
}

export interface ErrorHandlerLogger {
  error(obj: Record<string, unknown>, msg: string): void;
}

export function createErrorHandler(logger: ErrorHandlerLogger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const correlationId = randomUUID();
    logger.error(
      { err, correlationId, route: req.path },
      'mcp request failed',
    );
    const body: SanitizedErrorBody = {
      success: false,
      error: 'Internal server error',
      correlationId,
    };
    res.status(500).json(body);
  };
}
