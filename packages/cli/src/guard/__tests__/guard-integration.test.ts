import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

type ExecuteModule = typeof import('../../commands/execute.js');
type GuardModule = typeof import('../../commands/guard.js');

interface DagFixtureTask {
  readonly id: string;
  readonly specFile?: string;
  readonly prompt?: string;
}

function keyPairPem(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

describe('guard integration', () => {
  let projectRoot: string;
  let exitCode: number | undefined;
  let stdout: string;
  let stderr: string;
  let previousSigningKeyEnv: string | undefined;

  beforeEach(async () => {
    vi.resetModules();
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-guard-integration-'));
    await fs.ensureDir(path.join(projectRoot, 'DARE', 'EXECUTION'));

    previousSigningKeyEnv = process.env.DARE_GUARD_PRIVATE_KEY;
    delete process.env.DARE_GUARD_PRIVATE_KEY;

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
    const execute = await import('../../commands/execute.js');
    execute.setResolveDriverForTests(null);
    execute.setPreflightGuardForTests(null);
    execute.setRankApprovalForTests(null);

    if (previousSigningKeyEnv === undefined) {
      delete process.env.DARE_GUARD_PRIVATE_KEY;
    } else {
      process.env.DARE_GUARD_PRIVATE_KEY = previousSigningKeyEnv;
    }

    vi.restoreAllMocks();
    await fs.remove(projectRoot).catch(() => undefined);
  });

  async function loadExecute(): Promise<ExecuteModule> {
    return import('../../commands/execute.js');
  }

  async function loadGuard(): Promise<GuardModule> {
    return import('../../commands/guard.js');
  }

  async function runExecute(
    execute: ExecuteModule,
    args: string[],
  ): Promise<void> {
    try {
      await execute.executeCommand.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('exit:')) throw err;
    }
  }

  async function runGuard(
    guard: GuardModule,
    args: string[],
  ): Promise<void> {
    try {
      await guard.guardCommand.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('exit:')) throw err;
    }
  }

  async function writeDag(task: DagFixtureTask): Promise<void> {
    const lines: string[] = [
      'title: "Guard Integration Fixture"',
      'version: "1.0.0"',
      'models:',
      '  HIGH: claude-sonnet',
      '  MED: claude-sonnet',
      '  LOW: claude-sonnet',
      'tasks:',
      `  - id: ${task.id}`,
      `    title: "${task.id}"`,
      '    depends_on: []',
      '    complexity: LOW',
    ];
    if (task.specFile) {
      lines.push(`    spec_file: ${task.specFile.replace(/\\/g, '/')}`);
    }
    lines.push('    subtask_prompt: |');
    lines.push(`      ${task.prompt ?? `run ${task.id}`}`);
    await fs.writeFile(path.join(projectRoot, 'DARE', 'dare-dag.yaml'), `${lines.join('\n')}\n`);
  }

  async function writeGuardConfig(guardBlock: Record<string, unknown>): Promise<void> {
    await fs.writeJson(
      path.join(projectRoot, 'dare.config.json'),
      { guard: guardBlock },
      { spaces: 2 },
    );
  }

  it('fail_artifact_blocks_task', async () => {
    const specPath = 'DARE/EXECUTION/task-block.md';
    await fs.writeFile(path.join(projectRoot, specPath), `abc\u202Edef`, 'utf8');
    await writeDag({ id: 'task-block', specFile: specPath });
    await writeGuardConfig({
      enabled: true,
      onExecute: true,
      unicode: 'block',
      trustedPaths: ['DARE/EXECUTION/**'],
      signing: { enabled: false },
    });

    const execute = await loadExecute();
    const runSpy = vi.fn(async (input: { worktree: string }) => ({
      status: 'implemented' as const,
      worktree: input.worktree,
      summary: 'should-not-run',
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'test' },
    }));
    execute.setResolveDriverForTests(async () => ({
      id: 'integration-driver',
      requiresNetwork: false,
      run: runSpy,
    }));

    await runExecute(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    expect(exitCode).toBe(6);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('signed_but_poisoned_is_caught', async () => {
    const { privateKey, publicKey } = keyPairPem();
    const specPath = 'DARE/EXECUTION/task-signed-poisoned.md';
    const poisoned = `safe-title\u200Boverride`;

    await fs.writeFile(path.join(projectRoot, specPath), poisoned, 'utf8');
    await fs.ensureDir(path.join(projectRoot, 'keys'));
    await fs.writeFile(path.join(projectRoot, 'keys', 'minisign.pub'), publicKey, 'utf8');

    const { signArtifact } = await import('../provenance.js');
    const signature = signArtifact(Buffer.from(poisoned, 'utf8'), privateKey);
    await fs.writeFile(path.join(projectRoot, `${specPath}.minisig`), `${signature}\n`, 'utf8');

    await writeDag({ id: 'task-signed', specFile: specPath });
    await writeGuardConfig({
      enabled: true,
      onExecute: true,
      unicode: 'block',
      trustedPaths: ['DARE/EXECUTION/**'],
      signing: { enabled: true, publicKey: 'keys/minisign.pub' },
    });

    const execute = await loadExecute();
    const runSpy = vi.fn(async (input: { worktree: string }) => ({
      status: 'implemented' as const,
      worktree: input.worktree,
      summary: 'should-not-run',
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'test' },
    }));
    execute.setResolveDriverForTests(async () => ({
      id: 'integration-driver',
      requiresNetwork: false,
      run: runSpy,
    }));

    await runExecute(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    expect(exitCode).toBe(6);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('sign_writes_minisig', async () => {
    const { privateKey } = keyPairPem();
    process.env.DARE_GUARD_PRIVATE_KEY = privateKey;

    const target = 'DARE/TASKS.md';
    await fs.writeFile(path.join(projectRoot, target), 'trusted guard artifact', 'utf8');
    await writeGuardConfig({
      enabled: true,
      onExecute: true,
      unicode: 'strip',
      trustedPaths: ['DARE/TASKS.md'],
      signing: { enabled: false },
    });

    const guard = await loadGuard();
    await runGuard(guard, [target, '--sign', '--format', 'json']);

    const signaturePath = path.join(projectRoot, `${target}.minisig`);
    expect(exitCode).toBe(0);
    expect(await fs.pathExists(signaturePath)).toBe(true);
    expect(await fs.readFile(signaturePath, 'utf8')).toContain(
      'untrusted comment: signature from dare guard',
    );
  });

  it('disabled_guard_passes_through', async () => {
    const specPath = 'DARE/EXECUTION/task-disabled-guard.md';
    await fs.writeFile(path.join(projectRoot, specPath), `abc\u202Edef`, 'utf8');
    await writeDag({ id: 'task-disabled', specFile: specPath });
    await writeGuardConfig({
      enabled: false,
      onExecute: true,
      unicode: 'block',
      trustedPaths: ['DARE/EXECUTION/**'],
      signing: { enabled: false },
    });

    const execute = await loadExecute();
    await runExecute(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { status?: string }>;
    };
    expect(exitCode).toBeUndefined();
    expect(state.tasks['task-disabled']?.status).toBe('DONE');
  });

  it('data_channel_hook_blocked', async () => {
    const hookPath = '.dare/hooks/preflight.sh';
    await fs.ensureDir(path.join(projectRoot, '.dare', 'hooks'));
    await fs.writeFile(path.join(projectRoot, hookPath), '#!/usr/bin/env bash\necho insecure', 'utf8');
    await writeDag({ id: 'task-hook', specFile: hookPath });
    await writeGuardConfig({
      enabled: true,
      onExecute: true,
      unicode: 'strip',
      trustedPaths: ['DARE/EXECUTION/**'],
      signing: { enabled: false },
    });

    const execute = await loadExecute();
    await runExecute(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { error?: string }>;
    };
    expect(exitCode).toBe(6);
    expect(state.tasks['task-hook']?.error).toContain('boundary-violation');
  });
});
