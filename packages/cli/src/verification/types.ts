/* ── Config (validada por zod em config.ts) ─────────────────────────── */

export type LoopPolicy = 'decay' | 'fixed';
export type SaturationAction = 'fresh-start' | 'replan' | 'escalate';
export type MutationTool = 'stryker' | 'mutmut' | 'cargo-mutants' | 'infection';

/* ── Backends formais ──────────────────────────────────────────────── */

export type FormalBackend = 'dafny' | 'verus' | 'lean';

/** Em qual obrigação a prova falhou (CLEVER §spec/impl certification, RF-07). */
export type FormalStage = 'spec' | 'impl' | 'both' | 'none';

/* ── Config do gate formal (validada por zod em config.ts) ─────────── */

export interface FormalGateConfig {
  /** Ausência do bloco ⇒ false (RNF-01). Segundo portão além da marcação. */
  readonly enabled: boolean;
  /** Backend default 'dafny' (A-4 — 82% vs. Lean 27%, Vericoding). */
  readonly backend: FormalBackend;
  /** Módulos/funções críticas marcadas (RF-01). Vazio + sem @dare-formal ⇒ aspecto nunca roda. */
  readonly modules: ReadonlyArray<string>;
  /** Teto de iterações do loop de reparo PREFACE (RF-04). Default 5. */
  readonly maxRepairIterations: number;
  /** Timeout por prova, em segundos (RNF-03 — SMT é caro). Default 120. */
  readonly proofTimeoutSeconds: number;
  /** Sub-gate anti-trapaça obrigatório quando enabled (RF-06/RS-02). Default true. */
  readonly antiBypass: boolean;
}

/** Marcação resolvida de um alvo crítico (A-11). */
export interface CriticalModuleMarker {
  readonly file: string;
  readonly symbol?: string;
  readonly source: 'tag' | 'config';
}

/**
 * Veredito determinístico do verificador externo (NUNCA do LLM — RS-06).
 *
 * INVARIANTE (§4.2): `verified` deve SEMPRE ser `solverPassed && !bypassDetected`.
 * Nenhum produtor de FormalVerdict pode setar `verified:true` sem que o solver
 * tenha provado E o anti-bypass tenha passado. Nunca derivado de LLM.
 */
export interface FormalVerdict {
  readonly backend: FormalBackend;
  readonly verified: boolean;
  readonly stage: FormalStage;
  readonly bypassDetected: boolean;
  readonly repairIterations: number;
  readonly solverExitCode: number;
  readonly reason: string;
  readonly durationMs: number;
}

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
  /** Profundidade máxima de aninhamento de sub-DAGs (REPLAN). Default 2. */
  readonly maxDepth: number;
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
  readonly formal: FormalGateConfig;
}

/* ── Resultado de verificação ───────────────────────────────────────── */

export type Aspect =
  | 'build'
  | 'test'
  | 'lint'
  | 'type'
  | 'fail-to-pass'
  | 'anti-tamper'
  | 'mutation'
  | 'formal';
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
