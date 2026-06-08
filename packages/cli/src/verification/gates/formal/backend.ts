import type {
  FormalBackend as FormalBackendId,
  FormalVerdict,
  CriticalModuleMarker,
} from '../../types.js';

export interface FormalRunInput {
  readonly cwd: string;
  readonly target: CriticalModuleMarker;
  readonly specPath: string;
  readonly implPath: string;
  readonly proofTimeoutSeconds: number;
}

/**
 * Contrato de cada backend formal. Implementações: dafny (default) / verus / lean.
 *
 * - isAvailable(cwd): checa o binário no PATH SEM rodar prova (degradação graciosa, A-5).
 * - run(input): executa o verificador via safeSpawn (argv, shell:false), parseia o
 *   relatório/exit-code NATIVO e normaliza para FormalVerdict. NUNCA chama LLM (RS-06).
 */
export interface FormalBackend {
  readonly backend: FormalBackendId;
  readonly minVersion: string;
  isAvailable(cwd: string): Promise<boolean>;
  run(input: FormalRunInput): Promise<FormalVerdict>;
}

/** Toolchain ausente em alvo MARCADO — vira exit 5 no comando (task-508). */
export class FormalToolNotFoundError extends Error {
  readonly backend: string;
  readonly target: string;

  constructor(backend: string, target = 'unknown') {
    super(`Formal tool not available: ${backend}`);
    this.name = 'FormalToolNotFoundError';
    this.backend = backend;
    this.target = target;
  }
}

/** Falha de CONFIG do solver (≠ prova rejeitada). Carrega stderr cru do verificador. */
export class FormalBackendError extends Error {
  readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = 'FormalBackendError';
    this.stderr = stderr;
  }
}

/** Backend não suportado na config (string exata em registry.ts). */
export class UnknownFormalBackendError extends Error {
  readonly backend: string;

  constructor(backend: string) {
    super(
      `Error: unknown formal backend '${backend}'. Supported: dafny, verus, lean.`,
    );
    this.name = 'UnknownFormalBackendError';
    this.backend = backend;
  }
}
