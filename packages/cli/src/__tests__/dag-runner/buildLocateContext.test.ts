import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { JsonGraph } from '../../graphrag/json-graph.js';
import { buildGraphFromFixture, loadFixture } from '../graphrag/fixtures/dual-graph/build-fixture-graph.js';
import { buildLocateContext, loadGraphLocateConfig } from '../../dag-runner/graph-locate.js';
import type { DagTask } from '../../dag-runner/run_dag.js';

describe('ralph-locate buildLocateContext', () => {
  let graph: JsonGraph;
  let cwd: string;

  const task: DagTask = {
    id: 'task-216',
    title: 'locate test',
    status: 'PENDING',
    complexity: 'MED',
    depends_on: [],
    subtask_prompt: 'Edit src/math.ts and src/math.ts::add for RF-03',
  };

  beforeEach(async () => {
    cwd = path.join(os.tmpdir(), `locate-ctx-${Date.now()}`);
    await fs.ensureDir(cwd);
    const file = path.join(cwd, 'graph.json');
    graph = new JsonGraph(file);
    await graph.init();
    buildGraphFromFixture(graph, loadFixture('locate/math'));
  });

  it('returns undefined when disabled', () => {
    const cfg = { enabled: false, hops: 3, limit: 5 };
    expect(buildLocateContext(graph, task, cfg)).toBeUndefined();
  });

  it('returns undefined on empty graph', async () => {
    const empty = new JsonGraph(path.join(cwd, 'empty.json'));
    await empty.init();
    const cfg = { enabled: true, hops: 3, limit: 5 };
    expect(buildLocateContext(empty, task, cfg)).toBeUndefined();
  });

  it('formats markdown candidates when enabled', () => {
    const md = buildLocateContext(graph, task, { enabled: true, hops: 3, limit: 5 });
    expect(md).toContain('## Graph locate (deterministic)');
    expect(md).toContain('Candidates:');
    expect(md).toMatch(/score \d+\.\d+/);
  });

  it('loadGraphLocateConfig reads dare.config.json', async () => {
    await fs.writeJson(path.join(cwd, 'dare.config.json'), {
      graph: { locateBeforePatch: true, locateHops: 2, locateLimit: 3 },
    });
    const cfg = loadGraphLocateConfig(cwd);
    expect(cfg.enabled).toBe(true);
    expect(cfg.hops).toBe(2);
    expect(cfg.limit).toBe(3);
  });
});
