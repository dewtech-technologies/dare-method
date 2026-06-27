import { describe, expect, it } from 'vitest';
import { buildManifest, PROTOCOL_VERSION } from '../protocol.js';
import { SEMANTIC_COMMANDS } from '../../ai/parity.js';

describe('serve/protocol', () => {
  it('buildManifest covers all semantic commands 1:1', () => {
    const manifest = buildManifest();
    expect(manifest.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(manifest.cliVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.operations).toHaveLength(SEMANTIC_COMMANDS.length);
    expect(manifest.operations.map((o) => o.command).sort()).toEqual(
      [...SEMANTIC_COMMANDS].sort(),
    );
  });

  it('every operation has heuristicAlwaysRuns true', () => {
    for (const op of buildManifest().operations) {
      expect(op.heuristicAlwaysRuns).toBe(true);
      expect(op.route).toBe(`POST /commands/${op.command}`);
    }
  });

  it('requiresInput only on design, review, refine', () => {
    const byCmd = Object.fromEntries(
      buildManifest().operations.map((o) => [o.command, o.requiresInput]),
    );
    expect(byCmd.design).toEqual(['description']);
    expect(byCmd.review).toEqual(['taskId']);
    expect(byCmd.refine).toEqual(['taskId']);
    expect(byCmd.reverse).toBeUndefined();
    expect(byCmd.dna).toBeUndefined();
  });

  it('capabilities include all providers', () => {
    const caps = buildManifest().capabilities;
    expect(caps.codex?.enrichment).toBe(true);
    expect(caps.mock?.execution).toBe(true);
  });
});
