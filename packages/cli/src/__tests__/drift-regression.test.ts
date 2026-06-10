import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonGraph } from '../graphrag/json-graph.js';
import type { GraphEdge, GraphNode } from '../graphrag/types.js';

interface DriftFinding {
  readonly kind: 'orphan-requirement' | 'orphan-code' | 'stale';
  readonly nodeId: string;
  readonly label: string;
  readonly detail: string;
}

interface DriftReport {
  readonly findings: DriftFinding[];
  readonly counts: Record<'orphan-requirement' | 'orphan-code' | 'stale', number>;
  readonly staleIndeterminate: number;
}

interface FixtureGraph {
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
}

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.join(TEST_ROOT, '..');
const FIXTURE_PATH = path.join(TEST_ROOT, '__fixtures__', 'drift-graph.json');
const NO_LLM_PATTERN = /openai|anthropic|@google\/generative-ai|langchain/i;

describe('drift regression audit (task-705)', () => {
  let projectRoot: string;
  let stdout: string;
  let stderr: string;
  let exitCode: number | undefined;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'drift-regression-'));
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    await fs.ensureDir(path.join(projectRoot, '.dare'));
    await fs.writeFile(
      path.join(projectRoot, 'dare-graph.yml'),
      'backend: json\njson:\n  path: .dare/graph.json\n',
    );

    await seedFixtureGraph(projectRoot);
    resetCaptured();

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

  async function seedFixtureGraph(root: string): Promise<void> {
    const fixture = (await fs.readJson(FIXTURE_PATH)) as FixtureGraph;
    const graph = new JsonGraph(path.join(root, '.dare', 'graph.json'));
    await graph.init();
    graph.importFromJson(fixture);
    await Promise.resolve(graph.close());
  }

  function resetCaptured(): void {
    stdout = '';
    stderr = '';
    exitCode = undefined;
  }

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

  async function runDrift(args: string[]): Promise<void> {
    vi.resetModules();
    const { graphCommand } = await import('../commands/graph.js');
    await graphCommand.parseAsync(['node', 'graph', 'drift', ...args]);
  }

  function parseJsonReport(): DriftReport {
    return JSON.parse(stdout.trim()) as DriftReport;
  }

  it('three_kinds_detected', async () => {
    await writeDriftConfig();
    await runDrift(['--format', 'json']);

    const report = parseJsonReport();
    expect(report.counts['orphan-requirement']).toBe(1);
    expect(report.counts['orphan-code']).toBe(2);
    expect(report.counts.stale).toBe(1);
    expect(report.staleIndeterminate).toBe(1);
    expect(stderr).toBe('');
  });

  it('ignore_allowlist_respected', async () => {
    await writeDriftConfig({ ignore: ['**/generated/**'] });
    await runDrift(['--format', 'json']);

    const report = parseJsonReport();
    expect(report.counts['orphan-code']).toBe(1);
    expect(
      report.findings.some(
        (finding) => finding.nodeId === 'code_symbol:src/generated/bootstrap.ts::bootstrap',
      ),
    ).toBe(false);
    expect(
      report.findings.some(
        (finding) => finding.nodeId === 'code_symbol:src/inventory/sync.ts::syncInventory',
      ),
    ).toBe(true);
  });

  it('stale_degrades_to_warn_without_hash', async () => {
    await writeDriftConfig({ ignore: ['**/generated/**'] });
    await runDrift(['--format', 'json']);

    const report = parseJsonReport();
    const staleNodeIds = report.findings.filter((finding) => finding.kind === 'stale').map((f) => f.nodeId);
    expect(report.staleIndeterminate).toBe(1);
    expect(staleNodeIds).toContain('requirement:RF-STALE');
    expect(staleNodeIds).not.toContain('requirement:RF-NOHASH');
  });

  it('strict_exits_7', async () => {
    await writeDriftConfig({ ignore: ['**/generated/**'] });

    await runDrift(['--format', 'json']);
    expect(exitCode).toBeUndefined();

    resetCaptured();
    await runDrift(['--strict', '--format', 'json']);
    expect(exitCode).toBe(7);
  });

  it('deterministic_no_llm', async () => {
    const deterministicModules = [
      'commands/graph.ts',
      'graphrag/drift.ts',
      'verification/config.ts',
    ];

    for (const rel of deterministicModules) {
      const content = await fs.readFile(path.join(SRC_ROOT, rel), 'utf8');
      expect(content).not.toMatch(NO_LLM_PATTERN);
    }
  });
});
