import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRanks } from '../dag-runner/run_dag.js';
import { spliceSubDag, type DagState, type SubTask } from '../dag-runner/sub-dag.js';

type ExecuteModule = typeof import('../commands/execute.js');

interface DagFixtureTask {
  readonly id: string;
  readonly dependsOn?: ReadonlyArray<string>;
  readonly prompt?: string;
}

interface PersistedTaskSeed {
  readonly id: string;
  readonly status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
  readonly parentId?: string;
  readonly dependsOn?: ReadonlyArray<string>;
  readonly error?: string;
}

interface PersistedTaskState {
  readonly status: string;
  readonly error?: string;
  readonly dependsOn?: ReadonlyArray<string>;
  readonly parentId?: string;
}

interface PersistedState {
  readonly tasks: Record<string, PersistedTaskState>;
}

const SRC_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NO_LLM_PATTERN = /openai|anthropic|@google\/generative-ai|langchain/i;

describe('dynamic dag regression audit (task-906)', () => {
  let projectRoot: string;
  let exitCode: number | undefined;
  let stdout: string;
  let stderr: string;

  beforeEach(async () => {
    vi.resetModules();
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dynamic-dag-regression-'));
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), {}, { spaces: 2 });
    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);

    exitCode = undefined;
    stdout = '';
    stderr = '';

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
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
    const execute = await import('../commands/execute.js');
    execute.setResolveDriverForTests(null);
    execute.setPreflightGuardForTests(null);
    execute.setRankApprovalForTests(null);
    vi.restoreAllMocks();
    await fs.remove(projectRoot).catch(() => undefined);
  });

  async function loadExecute(): Promise<ExecuteModule> {
    return import('../commands/execute.js');
  }

  async function runExecute(execute: ExecuteModule, args: string[]): Promise<void> {
    try {
      await execute.executeCommand.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('exit:')) throw err;
    }
  }

  async function writeDag(tasks: ReadonlyArray<DagFixtureTask>): Promise<void> {
    const lines: string[] = [
      'title: "Dynamic DAG Regression Fixture"',
      'version: "1.0.0"',
      'models:',
      '  HIGH: claude-sonnet',
      '  MED: claude-sonnet',
      '  LOW: claude-sonnet',
      'tasks:',
    ];

    for (const task of tasks) {
      const dependsOn = task.dependsOn ?? [];
      lines.push(`  - id: ${task.id}`);
      lines.push(`    title: "${task.id}"`);
      lines.push(
        dependsOn.length === 0
          ? '    depends_on: []'
          : `    depends_on: [${dependsOn.join(', ')}]`,
      );
      lines.push('    complexity: LOW');
      lines.push('    subtask_prompt: |');
      lines.push(`      ${task.prompt ?? `execute ${task.id}`}`);
    }

    await fs.writeFile(path.join(projectRoot, 'DARE', 'dare-dag.yaml'), `${lines.join('\n')}\n`);
  }

  async function writeConfig(config: Record<string, unknown>): Promise<void> {
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), config, { spaces: 2 });
  }

  async function writeState(tasks: ReadonlyArray<PersistedTaskSeed>): Promise<void> {
    const stateTasks = Object.fromEntries(
      tasks.map((task) => [
        task.id,
        {
          status: task.status,
          parentId: task.parentId,
          dependsOn: task.dependsOn ? [...task.dependsOn] : undefined,
          error: task.error,
        },
      ]),
    );

    await fs.ensureDir(path.join(projectRoot, '.dare'));
    await fs.writeJson(
      path.join(projectRoot, '.dare', 'state.json'),
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        tasks: stateTasks,
      },
      { spaces: 2 },
    );
  }

  async function readState(): Promise<PersistedState> {
    return (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as PersistedState;
  }

  it('replan_resolves_via_subdag', async () => {
    await writeDag([{ id: 'task-parent' }]);

    const policy = await import('../verification/decay/policy.js');
    vi.spyOn(policy, 'decideNextAction')
      .mockReturnValueOnce({
        action: 'REPLAN',
        attempt: 1,
        saturated: true,
        reason: 'signature saturation',
      })
      .mockReturnValue({
        action: 'DONE',
        attempt: 2,
        saturated: false,
        reason: 'verification passed',
      });

    const refine = await import('../commands/refine.js');
    vi.spyOn(refine, 'buildSplitProposal').mockResolvedValue({
      originalTaskId: 'task-parent',
      notes: 'split parent',
      subtasks: [
        {
          id: 'task-parent-a',
          title: 'task-parent-a',
          files: ['src/a.ts'],
          rationale: 'slice a',
          estimatedLevel: 'LOW',
        },
        {
          id: 'task-parent-b',
          title: 'task-parent-b',
          files: ['src/b.ts'],
          rationale: 'slice b',
          estimatedLevel: 'LOW',
        },
      ],
    });

    let parentRuns = 0;
    const execute = await loadExecute();
    execute.setResolveDriverForTests(async () => ({
      id: 'dynamic-dag-driver',
      requiresNetwork: false,
      async run(input) {
        if (input.taskId === 'task-parent' && parentRuns === 0) {
          parentRuns += 1;
          return {
            status: 'failed',
            worktree: input.worktree,
            summary: 'first parent attempt fails',
            usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'test-driver' },
            failureSignature: 'same-sig',
          };
        }
        return {
          status: 'implemented',
          worktree: input.worktree,
          summary: `ok ${input.taskId}`,
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'test-driver' },
        };
      },
    }));

    await runExecute(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const state = await readState();
    expect(Object.keys(state.tasks).sort()).toEqual(['task-parent', 'task-parent-a', 'task-parent-b']);
    expect(state.tasks['task-parent']?.status).toBe('DONE');
    expect(state.tasks['task-parent-a']?.status).toBe('DONE');
    expect(state.tasks['task-parent-b']?.status).toBe('DONE');
    expect(exitCode).toBeUndefined();
    expect(stderr).toBe('');
  });

  it('never_creates_cycle', async () => {
    await writeDag([{ id: 'task-parent' }]);

    const policy = await import('../verification/decay/policy.js');
    vi.spyOn(policy, 'decideNextAction').mockReturnValue({
      action: 'REPLAN',
      attempt: 1,
      saturated: true,
      reason: 'replan on saturation',
    });

    const refine = await import('../commands/refine.js');
    vi.spyOn(refine, 'buildSplitProposal').mockResolvedValue({
      originalTaskId: 'task-parent',
      notes: 'force cycle',
      subtasks: [
        {
          id: 'task-parent-cyclic',
          title: 'task-parent-cyclic',
          files: ['src/cycle.ts'],
          rationale: 'cycle candidate',
          estimatedLevel: 'LOW',
        },
      ],
    });

    const subDag = await import('../dag-runner/sub-dag.js');
    const realSplice = subDag.spliceSubDag;
    vi.spyOn(subDag, 'spliceSubDag').mockImplementation((dag, parentId, _subTasks, maxDepth) => {
      const cyclic: ReadonlyArray<SubTask> = [
        {
          id: `${parentId}-cycle`,
          parentId,
          dependsOn: [parentId],
          specPath: `DARE/EXECUTION/${parentId}-cycle.md`,
        },
      ];
      return realSplice(dag, parentId, cyclic, maxDepth);
    });

    const execute = await loadExecute();
    execute.setResolveDriverForTests(async () => ({
      id: 'cycle-driver',
      requiresNetwork: false,
      async run(input) {
        return {
          status: 'failed',
          worktree: input.worktree,
          summary: 'still failing',
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'cycle-driver' },
          failureSignature: 'cycle-sig',
        };
      },
    }));

    await runExecute(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const state = await readState();
    expect(Object.keys(state.tasks).sort()).toEqual(['task-parent']);
    expect(state.tasks['task-parent']?.status).toBe('FAILED');
    expect(state.tasks['task-parent']?.error).toContain('ESCALATE: replan would create a cycle');
    expect(exitCode).toBe(1);
  });

  it('respects_maxDepth_escalates', async () => {
    await writeDag([
      { id: 'task-root' },
      { id: 'task-nested', dependsOn: ['task-root'] },
    ]);
    await writeConfig({
      verification: {
        enabled: true,
        loop: { maxDepth: 1 },
      },
    });
    await writeState([
      { id: 'task-root', status: 'DONE', dependsOn: [] },
      {
        id: 'task-nested',
        status: 'PENDING',
        parentId: 'task-root',
        dependsOn: ['task-root'],
      },
    ]);

    const policy = await import('../verification/decay/policy.js');
    vi.spyOn(policy, 'decideNextAction').mockReturnValue({
      action: 'REPLAN',
      attempt: 1,
      saturated: true,
      reason: 'replan',
    });

    const refine = await import('../commands/refine.js');
    vi.spyOn(refine, 'buildSplitProposal').mockResolvedValue({
      originalTaskId: 'task-nested',
      notes: 'split nested',
      subtasks: [
        {
          id: 'task-nested-a',
          title: 'task-nested-a',
          files: ['src/nested.ts'],
          rationale: 'nested split',
          estimatedLevel: 'LOW',
        },
      ],
    });

    const execute = await loadExecute();
    execute.setResolveDriverForTests(async () => ({
      id: 'maxdepth-driver',
      requiresNetwork: false,
      async run(input) {
        if (input.taskId === 'task-nested') {
          return {
            status: 'failed',
            worktree: input.worktree,
            summary: 'nested fails',
            usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'maxdepth-driver' },
            failureSignature: 'nested-sig',
          };
        }
        return {
          status: 'implemented',
          worktree: input.worktree,
          summary: `ok ${input.taskId}`,
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'maxdepth-driver' },
        };
      },
    }));

    await runExecute(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const state = await readState();
    expect(Object.keys(state.tasks).sort()).toEqual(['task-nested', 'task-root']);
    expect(state.tasks['task-nested']?.status).toBe('FAILED');
    expect(state.tasks['task-nested']?.error).toContain('ESCALATE: max nesting depth');
    expect(exitCode).toBe(1);
  });

  it('flat_dag_unchanged', async () => {
    await writeDag([{ id: 'task-parent' }]);

    const policy = await import('../verification/decay/policy.js');
    vi.spyOn(policy, 'decideNextAction').mockReturnValue({
      action: 'ESCALATE',
      attempt: 1,
      saturated: false,
      reason: 'direct escalate',
    });

    const refine = await import('../commands/refine.js');
    const splitSpy = vi.spyOn(refine, 'buildSplitProposal');

    const execute = await loadExecute();
    execute.setResolveDriverForTests(async () => ({
      id: 'flat-driver',
      requiresNetwork: false,
      async run(input) {
        return {
          status: 'failed',
          worktree: input.worktree,
          summary: `fail ${input.taskId}`,
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'flat-driver' },
          failureSignature: 'flat-sig',
        };
      },
    }));

    await runExecute(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const state = await readState();
    expect(Object.keys(state.tasks)).toEqual(['task-parent']);
    expect(splitSpy).not.toHaveBeenCalled();
    expect(state.tasks['task-parent']?.status).toBe('FAILED');
    expect(state.tasks['task-parent']?.error).toContain('ESCALATE: direct escalate');
    expect(exitCode).toBe(1);
  });

  it('resplice_idempotent', async () => {
    await writeDag([{ id: 'task-parent' }]);

    const policy = await import('../verification/decay/policy.js');
    vi.spyOn(policy, 'decideNextAction').mockImplementation(({ result, current }) => {
      if (result.passed) {
        return {
          action: 'DONE',
          attempt: current.n,
          saturated: false,
          reason: 'passed',
        };
      }
      if (current.n <= 2) {
        return {
          action: 'REPLAN',
          attempt: current.n,
          saturated: true,
          reason: 'retry with same split',
        };
      }
      return {
        action: 'ESCALATE',
        attempt: current.n,
        saturated: false,
        reason: 'unexpected third failure',
      };
    });

    const refine = await import('../commands/refine.js');
    const splitSpy = vi.spyOn(refine, 'buildSplitProposal').mockResolvedValue({
      originalTaskId: 'task-parent',
      notes: 'stable split',
      subtasks: [
        {
          id: 'task-parent-a',
          title: 'task-parent-a',
          files: ['src/a.ts'],
          rationale: 'slice a',
          estimatedLevel: 'LOW',
        },
        {
          id: 'task-parent-b',
          title: 'task-parent-b',
          files: ['src/b.ts'],
          rationale: 'slice b',
          estimatedLevel: 'LOW',
        },
      ],
    });

    let parentFailures = 0;
    const execute = await loadExecute();
    execute.setResolveDriverForTests(async () => ({
      id: 'resplice-driver',
      requiresNetwork: false,
      async run(input) {
        if (input.taskId === 'task-parent' && parentFailures < 2) {
          parentFailures += 1;
          return {
            status: 'failed',
            worktree: input.worktree,
            summary: `parent fail #${parentFailures}`,
            usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'resplice-driver' },
            failureSignature: 'same-parent-sig',
          };
        }
        return {
          status: 'implemented',
          worktree: input.worktree,
          summary: `ok ${input.taskId}`,
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'resplice-driver' },
        };
      },
    }));

    await runExecute(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const state = await readState();
    expect(Object.keys(state.tasks).sort()).toEqual(['task-parent', 'task-parent-a', 'task-parent-b']);
    expect(state.tasks['task-parent']?.status).toBe('DONE');
    expect(state.tasks['task-parent-a']?.status).toBe('DONE');
    expect(state.tasks['task-parent-b']?.status).toBe('DONE');
    expect(
      state.tasks['task-parent']?.dependsOn?.filter((id) => id === 'task-parent-a').length,
    ).toBe(1);
    expect(
      state.tasks['task-parent']?.dependsOn?.filter((id) => id === 'task-parent-b').length,
    ).toBe(1);
    expect(splitSpy).toHaveBeenCalledTimes(2);
    expect(exitCode).toBeUndefined();
  });

  it('deterministic_no_llm_in_splice_toposort', async () => {
    for (const rel of ['dag-runner/sub-dag.ts', 'dag-runner/run_dag.ts']) {
      const content = await fs.readFile(path.join(SRC_ROOT, rel), 'utf8');
      expect(content).not.toMatch(NO_LLM_PATTERN);
    }

    const dag: DagState = {
      title: 'deterministic',
      version: '1.0.0',
      models: { cursor: { HIGH: 'h', MED: 'm', LOW: 'l' } },
      tasks: [
        {
          id: 'task-root',
          title: 'task-root',
          depends_on: [],
          complexity: 'LOW',
          subtask_prompt: 'root',
          status: 'PENDING',
        },
        {
          id: 'task-parent',
          title: 'task-parent',
          depends_on: ['task-root'],
          complexity: 'LOW',
          subtask_prompt: 'parent',
          status: 'PENDING',
        },
      ],
    };
    const subTasks: ReadonlyArray<SubTask> = [
      {
        id: 'task-parent-a',
        parentId: 'task-parent',
        dependsOn: ['task-root'],
        specPath: 'DARE/EXECUTION/task-parent-a.md',
      },
      {
        id: 'task-parent-b',
        parentId: 'task-parent',
        dependsOn: ['task-parent-a'],
        specPath: 'DARE/EXECUTION/task-parent-b.md',
      },
    ];

    const first = spliceSubDag(dag, 'task-parent', subTasks, 3);
    const second = spliceSubDag(dag, 'task-parent', subTasks, 3);
    expect(first).toEqual(second);

    const firstRanks = [...computeRanks(first.dag.tasks).entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const secondRanks = [...computeRanks(second.dag.tasks).entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    expect(firstRanks).toEqual(secondRanks);
  });
});
