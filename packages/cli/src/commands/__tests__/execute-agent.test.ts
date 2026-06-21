import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

type ExecuteModule = typeof import('../execute.js');

describe('dare execute --agent', () => {
  let projectRoot: string;
  let exitCode: number | undefined;
  let stdout: string;
  let stderr: string;

  beforeEach(async () => {
    vi.resetModules();
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-exec-agent-'));
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

    const claude = await import('../../agent/drivers/claude.js');
    claude.setClaudeSdkImporterForTests(null);

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
      'title: "Agent Fixture"',
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

  it('dry_run_drives_dag_to_done', async () => {
    await writeDag([
      { id: 'task-a' },
      { id: 'task-b', dependsOn: ['task-a'] },
    ]);
    const execute = await loadExecute();

    await run(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { status: string }>;
    };
    expect(state.tasks['task-a']?.status).toBe('DONE');
    expect(state.tasks['task-b']?.status).toBe('DONE');
    expect(exitCode).toBeUndefined();
    expect(stderr).toBe('');
  });

  it('codex_provider_drives_dag_to_done', async () => {
    await writeDag([{ id: 'task-codex' }]);
    await fs.writeJson(
      path.join(projectRoot, 'dare.config.json'),
      {
        agent: {
          provider: 'codex',
          model: 'gpt-5.4',
        },
      },
      { spaces: 2 },
    );

    const safeSpawn = await import('../../exec/safe-spawn.js');
    const spawnSpy = vi.spyOn(safeSpawn, 'safeSpawn').mockResolvedValue({
      code: 0,
      stdout: [
        JSON.stringify({
          type: 'item.completed',
          item: { type: 'agent_message', text: 'codex implemented task' },
        }),
        JSON.stringify({
          type: 'turn.completed',
          usage: { input_tokens: 12, output_tokens: 3 },
        }),
      ].join('\n'),
      stderr: '',
      timedOut: false,
    });

    const execute = await loadExecute();
    await run(execute, ['--agent', '--require-approval', 'none', '--no-graph']);

    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { status: string; tokens?: number; output?: string }>;
    };
    expect(spawnSpy).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['exec', '--json', '--model', 'gpt-5.4']),
      expect.objectContaining({ cwd: expect.stringContaining('task-codex') }),
    );
    expect(state.tasks['task-codex']?.status).toBe('DONE');
    expect(state.tasks['task-codex']?.tokens).toBe(15);
    expect(state.tasks['task-codex']?.output).toContain('codex implemented task');
    expect(exitCode).toBeUndefined();
    expect(stderr).toBe('');
  });

  it('reuses_decideNextAction', async () => {
    await writeDag([{ id: 'task-fail' }]);
    await fs.ensureDir(path.join(projectRoot, '.dare'));
    await fs.writeJson(
      path.join(projectRoot, '.dare', 'state.json'),
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        tasks: {
          'task-fail': {
            status: 'PENDING',
            attempts: [
              {
                n: 1,
                at: '2026-01-01T00:00:00.000Z',
                passed: false,
                failureSignature: 'deadbeef',
                failedAspect: 'test',
              },
              {
                n: 2,
                at: '2026-01-01T00:01:00.000Z',
                passed: false,
                failureSignature: 'deadbeef',
                failedAspect: 'test',
              },
            ],
          },
        },
      },
      { spaces: 2 },
    );

    const policy = await import('../../verification/decay/policy.js');
    const decideSpy = vi.spyOn(policy, 'decideNextAction');

    const execute = await loadExecute();
    execute.setResolveDriverForTests(async () => ({
      id: 'test-failing-driver',
      requiresNetwork: false,
      async run(input) {
        return {
          status: 'failed',
          worktree: input.worktree,
          summary: 'candidate failed',
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'test' },
          failureSignature: 'deadbeef',
        };
      },
    }));

    await run(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { error?: string }>;
    };
    expect(decideSpy).toHaveBeenCalled();
    expect(state.tasks['task-fail']?.error).toContain('FRESH_START');
    expect(exitCode).toBe(1);
  });

  it('best_of_n_counts_all_in_budget', async () => {
    await writeDag([{ id: 'task-budget' }]);
    const execute = await loadExecute();
    execute.setResolveDriverForTests(async () => ({
      id: 'budget-driver',
      requiresNetwork: false,
      async run(input) {
        return {
          status: 'implemented',
          worktree: input.worktree,
          summary: 'ok',
          usage: { inputTokens: 10, outputTokens: 0, costUsd: 0.01, model: 'test' },
        };
      },
    }));

    await run(execute, [
      '--agent',
      '--dry-run',
      '--best-of',
      '3',
      '--require-approval',
      'none',
      '--no-graph',
    ]);

    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { tokens?: number; status: string }>;
    };
    expect(state.tasks['task-budget']?.status).toBe('DONE');
    expect(state.tasks['task-budget']?.tokens).toBe(30);
    expect(exitCode).toBeUndefined();
  });

  it('cursor_provider_drives_dag_to_done', async () => {
    await writeDag([{ id: 'task-cursor' }]);
    await fs.writeJson(
      path.join(projectRoot, 'dare.config.json'),
      { agent: { provider: 'cursor-cli' } },
      { spaces: 2 },
    );

    const safeSpawn = await import('../../exec/safe-spawn.js');
    const spawnSpy = vi.spyOn(safeSpawn, 'safeSpawn').mockResolvedValue({
      code: 0,
      stdout: 'cursor implemented task',
      stderr: '',
      timedOut: false,
    });

    const execute = await loadExecute();
    await run(execute, ['--agent', '--require-approval', 'none', '--no-graph']);

    expect(spawnSpy).toHaveBeenCalledWith(
      'cursor-agent',
      expect.arrayContaining(['-p', expect.any(String), '--output-format', 'text']),
      expect.objectContaining({ cwd: expect.stringContaining('task-cursor') }),
    );
    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { status: string; output?: string }>;
    };
    expect(state.tasks['task-cursor']?.status).toBe('DONE');
    expect(state.tasks['task-cursor']?.output).toContain('cursor implemented task');
  });

  it('antigravity_provider_drives_dag_to_done', async () => {
    await writeDag([{ id: 'task-antigravity' }]);
    await fs.writeJson(
      path.join(projectRoot, 'dare.config.json'),
      { agent: { provider: 'antigravity-cli' } },
      { spaces: 2 },
    );

    const safeSpawn = await import('../../exec/safe-spawn.js');
    const spawnSpy = vi.spyOn(safeSpawn, 'safeSpawn').mockResolvedValue({
      code: 0,
      stdout: 'antigravity implemented task',
      stderr: '',
      timedOut: false,
    });

    const execute = await loadExecute();
    await run(execute, ['--agent', '--require-approval', 'none', '--no-graph']);

    expect(spawnSpy).toHaveBeenCalledWith(
      'antigravity',
      expect.arrayContaining(['-p', expect.any(String), '--output-format', 'text']),
      expect.objectContaining({ cwd: expect.stringContaining('task-antigravity') }),
    );
    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { status: string; output?: string }>;
    };
    expect(state.tasks['task-antigravity']?.status).toBe('DONE');
    expect(state.tasks['task-antigravity']?.output).toContain('antigravity implemented task');
  });

  it('unknown_driver_exits_with_clear_error', async () => {
    await writeDag([{ id: 'task-unknown' }]);
    const execute = await loadExecute();
    await run(execute, [
      '--agent',
      '--driver',
      'not-a-real-driver',
      '--require-approval',
      'none',
      '--no-graph',
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('--driver must be one of:');
  });

  it('missing_sdk_exits_1', async () => {
    await writeDag([{ id: 'task-sdk' }]);
    const claude = await import('../../agent/drivers/claude.js');
    claude.setClaudeSdkImporterForTests(async () => {
      throw new Error('sdk missing');
    });

    const execute = await loadExecute();
    await run(execute, ['--agent', '--require-approval', 'none', '--no-graph']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Optional dependency '@anthropic-ai/sdk' not installed");
  });

  it('guard_fail_blocks_task', async () => {
    await writeDag([{ id: 'task-guard' }]);
    const execute = await loadExecute();
    execute.setPreflightGuardForTests(async () => ({
      verdict: 'FAIL',
      artifacts: [],
      reason: 'blocked by guard stub',
    }));

    await run(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    expect(exitCode).toBe(6);
    expect(stdout).not.toContain('DONE');
  });
});
