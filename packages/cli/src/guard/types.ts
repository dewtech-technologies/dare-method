export type GuardVerdict = 'PASS' | 'WARN' | 'FAIL';
export type ArtifactOrigin = 'human' | 'agent' | 'external';
export type TrustChannel = 'control' | 'data';

export interface GuardedArtifact {
  readonly path: string;
  readonly origin: ArtifactOrigin;
  readonly channel: TrustChannel;
  readonly trust: 'signed' | 'unsigned';
  readonly taskId?: string;
  /** sha256 hex */
  readonly digest: string;
}

export interface GuardFinding {
  readonly layer: 'unicode' | 'scan' | 'provenance';
  readonly severity: GuardVerdict;
  readonly rule: string;
  /** sanitizado (sem vazar segredo) */
  readonly evidence: string;
}

export interface GuardResult {
  readonly artifact: string;
  /** pior severidade entre findings */
  readonly verdict: GuardVerdict;
  readonly findings: ReadonlyArray<GuardFinding>;
  /** conteúdo após strip (unicode=strip) */
  readonly sanitized?: string;
}
