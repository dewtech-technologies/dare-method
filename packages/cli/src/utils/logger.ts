import pino, { type Logger } from 'pino';

function resolveLevel(): string {
  return process.env.DARE_LOG_LEVEL ?? 'info';
}

function buildTransport(): pino.TransportSingleOptions | undefined {
  if (!process.stdout.isTTY) return undefined;
  return {
    target: 'pino-pretty',
    options: { colorize: true },
  };
}

const transport = buildTransport();

export const logger: Logger = transport
  ? pino({ level: resolveLevel(), transport })
  : pino({ level: resolveLevel() });

/**
 * Child logger with a fixed scope binding (RNF-04).
 */
export function createLogger(scope: string): Logger {
  return logger.child({ scope });
}
