import type { Request, RequestHandler } from 'express';

export interface McpAuthOptions {
  readonly token: string;
  readonly allowLoopbackWithoutToken?: boolean;
}

/** Mask token for logs — never log the full secret (RF-14). */
export function redactToken(token: string): string {
  if (token.length <= 8) return '[REDACTED]';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/, '');
}

export function isLoopbackIp(ip: string | undefined): boolean {
  if (!ip) return false;
  const n = normalizeIp(ip);
  return n === '127.0.0.1' || n === '::1';
}

function isLoopbackRequest(req: Request): boolean {
  return isLoopbackIp(req.ip) || isLoopbackIp(req.socket.remoteAddress ?? undefined);
}

function extractToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim();
  }
  if (isLoopbackRequest(req) && typeof req.query.token === 'string') {
    return req.query.token;
  }
  return undefined;
}

export function createAuthMiddleware(opts: McpAuthOptions): RequestHandler {
  const allowLoopback = opts.allowLoopbackWithoutToken ?? true;

  return (req, res, next) => {
    const provided = extractToken(req);
    if (provided === opts.token) {
      next();
      return;
    }
    if (!provided && allowLoopback && isLoopbackRequest(req)) {
      next();
      return;
    }
    res.status(401).json({ error: 'Unauthorized' });
  };
}
