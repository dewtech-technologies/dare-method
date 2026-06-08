import { z } from 'zod';
import type { VerificationConfig, FormalGateConfig } from './types.js';

/** DEFAULTS.formal — ausência do bloco ⇒ enabled:false (RNF-01). */
export const FORMAL_DEFAULTS: FormalGateConfig = {
  enabled: false,
  backend: 'dafny',
  modules: [],
  maxRepairIterations: 5,
  proofTimeoutSeconds: 120,
  antiBypass: true,
};

export const DEFAULTS: VerificationConfig = {
  enabled: false,
  mutation: {
    enabled: true,
    minScore: 0.7,
    incremental: true,
    maxMutants: 200,
    timeoutSeconds: 900,
  },
  failToPass: { required: true },
  antiTamper: { enabled: true },
  typeCheck: { enabled: false },
  loop: {
    policy: 'decay',
    maxAttempts: 5,
    saturationWindow: 3,
    onSaturation: 'fresh-start',
  },
  bestOfN: {
    default: 1,
    max: 5,
    budgetTokens: null,
  },
  prerank: { enabled: false },
  formal: FORMAL_DEFAULTS,
};

const loopPolicySchema = z.enum(['decay', 'fixed']);
const saturationActionSchema = z.enum(['fresh-start', 'replan', 'escalate']);
const formalBackendSchema = z.enum(['dafny', 'verus', 'lean']);

const formalGateSchema = z
  .object({
    enabled: z.boolean().default(DEFAULTS.formal.enabled),
    backend: formalBackendSchema.default(DEFAULTS.formal.backend),
    modules: z.array(z.string()).default([...DEFAULTS.formal.modules]),
    maxRepairIterations: z
      .number()
      .int()
      .positive('maxRepairIterations must be a positive integer')
      .default(DEFAULTS.formal.maxRepairIterations),
    proofTimeoutSeconds: z
      .number()
      .int()
      .positive('proofTimeoutSeconds must be a positive integer')
      .default(DEFAULTS.formal.proofTimeoutSeconds),
    antiBypass: z.boolean().default(DEFAULTS.formal.antiBypass),
  })
  .strict()
  .default({ ...DEFAULTS.formal, modules: [...DEFAULTS.formal.modules] });

const verificationConfigSchema = z
  .object({
    enabled: z.boolean().default(DEFAULTS.enabled),
    mutation: z
      .object({
        enabled: z.boolean().default(DEFAULTS.mutation.enabled),
        minScore: z
          .number()
          .min(0, 'minScore must be between 0 and 1')
          .max(1, 'minScore must be between 0 and 1')
          .default(DEFAULTS.mutation.minScore),
        incremental: z.boolean().default(DEFAULTS.mutation.incremental),
        maxMutants: z
          .number()
          .int()
          .positive()
          .default(DEFAULTS.mutation.maxMutants),
        timeoutSeconds: z
          .number()
          .int()
          .positive()
          .default(DEFAULTS.mutation.timeoutSeconds),
      })
      .default({ ...DEFAULTS.mutation }),
    failToPass: z
      .object({
        required: z.boolean().default(DEFAULTS.failToPass.required),
      })
      .default({ ...DEFAULTS.failToPass }),
    antiTamper: z
      .object({
        enabled: z.boolean().default(DEFAULTS.antiTamper.enabled),
      })
      .default({ ...DEFAULTS.antiTamper }),
    typeCheck: z
      .object({
        enabled: z.boolean().default(DEFAULTS.typeCheck.enabled),
      })
      .default({ ...DEFAULTS.typeCheck }),
    loop: z
      .object({
        policy: loopPolicySchema.default(DEFAULTS.loop.policy),
        maxAttempts: z
          .number()
          .int()
          .min(1, 'maxAttempts must be at least 1')
          .default(DEFAULTS.loop.maxAttempts),
        saturationWindow: z
          .number()
          .int()
          .min(1, 'saturationWindow must be at least 1')
          .default(DEFAULTS.loop.saturationWindow),
        onSaturation: saturationActionSchema.default(
          DEFAULTS.loop.onSaturation,
        ),
      })
      .default({ ...DEFAULTS.loop }),
    bestOfN: z
      .object({
        default: z
          .number()
          .int()
          .min(1, 'bestOfN.default must be at least 1')
          .default(DEFAULTS.bestOfN.default),
        max: z
          .number()
          .int()
          .min(1, 'bestOfN.max must be at least 1')
          .default(DEFAULTS.bestOfN.max),
        budgetTokens: z
          .number()
          .int()
          .nullable()
          .default(DEFAULTS.bestOfN.budgetTokens),
      })
      .default({ ...DEFAULTS.bestOfN })
      .superRefine((b, ctx) => {
        if (b.default > b.max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'bestOfN.default must be <= bestOfN.max',
            path: ['default'],
          });
        }
      }),
    prerank: z
      .object({
        enabled: z.boolean().default(DEFAULTS.prerank.enabled),
      })
      .default({ ...DEFAULTS.prerank }),
    formal: formalGateSchema,
  })
  .strict();

export class VerificationConfigError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super(
      `Invalid verification config: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
    );
    this.name = 'VerificationConfigError';
    this.issues = issues;
  }
}

function isVerificationBlockAbsent(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (typeof raw !== 'object') return false;
  const rec = raw as Record<string, unknown>;
  return !('verification' in rec) || rec.verification === undefined;
}

function zodIssues(
  error: z.ZodError,
): ReadonlyArray<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

/**
 * Parse and validate `verification` from an already-parsed dare.config.json object.
 */
/** Serializable defaults for dare.config.json (new projects + migrations). */
export function defaultVerificationConfigForProject(): VerificationConfig {
  return structuredClone(DEFAULTS);
}

/**
 * Inserts the verification block when absent (opt-in: enabled stays false).
 * Returns true when the block was added.
 */
export function seedVerificationDefaultsIfAbsent(
  cfg: Record<string, unknown>,
): boolean {
  if (cfg.verification !== undefined) return false;
  cfg.verification = defaultVerificationConfigForProject();
  return true;
}

export function parseVerificationConfig(raw: unknown): VerificationConfig {
  if (isVerificationBlockAbsent(raw)) {
    return { ...DEFAULTS, enabled: false };
  }

  const block = (raw as Record<string, unknown>).verification;
  const result = verificationConfigSchema.safeParse(block);
  if (!result.success) {
    throw new VerificationConfigError(zodIssues(result.error));
  }
  return result.data;
}
