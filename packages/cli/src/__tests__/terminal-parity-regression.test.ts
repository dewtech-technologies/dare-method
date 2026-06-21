import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { maybeRunAiEnrichment, runCommandEnrichment } from '../ai/pipeline.js';
import { MockAiProvider } from '../ai/providers.js';
import { setMockProviderFactoryForTests } from '../ai/registry.js';
import {
  parseAgentDriverOverride,
  providerToDriverId,
  KNOWN_AGENT_DRIVER_IDS,
} from '../ai/resolve.js';
import { SEMANTIC_COMMANDS } from '../ai/parity.js';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(pkgRoot, '..', '..');
const implRoot = path.join(repoRoot, 'implementations');

describe('terminal parity regression (N-1)', () => {
  afterEach(() => {
    setMockProviderFactoryForTests(null);
    vi.restoreAllMocks();
  });

  it('heuristic_runs_without_ai_without_provider', async () => {
    const result = await maybeRunAiEnrichment({
      enabled: false,
      command: 'dna',
      cwd: process.cwd(),
      facts: { conventions: {} },
    });
    expect(result).toBeNull();
  });

  it('ai_without_provider_available_exits_nonzero', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-parity-reg-'));
    setMockProviderFactoryForTests(
      () =>
        new MockAiProvider(() => ({
          ok: false,
          provider: 'mock',
          raw: '',
          error: 'cursor-agent: command not found — install the CLI or set DARE_CURSOR_COMMAND',
        })),
    );

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit:1');
    }) as typeof process.exit);

    await expect(
      maybeRunAiEnrichment({
        enabled: true,
        command: 'reverse',
        cwd: tmpDir,
        facts: {},
        provider: 'mock',
        json: true,
      }),
    ).rejects.toThrow('exit:1');

    expect(exitSpy).toHaveBeenCalledWith(1);
    await fs.remove(tmpDir).catch(() => undefined);
  });

  it('four_terminal_providers_are_selectable_for_execution', () => {
    expect(providerToDriverId('codex')).toBe('codex');
    expect(providerToDriverId('claude-code')).toBe('claude');
    expect(providerToDriverId('cursor-cli')).toBe('cursor');
    expect(providerToDriverId('antigravity-cli')).toBe('antigravity');

    expect(parseAgentDriverOverride('codex-cli')).toBe('codex');
    expect(parseAgentDriverOverride('claude-code')).toBe('claude');
    expect(parseAgentDriverOverride('cursor-agent')).toBe('cursor');
    expect(parseAgentDriverOverride('antigravity-cli')).toBe('antigravity');

    expect(KNOWN_AGENT_DRIVER_IDS).toEqual(
      expect.arrayContaining(['claude', 'codex', 'cursor', 'antigravity', 'mock']),
    );
  });

  it('no_llm_sdk_outside_claude_driver', () => {
    const forbidden = /(?:import|require)\s*\(?['"]@anthropic-ai|from\s+['"]@anthropic-ai/;
    const allowed = path.join('src', 'agent', 'drivers', 'claude.ts');

    function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') return [];
          return walk(full);
        }
        if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) return [];
        return [path.relative(pkgRoot, full)];
      });
    }

    const offenders = walk(path.join(pkgRoot, 'src')).filter((rel) => {
      if (path.normalize(rel) === path.normalize(allowed)) return false;
      return forbidden.test(readFileSync(path.join(pkgRoot, rel), 'utf8'));
    });
    expect(offenders).toEqual([]);
  });

  it('chat_skills_still_present_for_semantic_commands', () => {
    for (const command of SEMANTIC_COMMANDS) {
      const slug = `dare-${command}`;
      expect(fs.pathExistsSync(path.join(implRoot, 'claude/.claude/commands', `${slug}.md`))).toBe(
        true,
      );
      expect(fs.pathExistsSync(path.join(implRoot, 'cursor/.cursor/commands', `${slug}.md`))).toBe(
        true,
      );
      expect(
        fs.pathExistsSync(path.join(implRoot, 'antigravity/.agents/skills', slug, 'SKILL.md')),
      ).toBe(true);
    }
  });

  it('invalid_ai_output_does_not_touch_artifact', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-parity-invalid-'));
    setMockProviderFactoryForTests(
      () =>
        new MockAiProvider(() => ({
          ok: true,
          provider: 'mock',
          raw: '{}',
          data: { passed: 'invalid', unmetCriteria: [] },
        })),
    );
    await fs.ensureDir(path.join(tmpDir, 'DARE'));
    const reviewPath = path.join(tmpDir, 'DARE', 'review-semantic.json');
    await fs.writeJSON(reviewPath, { passed: true, unmetCriteria: [] });

    const result = await runCommandEnrichment({
      command: 'review',
      cwd: tmpDir,
      facts: { taskId: 'task-001' },
      provider: 'mock',
    });

    expect(result.ok).toBe(false);
    const unchanged = await fs.readJSON(reviewPath);
    expect(unchanged.passed).toBe(true);

    await fs.remove(tmpDir).catch(() => undefined);
  });
});
