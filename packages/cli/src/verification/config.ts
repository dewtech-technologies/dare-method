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
    maxDepth: 2,
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

const DRIFT_IGNORE_DEFAULTS = [
  '**/index.ts',
  '**/*.generated.*',
  '**/bin/**',
] as const;

const loopPolicySchema = z.enum(['decay', 'fixed']);
const saturationActionSchema = z.enum(['fresh-start', 'replan', 'escalate']);
const formalBackendSchema = z.enum(['dafny', 'verus', 'lean']);
export const driftConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    maxOrphanReqs: z
      .number()
      .int()
      .nonnegative('maxOrphanReqs must be a non-negative integer')
      .default(0),
    maxOrphanCode: z
      .number()
      .int()
      .nonnegative('maxOrphanCode must be a non-negative integer')
      .default(0),
    failOnStale: z.boolean().default(false),
    ignore: z.array(z.string()).default([...DRIFT_IGNORE_DEFAULTS]),
  })
  .strict();

export type DriftConfig = z.infer<typeof driftConfigSchema>;
export const DRIFT_DEFAULTS: DriftConfig = driftConfigSchema.parse({});

export const semanticConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    model: z.string().default('all-MiniLM-L6-v2'),
    modelHash: z.string().optional(),
    rrfK: z
      .number()
      .int()
      .positive('rrfK must be a positive integer')
      .default(60),
  })
  .strict();

export type SemanticConfig = z.infer<typeof semanticConfigSchema>;
export const SEMANTIC_DEFAULTS: SemanticConfig = semanticConfigSchema.parse({});

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
        maxDepth: z.number().int().min(1).default(2),
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

export class DriftConfigError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super(`Invalid drift config: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
    this.name = 'DriftConfigError';
    this.issues = issues;
  }
}

export class SemanticConfigError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super(`Invalid semantic config: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
    this.name = 'SemanticConfigError';
    this.issues = issues;
  }
}

function isVerificationBlockAbsent(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (typeof raw !== 'object') return false;
  const rec = raw as Record<string, unknown>;
  return !('verification' in rec) || rec.verification === undefined;
}

function isDriftBlockAbsent(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (typeof raw !== 'object') return false;
  const rec = raw as Record<string, unknown>;
  return !('drift' in rec) || rec.drift === undefined;
}

function isSemanticBlockAbsent(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (typeof raw !== 'object') return false;
  const rec = raw as Record<string, unknown>;
  if (!('graphrag' in rec) || rec.graphrag === undefined) return true;

  const graphrag = rec.graphrag;
  if (typeof graphrag !== 'object' || graphrag === null || Array.isArray(graphrag)) {
    return true;
  }

  const graphragRec = graphrag as Record<string, unknown>;
  return !('semantic' in graphragRec) || graphragRec.semantic === undefined;
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

/** Serializable defaults for dare.config.json (new projects + migrations). */
export function defaultDriftConfigForProject(): DriftConfig {
  return structuredClone(DRIFT_DEFAULTS);
}

/**
 * Inserts the drift block when absent (opt-in: enabled stays false).
 * Returns true when the block was added.
 */
export function seedDriftDefaultsIfAbsent(
  cfg: Record<string, unknown>,
): boolean {
  if (cfg.drift !== undefined) return false;
  cfg.drift = defaultDriftConfigForProject();
  return true;
}

/** Serializable defaults for dare.config.json (new projects + migrations). */
export function defaultSemanticConfigForProject(): SemanticConfig {
  return structuredClone(SEMANTIC_DEFAULTS);
}

/**
 * Inserts `graphrag.semantic` when absent.
 * Returns true when the block was added.
 */
export function seedSemanticDefaultsIfAbsent(
  cfg: Record<string, unknown>,
): boolean {
  const existing = cfg.graphrag;
  if (existing === undefined) {
    cfg.graphrag = {
      backend: 'sqlite',
      semantic: defaultSemanticConfigForProject(),
    };
    return true;
  }

  if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
    cfg.graphrag = {
      backend: existing,
      semantic: defaultSemanticConfigForProject(),
    };
    return true;
  }

  const graphrag = existing as Record<string, unknown>;
  if (graphrag.semantic !== undefined) return false;
  graphrag.semantic = defaultSemanticConfigForProject();
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

/**
 * Parse and validate `drift` from an already-parsed dare.config.json object.
 */
export function parseDriftConfig(raw: unknown): DriftConfig {
  if (isDriftBlockAbsent(raw)) {
    return defaultDriftConfigForProject();
  }

  const block = (raw as Record<string, unknown>).drift;
  const result = driftConfigSchema.safeParse(block);
  if (!result.success) {
    throw new DriftConfigError(zodIssues(result.error));
  }
  return result.data;
}

/**
 * Parse and validate `graphrag.semantic` from an already-parsed dare.config.json object.
 */
export function parseSemanticConfig(raw: unknown): SemanticConfig {
  if (isSemanticBlockAbsent(raw)) {
    return defaultSemanticConfigForProject();
  }

  const graphragBlock = (raw as Record<string, unknown>).graphrag as Record<string, unknown>;
  const semanticBlock = graphragBlock.semantic;
  const result = semanticConfigSchema.safeParse(semanticBlock);
  if (!result.success) {
    throw new SemanticConfigError(zodIssues(result.error));
  }
  return result.data;
}
