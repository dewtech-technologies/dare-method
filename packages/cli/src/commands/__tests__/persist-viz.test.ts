import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { loadAndApplyState, saveState } from '../../dag-runner/state-store.js';
import type { Dag } from '../../dag-runner/run_dag.js';

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function baseDag(tasks: Dag['tasks']): Dag {
  return {
    title: 'Persist Viz Fixture',
    version: '1.0.0',
    models: {},
    tasks,
  };
}

describe('persist-viz', () => {
  let projectRoot: string;
  let stdout: string;
  let stderr: string;
  let exitCode: number | undefined;

  beforeEach(async () => {
    vi.resetModules();
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-persist-viz-'));
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    await fs.ensureDir(path.join(projectRoot, '.dare'));

    stdout = '';
    stderr = '';
    exitCode = undefined;

    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
    vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      exitCode = Number(code ?? 0);
      throw new Error(`exit:${code}`);
    });
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout += `${args.map(String).join(' ')}\n`;
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      stderr += `${args.map(String).join(' ')}\n`;
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(projectRoot).catch(() => undefined);
  });

  async function runCommand(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('exit:')) throw err;
    }
  }

  async function writeDagYaml(): Promise<void> {
    await fs.writeFile(
      path.join(projectRoot, 'DARE', 'dare-dag.yaml'),
      [
        'title: "Persist Viz Fixture"',
        'version: "1.0.0"',
        'models:',
        '  HIGH: claude-sonnet',
        '  MED: claude-sonnet',
        '  LOW: claude-sonnet',
        'tasks:',
        '  - id: task-root',
        '    title: "task-root"',
        '    depends_on: []',
        '    complexity: LOW',
        '    subtask_prompt: |',
        '      root',
        '  - id: task-parent',
        '    title: "task-parent"',
        '    depends_on: [task-root]',
        '    complexity: MED',
        '    subtask_prompt: |',
        '      parent',
      ].join('\n'),
    );
  }

  async function writeNestedState(): Promise<void> {
    await fs.writeJson(
      path.join(projectRoot, '.dare', 'state.json'),
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        tasks: {
          'task-root': {
            status: 'DONE',
            dependsOn: [],
          },
          'task-parent': {
            status: 'PENDING',
            dependsOn: ['task-root', 'task-parent-a'],
          },
          'task-parent-a': {
            status: 'RUNNING',
            parentId: 'task-parent',
            dependsOn: ['task-root'],
          },
        },
      },
      { spaces: 2 },
    );
  }

  it('nesting_roundtrips_state', async () => {
    const stateFile = path.join(projectRoot, '.dare', 'state.json');
    const original = baseDag([
      {
        id: 'task-root',
        title: 'task-root',
        depends_on: [],
        complexity: 'LOW',
        subtask_prompt: 'root',
        status: 'DONE',
      },
      {
        id: 'task-parent',
        title: 'task-parent',
        depends_on: ['task-root', 'task-parent-a'],
        complexity: 'MED',
        subtask_prompt: 'parent',
        status: 'PENDING',
      },
      {
        id: 'task-parent-a',
        title: 'task-parent-a',
        depends_on: ['task-root'],
        __parentId: 'task-parent',
        complexity: 'MED',
        subtask_prompt: 'sub',
        status: 'RUNNING',
      },
    ]);
    await saveState(original, stateFile);

    const reloaded = baseDag([
      {
        id: 'task-root',
        title: 'task-root',
        depends_on: [],
        complexity: 'LOW',
        subtask_prompt: 'root',
      },
      {
        id: 'task-parent',
        title: 'task-parent',
        depends_on: ['task-root'],
        complexity: 'MED',
        subtask_prompt: 'parent',
      },
    ]);
    await loadAndApplyState(reloaded, stateFile);

    const child = reloaded.tasks.find((task) => task.id === 'task-parent-a');
    const parent = reloaded.tasks.find((task) => task.id === 'task-parent');
    expect(child?.__parentId).toBe('task-parent');
    expect(child?.depends_on).toEqual(['task-root']);
    expect(child?.status).toBe('RUNNING');
    expect(parent?.depends_on).toEqual(['task-root', 'task-parent-a']);
  });

  it('status_shows_nesting', async () => {
    await writeDagYaml();
    await writeNestedState();

    const execute = await import('../execute.js');
    await runCommand(() => execute.executeCommand.parseAsync(['--status'], { from: 'user' }));

    const output = stripAnsi(stdout);
    expect(exitCode).toBeUndefined();
    expect(stderr).toBe('');
    expect(output).toContain('Sub-DAG nesting');
    expect(output).toContain('• task-parent');
    expect(output).toContain('- task-parent-a (RUNNING)');
  });

  it('viz_groups_subdag', async () => {
    await writeDagYaml();
    await writeNestedState();

    const dag = await import('../dag.js');
    await runCommand(() =>
      dag.dagCommand.parseAsync(
        ['viz', '--dag', 'DARE/dare-dag.yaml', '--format', 'mermaid'],
        { from: 'user' },
      ),
    );

    const output = stripAnsi(stdout);
    expect(exitCode).toBeUndefined();
    expect(stderr).toBe('');
    expect(output).toContain('subgraph subdag_task_parent');
    expect(output).toContain('Sub-DAG: task-parent');
    expect(output).toContain('task_parent_a');
  });
});
