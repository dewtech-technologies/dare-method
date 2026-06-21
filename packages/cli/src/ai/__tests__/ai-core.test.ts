import { describe, it, expect } from 'vitest';
import { extractJsonObject } from '../parse-json-output.js';
import { parseAiConfig, normalizeProviderName } from '../config.js';
import { validateCommandOutput } from '../schemas.js';

describe('ai config', () => {
  it('normalizes_provider_aliases', () => {
    expect(normalizeProviderName('codex-cli')).toBe('codex');
    expect(normalizeProviderName('claude')).toBe('claude-code');
    expect(normalizeProviderName('cursor-agent')).toBe('cursor-cli');
  });

  it('reads_ai_and_agent_blocks', () => {
    const cfg = parseAiConfig({
      ai: { defaultProvider: 'codex' },
      agent: {
        provider: 'claude',
        model: 'claude-sonnet-4-5',
        codex: { command: 'codex-local' },
      },
    });
    expect(cfg.defaultProvider).toBe('codex');
    expect(cfg.providers.codex?.command).toBe('codex-local');
    const claude = cfg.providers['claude-code'] as { model?: string } | undefined;
    expect(claude?.model).toBe('claude-sonnet-4-5');
  });
});

describe('parse-json-output', () => {
  it('extracts_json_from_fenced_block', () => {
    const data = extractJsonObject('Here:\n```json\n{"ok":true}\n```');
    expect(data).toEqual({ ok: true });
  });
});

describe('schemas', () => {
  it('validates_reverse_semantic_payload', () => {
    const data = validateCommandOutput('reverse', {
      purpose: 'Billing API',
      domainGlossary: 'Invoice, Customer',
    });
    expect(data).toMatchObject({ purpose: 'Billing API' });
  });
});
