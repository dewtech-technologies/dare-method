import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractFilePaths, ingestTask } from '../../dag-runner/graph-ingest.js';
import { JsonGraph } from '../../graphrag/json-graph.js';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import type { Dag } from '../../dag-runner/run_dag.js';

describe('extractFilePaths', () => {
  it('finds bare path-like tokens with extensions', () => {
    const text = 'I created src/auth/login.ts and tests/auth.test.ts.';
    const paths = extractFilePaths(text);
    expect(paths).toContain('src/auth/login.ts');
    expect(paths).toContain('tests/auth.test.ts');
  });

  it('extracts paths from explicit markers', () => {
    const text = 'Created: src/main.rs\nModified: tests/integration.rs';
    const paths = extractFilePaths(text);
    expect(paths).toContain('src/main.rs');
    expect(paths).toContain('tests/integration.rs');
  });

  it('ignores http(s) URLs and bare words', () => {
    const text = 'See https://example.com/a.ts for context. The word ts appears alone.';
    const paths = extractFilePaths(text);
    expect(paths).not.toContain('https://example.com/a.ts');
    expect(paths.length).toBe(0);
  });

  it('deduplicates equal paths found by different patterns', () => {
    const text = 'Created: src/x.ts\nThe file src/x.ts has been updated.';
    const paths = extractFilePaths(text);
    const occurrences = paths.filter((p) => p === 'src/x.ts').length;
    expect(occurrences).toBe(1);
  });
});

describe('ingestTask', () => {
  let graph: JsonGraph;
  let filePath: string;

  beforeEach(async () => {
    filePath = path.join(os.tmpdir(), `dare-ingest-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    graph = new JsonGraph(filePath);
    await graph.init();
  });

  afterEach(async () => {
    await fs.remove(filePath).catch(() => undefined);
  });

  const sampleDag = (): Dag => ({
    title: 'sample',
    version: '1.0.0',
    models: { cursor: { HIGH: 'h', MED: 'm', LOW: 'l' } },
    tasks: [
      { id: 't1', title: 'one', depends_on: [], complexity: 'LOW', subtask_prompt: 'p1', status: 'PENDING' },
      { id: 't2', title: 'two', depends_on: ['t1'], complexity: 'MED', subtask_prompt: 'p2', status: 'PENDING' },
    ],
  });

  it('creates a task node with status metadata', () => {
    const dag = sampleDag();
    dag.tasks[0].status = 'DONE';
    dag.tasks[0].duration = 500;
    dag.tasks[0].tokens = 1234;

    ingestTask(graph, dag.tasks[0], dag);

    const node = graph.getNode('task:t1');
    expect(node).toBeDefined();
    expect(node?.type).toBe('task');
    expect(node?.metadata?.status).toBe('DONE');
    expect(node?.metadata?.tokens).toBe(1234);
    expect(node?.metadata?.duration_ms).toBe(500);
  });

  it('mirrors depends_on edges from the DAG', () => {
    const dag = sampleDag();
    dag.tasks[0].status = 'DONE';
    dag.tasks[1].status = 'DONE';

    ingestTask(graph, dag.tasks[0], dag);
    ingestTask(graph, dag.tasks[1], dag);

    const edges = graph.getEdges('task:t2', 'out').filter((e) => e.type === 'depends_on');
    expect(edges).toHaveLength(1);
    expect(edges[0].targetId).toBe('task:t1');
  });

  it('creates file nodes + implements edges for DONE tasks with paths in output', () => {
    const dag = sampleDag();
    const task = dag.tasks[0];
    task.status = 'DONE';
    task.output = 'Created src/auth.ts and tests/auth.test.ts.';

    ingestTask(graph, task, dag);

    expect(graph.getNode('file:src/auth.ts')).toBeDefined();
    expect(graph.getNode('file:tests/auth.test.ts')).toBeDefined();

    const implementsEdges = graph
      .getEdges('task:t1', 'out')
      .filter((e) => e.type === 'implements');
    expect(implementsEdges.length).toBe(2);
  });

  it('does not create file nodes when status is FAILED', () => {
    const dag = sampleDag();
    const task = dag.tasks[0];
    task.status = 'FAILED';
    task.output = 'Tried to create src/auth.ts but compile failed.';
    task.error = 'compile error';

    ingestTask(graph, task, dag);

    expect(graph.getNode('task:t1')).toBeDefined();
    expect(graph.getNode('file:src/auth.ts')).toBeNull();
  });

  it('skips PENDING/RUNNING tasks entirely', () => {
    const dag = sampleDag();
    ingestTask(graph, dag.tasks[0], dag); // status PENDING
    expect(graph.getNode('task:t1')).toBeNull();
  });
});
