import { z } from 'zod';

export const GUARD_DEFAULTS = {
  enabled: false,
  onExecute: true,
  unicode: 'strip' as const,
  trustedPaths: ['.dare/steering/**', 'DARE/TASKS.md'],
  signing: { enabled: false as const, publicKey: undefined as string | undefined },
};

export const guardConfigSchema = z
  .object({
    enabled: z.boolean().default(GUARD_DEFAULTS.enabled),
    onExecute: z.boolean().default(GUARD_DEFAULTS.onExecute),
    unicode: z.enum(['strip', 'block']).default(GUARD_DEFAULTS.unicode),
    trustedPaths: z.array(z.string()).default([...GUARD_DEFAULTS.trustedPaths]),
    signing: z
      .object({
        enabled: z.boolean().default(false),
        publicKey: z.string().optional(),
      })
      .default({ enabled: false }),
  })
  .strict();

export type GuardConfig = z.infer<typeof guardConfigSchema>;

export class GuardConfigError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super(
      `Invalid guard config: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
    );
    this.name = 'GuardConfigError';
    this.issues = issues;
  }
}

function isGuardBlockAbsent(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (typeof raw !== 'object') return false;
  const rec = raw as Record<string, unknown>;
  return !('guard' in rec) || rec.guard === undefined;
}

function zodIssues(
  error: z.ZodError,
): ReadonlyArray<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

export function parseGuardConfig(raw: unknown): GuardConfig {
  if (isGuardBlockAbsent(raw)) {
    return guardConfigSchema.parse({});
  }

  const block = (raw as Record<string, unknown>).guard;
  const result = guardConfigSchema.safeParse(block);
  if (!result.success) {
    throw new GuardConfigError(zodIssues(result.error));
  }
  return result.data;
}

export function defaultGuardConfigForProject(): GuardConfig {
  return guardConfigSchema.parse({});
}

export function seedGuardDefaultsIfAbsent(
  cfg: Record<string, unknown>,
): boolean {
  if (cfg.guard !== undefined) return false;
  cfg.guard = defaultGuardConfigForProject();
  return true;
}
