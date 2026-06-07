import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {
  appendAttempt,
  getAttempts,
  loadAndApplyState,
  saveState,
} from '../../dag-runner/state-store.js';
import type { Dag, TaskStatus } from '../../dag-runner/run_dag.js';

function miniDag(taskId: string, status: TaskStatus = 'PENDING'): Dag {
  return {
    title: 'test',
    version: '1',
    models: {},
    tasks: [
      {
        id: taskId,
        title: 't',
        depends_on: [],
        complexity: 'LOW',
        subtask_prompt: 'test',
        status,
      },
    ],
  };
}

describe('state-store attempts', () => {
  let cwd: string;
  let stateFile: string;
  const taskId = 'task-store';

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-state-'));
    stateFile = path.join(cwd, '.dare', 'state.json');
    await fs.ensureDir(path.dirname(stateFile));
    await fs.writeJson(stateFile, {
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      tasks: {
        [taskId]: {
          status: 'RUNNING',
          output: 'partial',
        },
      },
    });
  });

  afterEach(async () => {
    await fs.remove(cwd).catch(() => undefined);
  });

  it('should_default_empty_attempts', async () => {
    const attempts = await getAttempts(cwd, taskId, stateFile);
    expect(attempts).toEqual([]);
  });

  it('should_append_monotonic', async () => {
    await appendAttempt(
      cwd,
      taskId,
      { at: 't1', passed: false, failureSignature: 'aaa' },
      stateFile,
    );
    await appendAttempt(
      cwd,
      taskId,
      { at: 't2', passed: false, failureSignature: 'aaa' },
      stateFile,
    );
    await appendAttempt(cwd, taskId, { at: 't3', passed: true }, stateFile);

    const attempts = await getAttempts(cwd, taskId, stateFile);
    expect(attempts.map((a) => a.n)).toEqual([1, 2, 3]);
    expect(attempts[2]?.passed).toBe(true);
  });

  it('should_persist_across_reload', async () => {
    await appendAttempt(
      cwd,
      taskId,
      { at: 't1', passed: false, failedAspect: 'test' },
      stateFile,
    );
    const reloaded = await getAttempts(cwd, taskId, stateFile);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.failedAspect).toBe('test');
  });

  it('should_not_break_existing_fields', async () => {
    await appendAttempt(
      cwd,
      taskId,
      { at: 't1', passed: false },
      stateFile,
    );

    const dag = miniDag(taskId, 'RUNNING');
    await loadAndApplyState(dag, stateFile);
    await saveState(dag, stateFile);

    const raw = (await fs.readJson(stateFile)) as {
      tasks: Record<string, { status: string; output?: string; attempts?: unknown[] }>;
    };
    expect(raw.tasks[taskId]?.status).toBe('RUNNING');
    expect(raw.tasks[taskId]?.output).toBe('partial');
    expect(raw.tasks[taskId]?.attempts).toHaveLength(1);
  });
});
