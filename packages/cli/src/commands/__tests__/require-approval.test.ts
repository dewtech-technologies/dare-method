import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

type ExecuteModule = typeof import('../execute.js');

describe('dare execute --agent --require-approval', () => {
  let projectRoot: string;
  let exitCode: number | undefined;
  let stdout: string;
  let stderr: string;
  let originalStdoutIsTTY: boolean | undefined;
  let originalStdinIsTTY: boolean | undefined;

  beforeEach(async () => {
    vi.resetModules();
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-require-approval-'));
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), {}, { spaces: 2 });
    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);

    originalStdoutIsTTY = process.stdout.isTTY;
    originalStdinIsTTY = process.stdin.isTTY;

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

    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdoutIsTTY,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalStdinIsTTY,
      writable: true,
      configurable: true,
    });

    vi.restoreAllMocks();
    await fs.remove(projectRoot).catch(() => undefined);
  });

  function setTty(stdin: boolean, stdout: boolean = stdin): void {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: stdin,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: stdout,
      writable: true,
      configurable: true,
    });
  }

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

  async function writeDag(tasks: ReadonlyArray<{ id: string; dependsOn?: ReadonlyArray<string> }>): Promise<void> {
    const lines: string[] = [
      'title: "Approval Fixture"',
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
      lines.push(`      execute ${task.id}`);
    }

    await fs.writeFile(path.join(projectRoot, 'DARE', 'dare-dag.yaml'), `${lines.join('\n')}\n`);
  }

  it('rank_pauses_between_ranks', async () => {
    setTty(true);
    await writeDag([
      { id: 'task-a' },
      { id: 'task-b', dependsOn: ['task-a'] },
    ]);
    const execute = await loadExecute();
    const approvalCalls: number[] = [];
    execute.setRankApprovalForTests(async (rank) => {
      approvalCalls.push(rank);
      return true;
    });

    await run(execute, ['--agent', '--dry-run', '--require-approval', 'rank', '--no-graph']);

    expect(approvalCalls).toEqual([0, 1]);
    expect(exitCode).toBeUndefined();
    expect(stderr).toBe('');
  });

  it('none_does_not_prompt', async () => {
    setTty(false);
    await writeDag([
      { id: 'task-a' },
      { id: 'task-b', dependsOn: ['task-a'] },
    ]);
    const execute = await loadExecute();
    const approvalSpy = vi.fn(async () => true);
    execute.setRankApprovalForTests(approvalSpy);

    await run(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    expect(approvalSpy).not.toHaveBeenCalled();
    expect(exitCode).toBeUndefined();
    expect(stderr).toBe('');
  });

  it('decline_preserves_pending', async () => {
    setTty(true);
    await writeDag([
      { id: 'task-a' },
      { id: 'task-b', dependsOn: ['task-a'] },
    ]);
    const execute = await loadExecute();
    let approvalCount = 0;
    execute.setRankApprovalForTests(async () => {
      approvalCount += 1;
      return approvalCount === 1;
    });

    await run(execute, ['--agent', '--dry-run', '--require-approval', 'rank', '--no-graph']);

    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { status: string }>;
    };
    expect(state.tasks['task-a']?.status).toBe('DONE');
    expect(state.tasks['task-b']?.status).toBe('PENDING');
    expect(stdout).toContain('paused by approval policy');
    expect(exitCode).toBeUndefined();
  });

  it('non_interactive_rank_requires_none', async () => {
    setTty(false);
    await writeDag([{ id: 'task-a' }]);
    const execute = await loadExecute();

    await run(execute, ['--agent', '--dry-run', '--require-approval', 'rank', '--no-graph']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("--require-approval none");
  });
});
