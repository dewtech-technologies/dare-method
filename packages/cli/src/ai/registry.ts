import type { AiConfig } from './config.js';
import { normalizeProviderName } from './config.js';
import type { AiProviderName, ProviderStatus } from './types.js';
import {
  AntigravityCliAiProvider,
  ClaudeCodeAiProvider,
  CodexAiProvider,
  CursorCliAiProvider,
  MockAiProvider,
  type AiProvider,
} from './providers.js';

const ALL_PROVIDERS: readonly AiProviderName[] = [
  'codex',
  'claude-code',
  'cursor-cli',
  'antigravity-cli',
  'mock',
];

let mockFactory: ((config: AiConfig) => MockAiProvider) | null = null;

export function setMockProviderFactoryForTests(
  factory: ((config: AiConfig) => MockAiProvider) | null,
): void {
  mockFactory = factory;
}

export function listProviderNames(): readonly AiProviderName[] {
  return ALL_PROVIDERS;
}

export function createProvider(name: AiProviderName, config: AiConfig): AiProvider {
  switch (name) {
    case 'codex':
      return new CodexAiProvider(config);
    case 'claude-code':
      return new ClaudeCodeAiProvider(config);
    case 'cursor-cli':
      return new CursorCliAiProvider(config);
    case 'antigravity-cli':
      return new AntigravityCliAiProvider(config);
    case 'mock':
      return mockFactory ? mockFactory(config) : new MockAiProvider();
    default:
      return new MockAiProvider();
  }
}

export function resolveProvider(
  config: AiConfig,
  override?: string,
): { name: AiProviderName; provider: AiProvider } {
  const name = normalizeProviderName(override) ?? config.defaultProvider;
  return { name, provider: createProvider(name, config) };
}

export async function probeAllProviders(config: AiConfig): Promise<ProviderStatus[]> {
  return Promise.all(
    ALL_PROVIDERS.filter((name) => name !== 'mock').map(async (name) => {
      const provider = createProvider(name, config);
      return provider.probe();
    }),
  );
}
