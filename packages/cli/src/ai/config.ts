import type { AiProviderName } from './types.js';
import type { CodexApproval, CodexSandbox } from '../agent/drivers/codex.js';
import { readProjectConfig } from '../utils/UpdateDetector.js';

export interface CodexProviderConfig {
  readonly command?: string;
  readonly model?: string;
  readonly sandbox?: CodexSandbox;
  readonly approval?: CodexApproval;
  readonly timeoutSeconds?: number;
}

export interface ClaudeCodeProviderConfig {
  readonly command?: string;
  readonly model?: string;
  readonly timeoutSeconds?: number;
}

export interface CliProviderConfig {
  readonly command?: string;
  readonly timeoutSeconds?: number;
}

export interface AiConfig {
  readonly defaultProvider: AiProviderName;
  readonly providers: Partial<
    Record<
      AiProviderName,
      CodexProviderConfig | ClaudeCodeProviderConfig | CliProviderConfig
    >
  >;
}

const DEFAULT_PROVIDER: AiProviderName = 'codex';

const PROVIDER_ALIASES: Readonly<Record<string, AiProviderName>> = {
  codex: 'codex',
  'codex-cli': 'codex',
  claude: 'claude-code',
  'claude-code': 'claude-code',
  'claude-cli': 'claude-code',
  cursor: 'cursor-cli',
  'cursor-cli': 'cursor-cli',
  'cursor-agent': 'cursor-cli',
  antigravity: 'antigravity-cli',
  'antigravity-cli': 'antigravity-cli',
  mock: 'mock',
};

export function normalizeProviderName(raw: string | undefined): AiProviderName | null {
  if (!raw?.trim()) return null;
  return PROVIDER_ALIASES[raw.trim().toLowerCase()] ?? null;
}

export function parseAiConfig(raw: Record<string, unknown>): AiConfig {
  const ai =
    typeof raw.ai === 'object' && raw.ai !== null
      ? (raw.ai as Record<string, unknown>)
      : {};
  const agent =
    typeof raw.agent === 'object' && raw.agent !== null
      ? (raw.agent as Record<string, unknown>)
      : {};

  const defaultRaw =
    typeof ai.defaultProvider === 'string'
      ? ai.defaultProvider
      : typeof agent.provider === 'string'
        ? agent.provider
        : typeof agent.driver === 'string'
          ? agent.driver
          : undefined;

  const defaultProvider = normalizeProviderName(defaultRaw) ?? DEFAULT_PROVIDER;

  const providersBlock =
    typeof ai.providers === 'object' && ai.providers !== null
      ? (ai.providers as Record<string, unknown>)
      : {};

  const providers: AiConfig['providers'] = {};

  for (const [key, value] of Object.entries(providersBlock)) {
    const name = normalizeProviderName(key);
    if (!name || name === 'mock') continue;
    if (typeof value === 'object' && value !== null) {
      providers[name] = value as AiConfig['providers'][typeof name];
    }
  }

  // Back-compat: agent.codex / agent.command at root of agent block
  if (!providers.codex && (agent.codex || agent.command || agent.sandbox)) {
    const codex =
      typeof agent.codex === 'object' && agent.codex !== null
        ? (agent.codex as Record<string, unknown>)
        : {};
    providers.codex = {
      command:
        typeof agent.command === 'string'
          ? agent.command
          : typeof codex.command === 'string'
            ? codex.command
            : undefined,
      model: typeof agent.model === 'string' ? agent.model : undefined,
      sandbox:
        typeof agent.sandbox === 'string'
          ? (agent.sandbox as CodexSandbox)
          : typeof codex.sandbox === 'string'
            ? (codex.sandbox as CodexSandbox)
            : undefined,
      approval:
        typeof codex.approval === 'string'
          ? (codex.approval as CodexApproval)
          : undefined,
      timeoutSeconds:
        typeof codex.timeoutSeconds === 'number' ? codex.timeoutSeconds : undefined,
    };
  }

  if (!providers['claude-code'] && typeof agent.model === 'string') {
    providers['claude-code'] = { model: agent.model };
  }

  return { defaultProvider, providers };
}

export async function loadAiConfig(cwd: string): Promise<AiConfig> {
  try {
    const raw = (await readProjectConfig(cwd)) as Record<string, unknown>;
    return parseAiConfig(raw);
  } catch {
    return parseAiConfig({});
  }
}

export function resolveProviderConfig<T extends Record<string, unknown>>(
  config: AiConfig,
  name: AiProviderName,
): T {
  const block = config.providers[name];
  return (block ?? {}) as T;
}
