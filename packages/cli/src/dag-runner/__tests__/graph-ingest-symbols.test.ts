import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';
import { ingestTask } from '../graph-ingest.js';
import { JsonGraph } from '../../graphrag/json-graph.js';
import type { Dag } from '../run_dag.js';

const fixtureSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'src');

describe('graph-ingest code_symbol', () => {
  let graph: JsonGraph;
  let graphPath: string;
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-sym-'));
    await fs.copy(fixtureSrc, path.join(projectRoot, 'src'));
    graphPath = path.join(projectRoot, '.dare', 'graph.json');
    graph = new JsonGraph(graphPath);
    await graph.init();
  });

  afterEach(async () => {
    graph.close();
    await fs.remove(projectRoot).catch(() => undefined);
  });

  const dag = (): Dag => ({
    title: 'sym',
    version: '1',
    models: { cursor: { HIGH: 'h', MED: 'm', LOW: 'l' } },
    tasks: [{ id: 't1', title: 'math', depends_on: [], complexity: 'LOW', subtask_prompt: 'x' }],
  });

  it('should_create_code_symbol_nodes_for_touched_files', () => {
    const d = dag();
    d.tasks[0]!.status = 'DONE';
    d.tasks[0]!.output = 'Modified src/math.ts with add and multiply';
    ingestTask(graph, d.tasks[0]!, d, { cwd: projectRoot });

    expect(graph.getNode('code_symbol:src/math.ts::add')).toBeTruthy();
    expect(graph.getNode('code_symbol:src/math.ts::multiply')).toBeTruthy();
  });

  it('should_link_file_to_symbol_via_contains', () => {
    const d = dag();
    d.tasks[0]!.status = 'DONE';
    d.tasks[0]!.output = 'src/math.ts';
    ingestTask(graph, d.tasks[0]!, d, { cwd: projectRoot });

    const edges = graph.getEdges('file:src/math.ts', 'out');
    expect(edges.some((e) => e.type === 'contains' && e.targetId.includes('::add'))).toBe(true);
  });

  it('should_link_task_to_symbol_via_implements', () => {
    const d = dag();
    d.tasks[0]!.status = 'DONE';
    d.tasks[0]!.output = 'src/math.ts';
    ingestTask(graph, d.tasks[0]!, d, { cwd: projectRoot });

    const edges = graph.getEdges('task:t1', 'out');
    expect(edges.some((e) => e.type === 'implements' && e.targetId.startsWith('code_symbol:'))).toBe(
      true,
    );
  });

  it('should_create_direct_edge_on_explicit_qualified_mention', () => {
    const d = dag();
    d.tasks[0]!.status = 'DONE';
    d.tasks[0]!.output = 'Fixed src/math.ts::add in handler';
    ingestTask(graph, d.tasks[0]!, d, { cwd: projectRoot });

    const edges = graph.getEdges('task:t1', 'out');
    expect(
      edges.some(
        (e) => e.type === 'implements' && e.targetId === 'code_symbol:src/math.ts::add',
      ),
    ).toBe(true);
  });

  it('should_not_create_implements_to_missing_symbol_node', () => {
    const d = dag();
    d.tasks[0]!.status = 'DONE';
    d.tasks[0]!.output = 'Mention ghost src/missing.ts::nope only';
    ingestTask(graph, d.tasks[0]!, d, { cwd: projectRoot });

    const edges = graph.getEdges('task:t1', 'out');
    expect(edges.every((e) => !e.targetId.includes('missing.ts::nope'))).toBe(true);
  });

  it('should_be_idempotent_on_reingest', () => {
    const d = dag();
    d.tasks[0]!.status = 'DONE';
    d.tasks[0]!.output = 'src/math.ts';
    ingestTask(graph, d.tasks[0]!, d, { cwd: projectRoot });
    const stats1 = graph.getStatistics();
    ingestTask(graph, d.tasks[0]!, d, { cwd: projectRoot });
    const stats2 = graph.getStatistics();
    expect(stats2.totalNodes).toBe(stats1.totalNodes);
  });
});
