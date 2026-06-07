/* ── Config (validada por zod em config.ts) ─────────────────────────── */

export type LoopPolicy = 'decay' | 'fixed';
export type SaturationAction = 'fresh-start' | 'replan' | 'escalate';
export type MutationTool = 'stryker' | 'mutmut' | 'cargo-mutants' | 'infection';

export interface MutationConfig {
  readonly enabled: boolean;
  /** 0..1. Bloqueia DONE se score < minScore. Default 0.70. */
  readonly minScore: number;
  /** Só muta arquivos do git diff da task. Default true (RNF-01). */
  readonly incremental: boolean;
  /** Teto de mutantes por execução. Default 200. */
  readonly maxMutants: number;
  /** Timeout total do gate de mutação, em segundos. Default 900. */
  readonly timeoutSeconds: number;
}

export interface LoopConfig {
  readonly policy: LoopPolicy;
  /** Teto duro de tentativas. Veredito ESCALATE ao atingir. Default 5. */
  readonly maxAttempts: number;
  /** Nº de tentativas com a MESMA assinatura → saturado. Default 3 (≤3, idea-3). */
  readonly saturationWindow: number;
  /** Ação ao saturar antes do teto. Default 'fresh-start'. */
  readonly onSaturation: SaturationAction;
}

export interface BestOfNConfig {
  readonly default: number;
  readonly max: number;
  /** Orçamento de tokens (null = sem teto no CLI; agente respeita). */
  readonly budgetTokens: number | null;
}

export interface VerificationConfig {
  readonly enabled: boolean;
  readonly mutation: MutationConfig;
  readonly failToPass: { readonly required: boolean };
  readonly antiTamper: { readonly enabled: boolean };
  readonly typeCheck: { readonly enabled: boolean };
  readonly loop: LoopConfig;
  readonly bestOfN: BestOfNConfig;
  readonly prerank: { readonly enabled: boolean };
}

/* ── Resultado de verificação ───────────────────────────────────────── */

export type Aspect =
  | 'build'
  | 'test'
  | 'lint'
  | 'type'
  | 'fail-to-pass'
  | 'anti-tamper'
  | 'mutation';
export type Verdict = 'PASS' | 'FAIL' | 'SKIP';

export interface AspectResult {
  readonly aspect: Aspect;
  readonly verdict: Verdict;
  readonly score?: number;
  readonly reason: string;
  readonly durationMs: number;
}

export interface VerificationResult {
  readonly taskId: string;
  readonly passed: boolean;
  readonly aspects: ReadonlyArray<AspectResult>;
  readonly mutationScore?: number;
  readonly durationMs: number;
}

/* ── Política decay-aware (RF-06) ───────────────────────────────────── */

export type LoopAction = 'CONTINUE' | 'FRESH_START' | 'REPLAN' | 'ESCALATE' | 'DONE';

export interface AttemptRecord {
  readonly n: number;
  readonly at: string;
  readonly passed: boolean;
  readonly failureSignature?: string;
  readonly failedAspect?: Aspect;
}

export interface LoopVerdict {
  readonly action: LoopAction;
  readonly attempt: number;
  readonly saturated: boolean;
  readonly reason: string;
  readonly failureSignature?: string;
}

/* ── Best-of-N (RF-04/05) ───────────────────────────────────────────── */

export interface CandidateWorktree {
  readonly id: string;
  readonly path: string;
  readonly branch: string;
}

export interface Candidate {
  readonly id: string;
  readonly worktree: CandidateWorktree;
  readonly verification: VerificationResult;
}
