import { z } from 'zod';
import { assertRelativeSafe } from '../utils/path-safety.js';
import type { HookConfig } from './types.js';
import { HOOK_EVENTS } from './types.js';
import { ALLOWED_ACTION_KEYS } from './allowlist.js';

export const HOOK_DEFAULTS: HookConfig = { on: {}, trusted: false };

const hookEventEnum = z.enum(
  HOOK_EVENTS as unknown as [string, ...string[]],
);
const actionKeyEnum = z.enum(
  ALLOWED_ACTION_KEYS as unknown as [string, ...string[]],
);

const hookActionSchema = z
  .object({
    action: actionKeyEnum,
    args: z.array(z.string()).optional(),
  })
  .strict();

const hookConfigSchema = z
  .object({
    on: z
      .record(hookEventEnum, z.array(hookActionSchema))
      .default({}),
    trusted: z.boolean().default(false),
  })
  .strict();

export class HookConfigError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super(
      `Invalid hooks config: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
    );
    this.name = 'HookConfigError';
    this.issues = issues;
  }
}

function isHooksBlockAbsent(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (typeof raw !== 'object') return false;
  const rec = raw as Record<string, unknown>;
  return !('hooks' in rec) || rec.hooks === undefined;
}

function zodIssues(
  error: z.ZodError,
): ReadonlyArray<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

function looksLikePath(arg: string): boolean {
  return arg.includes('/') || arg.includes('\\') || arg.includes('..');
}

/**
 * Parse and validate `hooks` from an already-parsed dare.config.json object.
 */
export function parseHookConfig(raw: unknown): HookConfig {
  if (isHooksBlockAbsent(raw)) {
    return { on: {}, trusted: false };
  }

  const block = (raw as Record<string, unknown>).hooks;
  const result = hookConfigSchema.safeParse(block);
  if (!result.success) {
    throw new HookConfigError(zodIssues(result.error));
  }

  for (const actions of Object.values(result.data.on)) {
    for (const a of actions ?? []) {
      for (const arg of a.args ?? []) {
        if (looksLikePath(arg)) assertRelativeSafe(arg);
      }
    }
  }

  return result.data as HookConfig;
}

/** Serializable defaults for dare.config.json (new projects + migrations). */
export function defaultHookConfigForProject(): HookConfig {
  return structuredClone(HOOK_DEFAULTS);
}

/**
 * Inserts the hooks block when absent (opt-in: trusted stays false).
 * Returns true when the block was added.
 */
export function seedHooksDefaultsIfAbsent(
  cfg: Record<string, unknown>,
): boolean {
  if (cfg.hooks !== undefined) return false;
  cfg.hooks = defaultHookConfigForProject();
  return true;
}
