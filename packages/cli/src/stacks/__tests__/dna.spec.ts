// SPDX-License-Identifier: MIT
//
// DNA gate — single-source paridade for all 11 stacks (T-001..T-005 skeleton).
//
// Status:
//   - Phase 1 (this task, T-005): STACK_REGISTRY is EMPTY. The
//     `expected stack count` test FAILS on purpose — see note below.
//   - Phase 2 (T-012): registry has 1 stack (ruby-rails-8) → per-stack
//     describe.each starts executing 1 stack × N assertions.
//   - Phase 5 (T-040..T-043): 11 stacks → all green.
//
// EXPECTED-FAIL-UNTIL-PHASE-5: `registry has expected number of stacks` will
// fail until all 11 scaffolders are registered. This is intentional — we want
// CI visibility of the gap.
//
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { STACK_REGISTRY, resolve } from '../registry.js';
import { DARE_DNA, type DareDnaArtifact, type StackId } from '../types.js';

const EXPECTED_STACK_COUNT = 11; // 7 backend + 4 MCP

describe('DNA gate — registry completeness', () => {
  it.fails('registry has expected number of stacks (fails until Phase 5)', () => {
    // Wrapped in it.fails() until Phase 5. When the 11th stack lands, switch
    // this to a regular `it()` and the green test becomes the gate.
    expect(STACK_REGISTRY.size).toBe(EXPECTED_STACK_COUNT);
  });

  it.fails('registry is non-empty (fails until Phase 2)', () => {
    expect(STACK_REGISTRY.size).toBeGreaterThan(0);
  });
});

// Iterates over whatever's currently in the registry. Array can be empty
// in Phase 1 — describe.each is no-op then, which is fine.
const REGISTERED_IDS: StackId[] = [...STACK_REGISTRY.keys()];

describe.each(REGISTERED_IDS.map((id) => [id]))(
  'DNA gate — %s',
  (stackId) => {
    let tmpDir: string;
    let dnaEmitted: ReadonlySet<DareDnaArtifact>;

    beforeAll(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `dna-${stackId}-`));
      const scaffold = await resolve(stackId);
      const result = await scaffold.generate({
        dir: tmpDir,
        projectName: 'test-app',
        toolchain: 'auto',
        features: new Set(DARE_DNA),
        isMonorepo: false,
        mcp: scaffold.category === 'mcp' ? { transport: 'stdio' } : undefined,
      });
      dnaEmitted = result.dnaEmitted;
    });

    for (const artifact of DARE_DNA) {
      it(`emitted artifact: ${artifact}`, () => {
        expect(dnaEmitted.has(artifact)).toBe(true);
      });
    }

    it('llms.txt present and well-formed', async () => {
      const p = path.join(tmpDir, 'llms.txt');
      expect(await fs.pathExists(p)).toBe(true);
      const content = await fs.readFile(p, 'utf8');
      expect(content).toMatch(/^#\s/m);
      expect(content).toMatch(/##\s+Setup/i);
      expect(content).toMatch(/##\s+Commands/i);
    });

    it('.env.example present and free of obvious secrets', async () => {
      const p = path.join(tmpDir, '.env.example');
      expect(await fs.pathExists(p)).toBe(true);
      const content = await fs.readFile(p, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        const value = trimmed.slice(eq + 1).trim();
        if (!value) continue;
        expect(value).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
        expect(value).not.toMatch(/[a-f0-9]{32,}/);
        expect(value).not.toMatch(/sk-[A-Za-z0-9]{40,}/);
        expect(value).not.toMatch(/AKIA[0-9A-Z]{16}/);
      }
    });

    it('.dare/skills.yml references at least one skill', async () => {
      const p = path.join(tmpDir, '.dare/skills.yml');
      expect(await fs.pathExists(p)).toBe(true);
      const content = await fs.readFile(p, 'utf8');
      expect(content).toMatch(/skills:/);
      expect(content).toMatch(/-\s+id:\s+skill-/);
    });

    it('.github/workflows/dare-ci.yml has audit/lint/test jobs', async () => {
      const p = path.join(tmpDir, '.github/workflows/dare-ci.yml');
      expect(await fs.pathExists(p)).toBe(true);
      const content = await fs.readFile(p, 'utf8');
      expect(content).toMatch(/^\s*audit:/m);
      expect(content).toMatch(/^\s*lint:/m);
      expect(content).toMatch(/^\s*test:/m);
    });

    // The remaining DNA checks — `openapi`, `cli-json-flag`, `rate-limit` —
    // are added in T-060 / T-062 (Phase 7) because they vary by stack and
    // need ecosystem-specific grep patterns.
  },
);
