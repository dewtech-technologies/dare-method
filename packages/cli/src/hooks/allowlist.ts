import type { HookEventPayload } from './types.js';

/** Chaves FECHADAS de ação (A-3 / RS-01 / RS-06). Editável só via diff versionado. */
export type AllowedActionKey =
  | 'dare-validate'
  | 'dare-review'
  | 'graph-register'
  | 'lint'
  | 'test';

/** Conjunto fechado materializado — fonte única para validação Zod (task-303). */
export const ALLOWED_ACTION_KEYS: readonly AllowedActionKey[] = [
  'dare-validate',
  'dare-review',
  'graph-register',
  'lint',
  'test',
] as const;

export interface ResolvedCommand {
  readonly cmd: string;
  readonly argv: readonly string[];
}

/** Veredito de que a ação é "interna" (não spawna) — graph-register (RF-12). */
export const INTERNAL_ACTIONS: readonly AllowedActionKey[] = ['graph-register'] as const;

export class ActionNotAllowedError extends Error {
  readonly code = 'ACTION_NOT_ALLOWED' as const;
  constructor(key: string) {
    super(`Hook action '${key}' is not in the allowlist`);
    this.name = 'ActionNotAllowedError';
  }
}

function splitStackCommand(command: string): ResolvedCommand {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    throw new ActionNotAllowedError('lint/test (empty stack command)');
  }
  const [cmd, ...argv] = parts;
  return { cmd: cmd!, argv };
}

/**
 * Resolve uma ação da allowlist para (cmd, argv). Único ponto que decide o que roda.
 * Determinístico; payload entra como argv por elemento, nunca interpolado (RS-02).
 */
export function resolveAction(
  action: AllowedActionKey,
  payload: HookEventPayload,
  stack: { lint?: string; test?: string },
): ResolvedCommand {
  switch (action) {
    case 'dare-validate':
      return { cmd: 'dare', argv: ['validate', '--strict'] };
    case 'dare-review': {
      if (!payload.taskId) {
        throw new ActionNotAllowedError('dare-review');
      }
      return {
        cmd: 'dare',
        argv: ['review', payload.taskId, '--strict', '--format', 'json'],
      };
    }
    case 'graph-register':
      return { cmd: '', argv: [] };
    case 'lint': {
      const cmd = stack.lint;
      if (!cmd) throw new ActionNotAllowedError('lint');
      return splitStackCommand(cmd);
    }
    case 'test': {
      const cmd = stack.test;
      if (!cmd) throw new ActionNotAllowedError('test');
      return splitStackCommand(cmd);
    }
    default:
      throw new ActionNotAllowedError(String(action));
  }
}
