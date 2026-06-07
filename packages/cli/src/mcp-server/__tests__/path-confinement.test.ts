import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createMcpServer } from '../server.js';

const MALICIOUS_PROJECT_PATHS = [
  '../../../etc/passwd',
  '..\\..\\..\\windows\\system32',
  '/etc/passwd',
  'C:\\Windows\\System32',
  '....//....//etc/passwd',
  '..%2f..%2f..%2fetc%2fpasswd',
  'DARE/../../../etc/passwd',
  '/tmp/../../etc/passwd',
  '\\\\?\\C:\\secret',
  'file:///etc/passwd',
  '....\\....\\etc\\passwd',
  '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
  'foo/../../../bar',
  '....//....//....//etc/passwd',
  '..;/..;/..;/etc/passwd',
  '.\\..\\.\\..\\.\\etc\\passwd',
  'DARE/..\\..\\..\\secret',
  'null\0byte',
  'task/../../dare.config.json',
  '/proc/self/environ',
  'http://evil.com/../../../etc/passwd',
  'zip://../../etc/passwd',
  '~/.ssh/id_rsa',
  '$HOME/../../etc/passwd',
];

const INVALID_TASK_IDS = [
  '../../../etc/passwd',
  '..%2F..%2Fetc%2Fpasswd',
  'task-../escape',
  'not-a-task',
  'task-',
  'TASK-001',
  'task-001/extra',
  'task-001/../../../secret',
  '%2e%2e%2fsecret',
];

describe('MCP path confinement', () => {
  let projectRoot: string;
  let outsideSecret: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-confine-'));
    outsideSecret = path.join(path.dirname(projectRoot), `outside-secret-${Date.now()}.txt`);
    await fs.writeFile(outsideSecret, 'OUTSIDE_SECRET_DATA');
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    await fs.writeFile(
      path.join(projectRoot, 'DARE', 'TASKS.md'),
      '| task-001 | demo | ⏳ PENDING |\n| task-abc-extra | other | ✅ DONE |',
    );
    await fs.writeFile(path.join(projectRoot, 'DARE', 'BLUEPRINT.md'), '# Architecture\nsecurity hardening\n');
    await fs.writeFile(path.join(projectRoot, 'DARE', 'dare-dag.yaml'), 'tasks:\n  - id: task-001\n');
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), { name: 'confine-test' });
  });

  afterEach(async () => {
    await fs.remove(projectRoot).catch(() => undefined);
    await fs.remove(outsideSecret).catch(() => undefined);
  });

  function app() {
    return createMcpServer(projectRoot, { authToken: 'confine-test-token' });
  }

  function assertNoLeak(body: unknown): void {
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('OUTSIDE_SECRET_DATA');
    expect(serialized).not.toMatch(/[A-Za-z]:\\Users\\/);
    expect(serialized).not.toMatch(/\/etc\/passwd/);
    expect(serialized).not.toContain(projectRoot);
  }

  for (const malicious of MALICIOUS_PROJECT_PATHS) {
    it(`ignores malicious projectPath in context/query: ${malicious.slice(0, 40)}`, async () => {
      const res = await request(app())
        .post('/context/query')
        .send({ type: 'task', query: 'task-001', projectPath: malicious });

      expect([200, 400]).toContain(res.status);
      assertNoLeak(res.body);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  }

  it('health returns basename only, never absolute project root', async () => {
    const res = await request(app()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.projectRoot).toBe(path.basename(projectRoot));
    expect(res.body.projectRoot).not.toBe(projectRoot);
    assertNoLeak(res.body);
  });

  it('rejects empty query with 400', async () => {
    const res = await request(app())
      .post('/context/query')
      .send({ type: 'task', query: '' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'query is required' });
  });

  it('rejects invalid context type with 400', async () => {
    const res = await request(app())
      .post('/context/query')
      .send({ type: 'evil', query: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid context type' });
  });

  for (const taskId of INVALID_TASK_IDS) {
    it(`rejects invalid task id GET /tasks/${taskId.slice(0, 30)}`, async () => {
      const res = await request(app()).get(`/tasks/${encodeURIComponent(taskId)}`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid task id' });
      assertNoLeak(res.body);
    });
  }

  it('accepts valid task-001 id', async () => {
    const res = await request(app()).get('/tasks/task-001');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('task-001');
  });

  it('accepts valid task-abc-extra id', async () => {
    const res = await request(app()).get('/tasks/task-abc-extra');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('task-abc-extra');
  });

  it('blueprint reads only under project DARE/', async () => {
    const res = await request(app()).get('/blueprint');
    expect(res.status).toBe(200);
    expect(res.body.content).toContain('Architecture');
    assertNoLeak(res.body);
  });

  it('project config reads only dare.config.json under root', async () => {
    const res = await request(app()).get('/project');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('confine-test');
    assertNoLeak(res.body);
  });
});
