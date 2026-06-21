import { describe, it, expect } from 'vitest';
import { parseAiConfig } from '../config.js';
import {
  resolveProviderName,
  providerToDriverId,
  parseAgentDriverOverride,
  agentDriverFromAiConfig,
  resolveAgentDriverId,
} from '../resolve.js';

describe('ai/resolve', () => {
  const config = parseAiConfig({
    ai: { defaultProvider: 'claude-code' },
  });

  it('flag_wins_over_config', () => {
    expect(resolveProviderName('codex', config)).toBe('codex');
  });

  it('config_default_when_no_flag', () => {
    expect(resolveProviderName(undefined, config)).toBe('claude-code');
  });

  it('falls_back_to_codex_when_empty_config', () => {
    const empty = parseAiConfig({});
    expect(resolveProviderName(undefined, empty)).toBe('codex');
  });

  it('maps_provider_to_driver_id', () => {
    expect(providerToDriverId('codex')).toBe('codex');
    expect(providerToDriverId('claude-code')).toBe('claude');
    expect(providerToDriverId('cursor-cli')).toBe('cursor');
    expect(providerToDriverId('antigravity-cli')).toBe('antigravity');
    expect(providerToDriverId('mock')).toBe('mock');
  });

  it('parseAgentDriverOverride_accepts_aliases', () => {
    expect(parseAgentDriverOverride('codex-cli')).toBe('codex');
    expect(parseAgentDriverOverride('claude')).toBe('claude');
    expect(parseAgentDriverOverride('cursor-agent')).toBe('cursor');
    expect(parseAgentDriverOverride('dry-run')).toBe('mock');
  });

  it('agentDriverFromAiConfig_requires_explicit_ai_block', () => {
    expect(agentDriverFromAiConfig({})).toBeNull();
    expect(agentDriverFromAiConfig({ ai: {} })).toBeNull();
    expect(
      agentDriverFromAiConfig({ ai: { defaultProvider: 'codex' } }),
    ).toBe('codex');
  });

  it('resolveAgentDriverId_precedence', () => {
    expect(
      resolveAgentDriverId({ ai: { defaultProvider: 'codex' } }, 'claude-code'),
    ).toBe('claude');
    expect(resolveAgentDriverId({ ai: { defaultProvider: 'codex' } }, undefined)).toBe(
      'codex',
    );
    expect(resolveAgentDriverId({}, undefined)).toBe('claude');
  });
});
