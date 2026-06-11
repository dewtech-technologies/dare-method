import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

type ExecuteModule = typeof import('../execute.js');

describe('dare execute --agent replan splice', () => {
  let projectRoot: string;
  let exitCode: number | undefined;
  let stdout: string;
  let stderr: string;

  beforeEach(async () => {
    vi.resetModules();
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-replan-splice-'));
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
      stdout += args.map(String).join(' ') + '\n';
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      stderr += args.map(String).join(' ') + '\n';
    });
  });

  afterEach(async () => {
    const execute = await import('../execute.js');
    execute.setResolveDriverForTests(null);
    execute.setPreflightGuardForTests(null);
    execute.setRankApprovalForTests(null);
    vi.restoreAllMocks();
    await fs.remove(projectRoot).catch(() => undefined);
  });

  async function loadExecute(): Promise<ExecuteModule> {
    return import('../execute.js');
  }

  async function run(execute: ExecuteModule, args: string[]): Promise<void> {
    try {
      await execute.executeCommand.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('exit:')) throw err;
    }
  }

  async function writeDag(tasks: ReadonlyArray<{
    id: string;
    dependsOn?: ReadonlyArray<string>;
    prompt?: string;
  }>): Promise<void> {
    const lines: string[] = [
      'title: "Replan Fixture"',
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

  async function readState(): Promise<Record<string, { status: string; error?: string }>> {
    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { status: string; error?: string }>;
    };
    return state.tasks;
  }

  it('replan_splices_subdag', async () => {
    await writeDag([{ id: 'task-parent' }]);

    const policy = await import('../../verification/decay/policy.js');
    const decideSpy = vi
      .spyOn(policy, 'decideNextAction')
      .mockReturnValueOnce({
        action: 'REPLAN',
        attempt: 1,
        saturated: true,
        reason: 'saturated failure signature',
      })
      .mockReturnValue({
        action: 'DONE',
        attempt: 2,
        saturated: false,
        reason: 'passed',
      });

    const refine = await import('../refine.js');
    vi.spyOn(refine, 'buildSplitProposal').mockResolvedValue({
      originalTaskId: 'task-parent',
      notes: 'split',
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
      id: 'replan-driver',
      requiresNetwork: false,
      async run(input) {
        if (input.taskId === 'task-parent' && parentRuns === 0) {
          parentRuns += 1;
          return {
            status: 'failed',
            worktree: input.worktree,
            summary: 'parent failed once',
            usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'test' },
            failureSignature: 'sig-parent',
          };
        }
        return {
          status: 'implemented',
          worktree: input.worktree,
          summary: `ok ${input.taskId}`,
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'test' },
        };
      },
    }));

    await run(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const tasks = await readState();
    expect(Object.keys(tasks).sort()).toEqual(['task-parent', 'task-parent-a', 'task-parent-b']);
    expect(tasks['task-parent']?.status).toBe('DONE');
    expect(tasks['task-parent-a']?.status).toBe('DONE');
    expect(tasks['task-parent-b']?.status).toBe('DONE');
    expect(decideSpy).toHaveBeenCalled();
    expect(exitCode).toBeUndefined();
    expect(stderr).toBe('');
  });

  it('maxdepth_escalates', async () => {
    await writeDag([{ id: 'task-parent' }]);

    const policy = await import('../../verification/decay/policy.js');
    vi.spyOn(policy, 'decideNextAction').mockReturnValue({
      action: 'REPLAN',
      attempt: 1,
      saturated: true,
      reason: 'retry with replan',
    });

    const refine = await import('../refine.js');
    vi.spyOn(refine, 'buildSplitProposal').mockResolvedValue({
      originalTaskId: 'task-parent',
      notes: 'split',
      subtasks: [
        {
          id: 'task-parent-a',
          title: 'task-parent-a',
          files: ['src/a.ts'],
          rationale: 'slice a',
          estimatedLevel: 'LOW',
        },
      ],
    });

    const subDag = await import('../../dag-runner/sub-dag.js');
    vi.spyOn(subDag, 'spliceSubDag').mockImplementation(() => {
      throw new subDag.MaxDepthError('depth exceeded');
    });

    const execute = await loadExecute();
    execute.setResolveDriverForTests(async () => ({
      id: 'failing-driver',
      requiresNetwork: false,
      async run(input) {
        return {
          status: 'failed',
          worktree: input.worktree,
          summary: 'still failing',
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'test' },
          failureSignature: 'same-sig',
        };
      },
    }));

    await run(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const tasks = await readState();
    expect(tasks['task-parent']?.error).toContain('ESCALATE: max nesting depth');
    expect(exitCode).toBe(1);
  });

  it('cycle_escalates', async () => {
    await writeDag([{ id: 'task-parent' }]);

    const policy = await import('../../verification/decay/policy.js');
    vi.spyOn(policy, 'decideNextAction').mockReturnValue({
      action: 'REPLAN',
      attempt: 1,
      saturated: true,
      reason: 'retry with replan',
    });

    const refine = await import('../refine.js');
    vi.spyOn(refine, 'buildSplitProposal').mockResolvedValue({
      originalTaskId: 'task-parent',
      notes: 'split',
      subtasks: [
        {
          id: 'task-parent-a',
          title: 'task-parent-a',
          files: ['src/a.ts'],
          rationale: 'slice a',
          estimatedLevel: 'LOW',
        },
      ],
    });

    const subDag = await import('../../dag-runner/sub-dag.js');
    vi.spyOn(subDag, 'spliceSubDag').mockImplementation(() => {
      throw new subDag.CycleError('cycle');
    });

    const execute = await loadExecute();
    execute.setResolveDriverForTests(async () => ({
      id: 'failing-driver',
      requiresNetwork: false,
      async run(input) {
        return {
          status: 'failed',
          worktree: input.worktree,
          summary: 'still failing',
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'test' },
          failureSignature: 'same-sig',
        };
      },
    }));

    await run(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const tasks = await readState();
    expect(tasks['task-parent']?.error).toContain('ESCALATE: replan would create a cycle');
    expect(exitCode).toBe(1);
  });

  it('no_replan_flat_unchanged', async () => {
    await writeDag([{ id: 'task-parent' }]);

    const policy = await import('../../verification/decay/policy.js');
    vi.spyOn(policy, 'decideNextAction').mockReturnValue({
      action: 'ESCALATE',
      attempt: 1,
      saturated: false,
      reason: 'direct escalate',
    });

    const refine = await import('../refine.js');
    const splitSpy = vi.spyOn(refine, 'buildSplitProposal');

    const execute = await loadExecute();
    execute.setResolveDriverForTests(async () => ({
      id: 'failing-driver',
      requiresNetwork: false,
      async run(input) {
        return {
          status: 'failed',
          worktree: input.worktree,
          summary: 'still failing',
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'test' },
          failureSignature: 'same-sig',
        };
      },
    }));

    await run(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const tasks = await readState();
    expect(Object.keys(tasks)).toEqual(['task-parent']);
    expect(splitSpy).not.toHaveBeenCalled();
    expect(tasks['task-parent']?.error).toContain('ESCALATE: direct escalate');
    expect(exitCode).toBe(1);
  });

  it('reuses_decideNextAction', async () => {
    await writeDag([{ id: 'task-parent' }]);

    const policy = await import('../../verification/decay/policy.js');
    const decideSpy = vi.spyOn(policy, 'decideNextAction');

    const execute = await loadExecute();
    execute.setResolveDriverForTests(async () => ({
      id: 'ok-driver',
      requiresNetwork: false,
      async run(input) {
        return {
          status: 'implemented',
          worktree: input.worktree,
          summary: 'implemented',
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'test' },
        };
      },
    }));

    await run(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    expect(decideSpy).toHaveBeenCalled();
    expect(exitCode).toBeUndefined();
  });
});
