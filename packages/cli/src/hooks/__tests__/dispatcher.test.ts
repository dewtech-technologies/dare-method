import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  dispatchHook,
  TrustRequiredError,
  ActionNotAllowedError,
} from '../dispatcher.js';

const spawnMock = vi.fn();

vi.mock('../../exec/safe-spawn.js', () => ({
  safeSpawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('hooks dispatcher', () => {
  let projectRoot: string;

  beforeEach(async () => {
    spawnMock.mockReset();
    spawnMock.mockResolvedValue({ code: 0, stdout: '', stderr: '', timedOut: false });

    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-dispatch-'));
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), {
      structure: 'mcp-server',
      mcpLanguage: 'node-ts',
    });
    await fs.writeFile(
      path.join(projectRoot, 'dare-graph.yml'),
      'backend: json\njson:\n  path: .dare/graph.json\n',
    );
  });

  afterEach(async () => {
    await fs.remove(projectRoot).catch(() => undefined);
  });

  it('rejects untrusted config without trustOverride', async () => {
    await expect(
      dispatchHook(
        { on: { 'on-save': [{ action: 'lint' }] }, trusted: false },
        { event: 'on-save' },
        { projectRoot },
      ),
    ).rejects.toThrow(TrustRequiredError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('dispatches dare-review via safeSpawn with argv (shell:false path)', async () => {
    const results = await dispatchHook(
      {
        on: { 'on-task-complete': [{ action: 'dare-review' }] },
        trusted: true,
      },
      { event: 'on-task-complete', taskId: 'task-101' },
      { projectRoot },
    );

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, argv, opts] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe('dare');
    expect(argv).toEqual(['review', 'task-101', '--strict', '--format', 'json']);
    expect(opts).toMatchObject({ cwd: projectRoot, timeoutSeconds: 600 });
    expect(results[0]).toMatchObject({
      action: 'dare-review',
      exitCode: 0,
      skipped: false,
      verdict: 'pass',
    });
  });

  it('skips duplicate dispatch via idempotency', async () => {
    const config = {
      on: { 'on-save': [{ action: 'dare-validate' as const }] },
      trusted: true,
    };
    const payload = { event: 'on-save' as const };

    await dispatchHook(config, payload, { projectRoot });
    const second = await dispatchHook(config, payload, { projectRoot });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(second[0]?.skipped).toBe(true);
  });

  it('rejects disallowed action keys at resolve time', async () => {
    await expect(
      dispatchHook(
        {
          on: { 'on-save': [{ action: 'rm-rf' as 'lint' }] },
          trusted: true,
        },
        { event: 'on-save' },
        { projectRoot },
      ),
    ).rejects.toThrow(ActionNotAllowedError);
  });

  it('returns empty array when no actions configured', async () => {
    const results = await dispatchHook(
      { on: {}, trusted: true },
      { event: 'pre-commit' },
      { projectRoot },
    );
    expect(results).toEqual([]);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
