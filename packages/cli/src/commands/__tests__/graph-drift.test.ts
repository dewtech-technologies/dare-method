import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { JsonGraph } from '../../graphrag/json-graph.js';

describe('dare graph drift command', () => {
  let projectRoot: string;
  let stdout: string;
  let stderr: string;
  let exitCode: number | undefined;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-drift-cmd-'));
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    await fs.writeFile(
      path.join(projectRoot, 'dare-graph.yml'),
      'backend: json\njson:\n  path: .dare/graph.json\n',
    );

    stdout = '';
    stderr = '';
    exitCode = undefined;

    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      return undefined as never;
    });
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout += args.map(String).join(' ') + '\n';
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      stderr += args.map(String).join(' ') + '\n';
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(projectRoot).catch(() => undefined);
  });

  async function writeDriftConfig(overrides: Record<string, unknown> = {}): Promise<void> {
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), {
      drift: {
        enabled: true,
        maxOrphanReqs: 0,
        maxOrphanCode: 0,
        failOnStale: false,
        ignore: [],
        ...overrides,
      },
    });
  }

  async function seedGraph(seed: (graph: JsonGraph) => void | Promise<void>): Promise<void> {
    const graphPath = path.join(projectRoot, '.dare', 'graph.json');
    const graph = new JsonGraph(graphPath);
    await graph.init();
    await seed(graph);
    await Promise.resolve(graph.close());
  }

  async function run(args: string[]): Promise<void> {
    vi.resetModules();
    const { graphCommand } = await import('../graph.js');
    await graphCommand.parseAsync(['node', 'graph', 'drift', ...args]);
  }

  it('reports_without_strict_exits_0', async () => {
    await writeDriftConfig();
    await seedGraph((graph) => {
      graph.addNode({
        id: 'code_symbol:src/auth/login.ts::authenticate',
        type: 'code_symbol',
        label: 'authenticate',
        metadata: {
          path: 'src/auth/login.ts',
          qualifiedName: 'src/auth/login.ts::authenticate',
        },
      });
    });

    await run([]);

    expect(exitCode).toBeUndefined();
    expect(stdout).toContain('Graph Drift Report');
    expect(stdout).toContain('orphan-code: 1');
    expect(stderr).toBe('');
  });

  it('strict_above_threshold_exits_7', async () => {
    await writeDriftConfig();
    await seedGraph((graph) => {
      graph.addNode({
        id: 'code_symbol:src/billing/charge.ts::charge',
        type: 'code_symbol',
        label: 'charge',
        metadata: {
          path: 'src/billing/charge.ts',
          qualifiedName: 'src/billing/charge.ts::charge',
        },
      });
    });

    await run(['--strict']);

    expect(exitCode).toBe(7);
  });

  it('json_format_shape', async () => {
    await writeDriftConfig();
    await seedGraph((graph) => {
      graph.addNode({
        id: 'code_symbol:src/orders/create.ts::createOrder',
        type: 'code_symbol',
        label: 'createOrder',
        metadata: {
          path: 'src/orders/create.ts',
          qualifiedName: 'src/orders/create.ts::createOrder',
        },
      });
    });

    await run(['--format', 'json']);

    expect(exitCode).toBeUndefined();
    const report = JSON.parse(stdout.trim()) as {
      findings: Array<{ kind: string; nodeId: string; label: string; detail: string }>;
      counts: Record<string, number>;
      staleIndeterminate: number;
    };
    expect(Array.isArray(report.findings)).toBe(true);
    expect(report.counts['orphan-code']).toBe(1);
    expect(report.counts['orphan-requirement']).toBe(0);
    expect(typeof report.staleIndeterminate).toBe('number');
  });

  it('modules_filter', async () => {
    await writeDriftConfig();
    await seedGraph((graph) => {
      graph.addNode({
        id: 'requirement:RF-11',
        type: 'requirement',
        label: 'RF-11',
        metadata: {
          contentHash: 'rf-11-hash',
          ingestedAt: '2026-06-10T00:00:00.000Z',
        },
      });
      graph.addNode({
        id: 'code_symbol:src/mod-a/service.ts::serve',
        type: 'code_symbol',
        label: 'serve',
        metadata: {
          path: 'src/mod-a/service.ts',
          qualifiedName: 'src/mod-a/service.ts::serve',
          requirementContentHash: 'rf-11-hash',
          ingestedAt: '2026-06-10T00:00:00.000Z',
        },
      });
      graph.addEdge({
        id: 'implements:serve->rf11',
        sourceId: 'code_symbol:src/mod-a/service.ts::serve',
        targetId: 'requirement:RF-11',
        type: 'implements',
      });
      graph.addNode({
        id: 'code_symbol:src/mod-a/orphan.ts::orphanA',
        type: 'code_symbol',
        label: 'orphanA',
        metadata: {
          path: 'src/mod-a/orphan.ts',
          qualifiedName: 'src/mod-a/orphan.ts::orphanA',
        },
      });
      graph.addNode({
        id: 'code_symbol:src/mod-b/orphan.ts::orphanB',
        type: 'code_symbol',
        label: 'orphanB',
        metadata: {
          path: 'src/mod-b/orphan.ts',
          qualifiedName: 'src/mod-b/orphan.ts::orphanB',
        },
      });
    });

    await run(['--format', 'json', '--modules', 'src/mod-a']);

    const report = JSON.parse(stdout.trim()) as {
      findings: Array<{ nodeId: string }>;
      counts: Record<string, number>;
    };
    expect(report.counts['orphan-code']).toBe(1);
    expect(report.findings.some((finding) => finding.nodeId.includes('src/mod-a/orphan.ts::orphanA'))).toBe(
      true,
    );
    expect(report.findings.some((finding) => finding.nodeId.includes('src/mod-b/orphan.ts::orphanB'))).toBe(
      false,
    );
  });
});
