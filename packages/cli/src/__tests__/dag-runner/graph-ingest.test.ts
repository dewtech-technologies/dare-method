import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractComponents,
  extractEndpoints,
  extractFilePaths,
  extractSchemas,
  ingestTask,
} from '../../dag-runner/graph-ingest.js';
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

  it('deleteNode("task:<id>") drops stale state on reset', () => {
    const dag = sampleDag();
    dag.tasks[0].status = 'DONE';
    dag.tasks[0].output = 'Created src/auth.ts';
    ingestTask(graph, dag.tasks[0], dag);

    expect(graph.getNode('task:t1')).toBeDefined();
    graph.deleteNode('task:t1');
    expect(graph.getNode('task:t1')).toBeNull();
    // file node remains because reset doesn't necessarily mean files vanished
    expect(graph.getNode('file:src/auth.ts')).toBeDefined();
  });

  it('extracts endpoint nodes when output mentions HTTP routes', () => {
    const dag = sampleDag();
    const task = dag.tasks[0];
    task.status = 'DONE';
    task.output =
      'Implemented routes:\n' +
      '  POST /api/auth/login\n' +
      '  GET /api/auth/me\n' +
      '  DELETE /api/auth/logout';
    ingestTask(graph, task, dag);

    expect(graph.getNode('endpoint:POST:/api/auth/login')).toBeDefined();
    expect(graph.getNode('endpoint:GET:/api/auth/me')).toBeDefined();
    expect(graph.getNode('endpoint:DELETE:/api/auth/logout')).toBeDefined();
  });

  it('extracts schema nodes from migration phrasing', () => {
    const dag = sampleDag();
    const task = dag.tasks[0];
    task.status = 'DONE';
    task.output =
      'Migration applied:\n' +
      'CREATE TABLE users (id uuid primary key);\n' +
      "Schema::create('refresh_tokens', function (Blueprint $t) { ... })";
    ingestTask(graph, task, dag);

    expect(graph.getNode('schema:users')).toBeDefined();
    expect(graph.getNode('schema:refresh_tokens')).toBeDefined();
  });

  it('extracts component nodes from JSX/class usage', () => {
    const dag = sampleDag();
    const task = dag.tasks[0];
    task.status = 'DONE';
    task.output =
      'Built two components:\n' +
      'class UserForm extends React.Component { ... }\n' +
      'Used <ProfileCard userId={id} /> inside the dashboard.';
    ingestTask(graph, task, dag);

    expect(graph.getNode('component:UserForm')).toBeDefined();
    expect(graph.getNode('component:ProfileCard')).toBeDefined();
  });
});

describe('extractEndpoints', () => {
  it('captures method + path pairs', () => {
    const out = extractEndpoints('Implemented POST /api/users and GET /api/users/:id today.');
    expect(out).toEqual([
      { method: 'POST', path: '/api/users' },
      { method: 'GET', path: '/api/users/:id' },
    ]);
  });

  it('deduplicates equal endpoints', () => {
    const out = extractEndpoints('POST /a/b\nWe wrote POST /a/b again.');
    expect(out).toHaveLength(1);
  });
});

describe('extractSchemas', () => {
  it('finds CREATE TABLE names', () => {
    const out = extractSchemas('Now CREATE TABLE products (id int);');
    expect(out).toContain('products');
  });

  it('finds Schema::create names (Laravel)', () => {
    const out = extractSchemas("Schema::create('orders', function () { });");
    expect(out).toContain('orders');
  });

  it('ignores stop words', () => {
    const out = extractSchemas('CREATE TABLE the (id int);');
    expect(out).not.toContain('the');
  });
});

describe('extractComponents', () => {
  it('captures class components', () => {
    const out = extractComponents('class LoginForm extends Component { }');
    expect(out).toContain('LoginForm');
  });

  it('captures JSX usage', () => {
    const out = extractComponents('Use <UserCard userId={id} /> here.');
    expect(out).toContain('UserCard');
  });

  it('ignores known framework primitives', () => {
    const out = extractComponents('Wrapped in <Provider><Router>...</Router></Provider>');
    expect(out).not.toContain('Provider');
    expect(out).not.toContain('Router');
  });
});
