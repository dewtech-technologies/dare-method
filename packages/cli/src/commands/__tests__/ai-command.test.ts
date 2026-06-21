import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { listProviderNames } from '../../ai/registry.js';
import { capabilitiesForProvider } from '../../ai/capabilities.js';
import { maybeRunAiEnrichment } from '../../ai/pipeline.js';
import { setMockProviderFactoryForTests } from '../../ai/registry.js';
import { MockAiProvider } from '../../ai/providers.js';

describe('dare ai command surface', () => {
  afterEach(() => {
    setMockProviderFactoryForTests(null);
  });

  it('lists_all_terminal_providers', () => {
    expect(listProviderNames()).toEqual([
      'codex',
      'claude-code',
      'cursor-cli',
      'antigravity-cli',
      'mock',
    ]);
  });

  it('doctor_reports_capabilities_per_provider', () => {
    for (const name of listProviderNames()) {
      const caps = capabilitiesForProvider(name);
      expect(caps.enrichment).toBe(true);
      if (name === 'mock') {
        expect(caps.execution).toBe(true);
      } else {
        expect(caps.execution).toBe(true);
      }
    }
  });

  it('reverse_ai_json_emits_structured_result', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-ai-json-'));
    setMockProviderFactoryForTests(
      () =>
        new MockAiProvider(() => ({
          ok: true,
          provider: 'mock',
          raw: '{}',
          data: {
            purpose: 'Json path',
            domainGlossary: 'A, B',
          },
        })),
    );
    await fs.ensureDir(path.join(tmpDir, 'DARE', 'REVERSE'));
    await fs.writeFile(path.join(tmpDir, 'DARE', 'IDEIA.md'), '<!-- AGENT: purpose -->\n');

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logs.push(String(msg));
    });

    const result = await maybeRunAiEnrichment({
      enabled: true,
      command: 'reverse',
      cwd: tmpDir,
      facts: {},
      provider: 'mock',
      json: true,
    });

    expect(result?.ok).toBe(true);
    const parsed = JSON.parse(logs[0] ?? '{}') as { ok: boolean; command: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe('reverse');

    await fs.remove(tmpDir).catch(() => undefined);
    vi.restoreAllMocks();
  });
});
