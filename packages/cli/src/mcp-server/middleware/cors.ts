import type { RequestHandler } from 'express';

export interface McpCorsOptions {
  readonly allowedOrigins?: ReadonlyArray<string>;
}

const DEFAULT_PATTERNS = ['http://127.0.0.1:*', 'http://localhost:*'];

function originMatchesPattern(origin: string, pattern: string): boolean {
  if (!pattern.includes('*')) return origin === pattern;
  const [prefix] = pattern.split('*');
  return origin.startsWith(prefix);
}

function isOriginAllowed(origin: string, patterns: ReadonlyArray<string>): boolean {
  return patterns.some((p) => originMatchesPattern(origin, p));
}

export function createCorsMiddleware(opts?: McpCorsOptions): RequestHandler {
  const patterns = opts?.allowedOrigins ?? DEFAULT_PATTERNS;

  return (req, res, next) => {
    const origin = req.headers.origin;

    if (origin && isOriginAllowed(origin, patterns)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      if (origin && isOriginAllowed(origin, patterns)) {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization',
        );
      }
      res.status(204).end();
      return;
    }

    next();
  };
}
