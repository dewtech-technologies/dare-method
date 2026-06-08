import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

vi.mock('../../hooks/dispatcher.js', () => ({
  dispatchHook: vi.fn(async () => []),
  TrustRequiredError: class TrustRequiredError extends Error {
    name = 'TrustRequiredError';
  },
  InvalidHookEventError: class InvalidHookEventError extends Error {
    name = 'InvalidHookEventError';
  },
  PathEscapeError: class PathEscapeError extends Error {
    name = 'PathEscapeError';
  },
  ActionNotAllowedError: class ActionNotAllowedError extends Error {
    name = 'ActionNotAllowedError';
  },
}));

describe('dare hooks command', () => {
  let projectRoot: string;
  let exitCode: number | undefined;
  let stderr: string;
  let stdout: string;
  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-hooks-cmd-'));
    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);

    exitCode = undefined;
    stderr = '';
    stdout = '';
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
    vi.restoreAllMocks();
    await fs.remove(projectRoot).catch(() => undefined);
  });

  async function run(args: string[]) {
    const { hooksCommand } = await import('../hooks.js');
    try {
      await hooksCommand.parseAsync(['node', 'hooks', ...args]);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('exit:')) throw err;
    }
  }

  it('list returns empty hooks when block absent (exit 0)', async () => {
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), { name: 'test' });
    await run(['list', '--json']);
    expect(exitCode).toBeUndefined();
    const body = JSON.parse(stdout.trim());
    expect(body.hooks).toEqual({});
    expect(body.trusted).toBe(false);
  });

  it('run rejects unknown event with exit 2', async () => {
    await run(['run', 'bogus-event']);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("unknown hook event 'bogus-event'");
    expect(stderr).toContain('Allowed:');
  });

  it('run rejects untrusted project without --trust (exit 2)', async () => {
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), {
      hooks: { on: { 'on-save': [{ action: 'lint' }] }, trusted: false },
    });
    await run(['run', 'on-save', '--file', 'src/x.ts']);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('hooks are untrusted for this project');
  });

  it('validate rejects invalid action in config (exit 1)', async () => {
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), {
      hooks: { on: { 'on-save': [{ action: 'rm-rf' }] }, trusted: false },
    });
    await run(['validate', '--json']);
    expect(exitCode).toBe(1);
    const body = JSON.parse(stdout.trim());
    expect(body.valid).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('validate accepts valid config (exit 0)', async () => {
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), {
      hooks: { on: { 'on-save': [{ action: 'dare-validate' }] }, trusted: false },
    });
    await run(['validate', '--json']);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.trim()).valid).toBe(true);
  });
});
