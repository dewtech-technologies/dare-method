/**
 * Terminal-first AI provider contracts for DARE command enrichment.
 *
 * Providers invoke external CLIs (codex, claude, cursor-agent, …) via subprocess.
 * The CLI never treats free-form model text as authoritative — outputs must be JSON.
 */

export type AiProviderName =
  | 'codex'
  | 'claude-code'
  | 'cursor-cli'
  | 'antigravity-cli'
  | 'mock';

/** Commands that support heuristic + AI enrichment. */
export type AiCommandName =
  | 'reverse'
  | 'dna'
  | 'migrate'
  | 'design'
  | 'patterns'
  | 'blueprint'
  | 'review'
  | 'refine';

export type ProviderAvailability = 'available' | 'unavailable' | 'skipped';

export interface ProviderStatus {
  readonly name: AiProviderName;
  readonly availability: ProviderAvailability;
  readonly command: string;
  readonly detail: string;
  readonly requiresNetwork: boolean;
}

export interface AgentRequest {
  readonly prompt: string;
  readonly cwd: string;
  readonly schema?: Record<string, unknown>;
  readonly timeoutSeconds?: number;
  readonly signal?: AbortSignal;
}

export interface AgentResult {
  readonly ok: boolean;
  readonly provider: AiProviderName;
  readonly raw: string;
  readonly data?: unknown;
  readonly error?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface EnrichmentResult {
  readonly ok: boolean;
  readonly command: AiCommandName;
  readonly provider: AiProviderName;
  readonly data?: unknown;
  readonly artifactPath?: string;
  readonly error?: string;
}

export interface AiCommandOptions {
  readonly ai?: boolean;
  readonly provider?: string;
}
