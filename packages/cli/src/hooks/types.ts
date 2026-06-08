import type { AllowedActionKey } from './allowlist.js';

/** Conjunto FECHADO de eventos na v1 (A-2 / RF-02). Eventos fora disto são rejeitados. */
export type HookEvent =
  | 'on-save'
  | 'on-file-create'
  | 'on-task-complete'
  | 'pre-commit';

export const HOOK_EVENTS: readonly HookEvent[] = [
  'on-save',
  'on-file-create',
  'on-task-complete',
  'pre-commit',
] as const;

/** Ação resolvida — sempre um item da allowlist canônica (RS-01). Nunca string de shell. */
export interface HookAction {
  readonly action: AllowedActionKey;
  /** Args adicionais; concatenados como argv, NUNCA interpolados em shell (RS-02). */
  readonly args?: readonly string[];
}

export interface HookConfig {
  /** Eventos → lista de ações. Ausente ⇒ zero hooks (RNF-03 / opt-in). */
  readonly on: Partial<Record<HookEvent, readonly HookAction[]>>;
  /**
   * Confiança explícita (RS-05). false (default) ⇒ hooks NÃO auto-executam;
   * `dare hooks run` falha com TRUST_REQUIRED até trusted:true ou --trust.
   */
  readonly trusted: boolean;
}

/** Payload passado ao dispatcher por evento. Validado antes do spawn. */
export interface HookEventPayload {
  readonly event: HookEvent;
  /** Arquivo relativo (on-save/on-file-create); validado com assertRelativeSafe. */
  readonly file?: string;
  /** Task id (on-task-complete); valida contra /^task-[0-9a-z-]+$/. */
  readonly taskId?: string;
}

export interface HookResult {
  readonly event: HookEvent;
  readonly action: AllowedActionKey;
  readonly exitCode: number;
  readonly skipped: boolean;
  readonly verdict?: 'pass' | 'fail';
  readonly durationMs: number;
}
