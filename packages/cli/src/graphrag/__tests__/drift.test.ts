import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { JsonGraph } from '../json-graph.js';
import { detectDrift, type DriftConfig } from '../drift.js';

describe('detectDrift', () => {
  let graph: JsonGraph;

  beforeEach(async () => {
    const filePath = path.join(
      os.tmpdir(),
      `drift-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
    graph = new JsonGraph(filePath);
    await graph.init();
  });

  afterEach(() => {
    graph.close();
  });

  it('detects_orphan_requirement', () => {
    graph.addNode({
      id: 'requirement:RF-01',
      type: 'requirement',
      label: 'RF-01',
      metadata: { contentHash: 'hash-rf-01', ingestedAt: '2026-01-01T00:00:00.000Z' },
    });

    const report = detectDrift(graph, enabledConfig());

    expect(report.counts['orphan-requirement']).toBe(1);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        kind: 'orphan-requirement',
        nodeId: 'requirement:RF-01',
      }),
    );
  });

  it('detects_orphan_code', () => {
    graph.addNode({
      id: 'code_symbol:src/entry/index.ts::main',
      type: 'code_symbol',
      label: 'main',
      metadata: {
        path: 'src/entry/index.ts',
        qualifiedName: 'src/entry/index.ts::main',
      },
    });
    graph.addNode({
      id: 'code_symbol:src/services/auth.ts::authorize',
      type: 'code_symbol',
      label: 'authorize',
      metadata: {
        path: 'src/services/auth.ts',
        qualifiedName: 'src/services/auth.ts::authorize',
      },
    });

    const report = detectDrift(graph, enabledConfig({ ignore: ['**/entry/**', '**/index.ts'] }));

    expect(report.counts['orphan-code']).toBe(1);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        kind: 'orphan-code',
        nodeId: 'code_symbol:src/services/auth.ts::authorize',
      }),
    );
  });

  it('detects_stale_when_hash_changed', () => {
    graph.addNode({
      id: 'requirement:RF-02',
      type: 'requirement',
      label: 'RF-02',
      metadata: { contentHash: 'new-hash', ingestedAt: '2026-01-05T00:00:00.000Z' },
    });
    graph.addNode({
      id: 'code_symbol:src/auth.ts::login',
      type: 'code_symbol',
      label: 'login',
      metadata: {
        qualifiedName: 'src/auth.ts::login',
        requirementContentHash: 'old-hash',
        ingestedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    graph.addEdge({
      id: 'implements:login->rf02',
      sourceId: 'code_symbol:src/auth.ts::login',
      targetId: 'requirement:RF-02',
      type: 'implements',
    });

    const report = detectDrift(graph, enabledConfig());

    expect(report.counts.stale).toBe(1);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        kind: 'stale',
        nodeId: 'requirement:RF-02',
      }),
    );
  });

  it('counts_staleIndeterminate_without_hash', () => {
    graph.addNode({
      id: 'requirement:RF-03',
      type: 'requirement',
      label: 'RF-03',
      metadata: { ingestedAt: '2026-01-05T00:00:00.000Z' },
    });
    graph.addNode({
      id: 'code_symbol:src/orders.ts::checkout',
      type: 'code_symbol',
      label: 'checkout',
      metadata: { qualifiedName: 'src/orders.ts::checkout', ingestedAt: '2026-01-01T00:00:00.000Z' },
    });
    graph.addEdge({
      id: 'implements:checkout->rf03',
      sourceId: 'code_symbol:src/orders.ts::checkout',
      targetId: 'requirement:RF-03',
      type: 'implements',
    });

    const report = detectDrift(graph, enabledConfig());

    expect(report.staleIndeterminate).toBe(1);
    expect(report.counts.stale).toBe(0);
  });

  it('clean_graph_no_findings', () => {
    graph.addNode({
      id: 'requirement:RF-04',
      type: 'requirement',
      label: 'RF-04',
      metadata: { contentHash: 'stable-hash', ingestedAt: '2026-01-01T00:00:00.000Z' },
    });
    graph.addNode({
      id: 'code_symbol:src/billing.ts::charge',
      type: 'code_symbol',
      label: 'charge',
      metadata: {
        qualifiedName: 'src/billing.ts::charge',
        requirementContentHash: 'stable-hash',
        ingestedAt: '2026-01-02T00:00:00.000Z',
      },
    });
    graph.addEdge({
      id: 'implements:charge->rf04',
      sourceId: 'code_symbol:src/billing.ts::charge',
      targetId: 'requirement:RF-04',
      type: 'implements',
    });

    const report = detectDrift(graph, enabledConfig());

    expect(report.findings).toEqual([]);
    expect(report.counts).toEqual({
      'orphan-requirement': 0,
      'orphan-code': 0,
      stale: 0,
    });
    expect(report.staleIndeterminate).toBe(0);
  });
});

function enabledConfig(overrides: Partial<DriftConfig> = {}): DriftConfig {
  return {
    enabled: true,
    maxOrphanReqs: 0,
    maxOrphanCode: 0,
    failOnStale: false,
    ignore: [],
    ...overrides,
  };
}
