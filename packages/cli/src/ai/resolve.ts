import { normalizeProviderName, type AiConfig } from './config.js';
import type { AiProviderName } from './types.js';

/** Agent driver ids used by `dare execute --agent` (distinct from enrichment provider names). */
export type AgentDriverId = 'claude' | 'codex' | 'cursor' | 'antigravity' | 'mock';

/**
 * Resolve enrichment provider: `--provider` flag > `ai.defaultProvider` in config > `codex`.
 */
export function resolveProviderName(
  flag: string | undefined,
  config: AiConfig,
): AiProviderName {
  return normalizeProviderName(flag) ?? config.defaultProvider;
}

/** Map terminal AI provider name to `dare execute --agent` driver id. */
export function providerToDriverId(name: AiProviderName): AgentDriverId | null {
  switch (name) {
    case 'codex':
      return 'codex';
    case 'claude-code':
      return 'claude';
    case 'cursor-cli':
      return 'cursor';
    case 'antigravity-cli':
      return 'antigravity';
    case 'mock':
      return 'mock';
    default:
      return null;
  }
}

/**
 * Parse `--driver` / `agent.provider` / `agent.driver` into an execute driver id.
 * Accepts provider aliases (`claude-code`, `cursor-agent`, …) and legacy driver names.
 */
export function parseAgentDriverOverride(raw: string | undefined): AgentDriverId | null {
  if (!raw?.trim()) return null;

  const asProvider = normalizeProviderName(raw);
  if (asProvider) {
    const mapped = providerToDriverId(asProvider);
    if (mapped) return mapped;
  }

  const lower = raw.trim().toLowerCase();
  if (lower === 'claude' || lower === 'claude-sdk') return 'claude';
  if (lower === 'cursor' || lower === 'cursor-agent') return 'cursor';
  if (lower === 'antigravity') return 'antigravity';
  if (lower === 'dry-run') return 'mock';

  return null;
}

/**
 * When `ai.defaultProvider` is explicitly set in dare.config.json, map it to an execute driver.
 * Returns null if the `ai` block is absent or has no defaultProvider (execute keeps legacy default).
 */
export function agentDriverFromAiConfig(rawConfig: Record<string, unknown>): AgentDriverId | null {
  if (typeof rawConfig.ai !== 'object' || rawConfig.ai === null) return null;
  const ai = rawConfig.ai as Record<string, unknown>;
  if (typeof ai.defaultProvider !== 'string') return null;
  const normalized = normalizeProviderName(ai.defaultProvider);
  if (!normalized) return null;
  return providerToDriverId(normalized);
}

/**
 * Resolve execute driver: agent.provider/driver flag > explicit ai.defaultProvider > fallback.
 */
export function resolveAgentDriverId(
  rawConfig: Record<string, unknown>,
  driverFlag: string | undefined,
  fallback: AgentDriverId = 'claude',
): AgentDriverId {
  return (
    parseAgentDriverOverride(driverFlag) ??
    agentDriverFromAiConfig(rawConfig) ??
    fallback
  );
}

/** Known execute driver ids for validation messages. */
export const KNOWN_AGENT_DRIVER_IDS: readonly AgentDriverId[] = [
  'claude',
  'codex',
  'cursor',
  'antigravity',
  'mock',
];

export function formatKnownDrivers(): string {
  return KNOWN_AGENT_DRIVER_IDS.join(', ');
}
