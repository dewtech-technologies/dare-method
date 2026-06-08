import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  dispatchHook,
  TrustRequiredError,
  PathEscapeError,
} from '../dispatcher.js';
import { ActionNotAllowedError } from '../allowlist.js';

const spawnMock = vi.fn();

vi.mock('../../exec/safe-spawn.js', () => ({
  safeSpawn: (...args: unknown[]) => spawnMock(...args),
}));

const HOOKS_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const STEERING_SRC = path.resolve(HOOKS_SRC, '..', 'steering');

describe('hooks dispatcher security', () => {
  let projectRoot: string;

  beforeEach(async () => {
    spawnMock.mockReset();
    spawnMock.mockResolvedValue({ code: 0, stdout: '', stderr: '', timedOut: false });

    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-sec-'));
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

  const trustedConfig = {
    on: { 'on-save': [{ action: 'dare-validate' as const }] },
    trusted: true,
  };

  it('rejects path traversal before spawn', async () => {
    await expect(
      dispatchHook(
        trustedConfig,
        { event: 'on-save', file: '../../etc/passwd' },
        { projectRoot },
      ),
    ).rejects.toThrow(PathEscapeError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects absolute paths before spawn', async () => {
    await expect(
      dispatchHook(
        trustedConfig,
        { event: 'on-save', file: '/etc/passwd' },
        { projectRoot },
      ),
    ).rejects.toThrow(PathEscapeError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('passes shell-metacharacters as literal argv (shell:false)', async () => {
    const malicious = "'; rm -rf / #";
    await dispatchHook(
      {
        on: { 'on-file-create': [{ action: 'dare-validate' }] },
        trusted: true,
      },
      { event: 'on-file-create', file: malicious },
      { projectRoot },
    );

    expect(spawnMock).toHaveBeenCalled();
    const [, argv, opts] = spawnMock.mock.calls[0]!;
    expect(argv).not.toContain(undefined);
    expect(opts).toMatchObject({ cwd: projectRoot });
    expect(JSON.stringify(spawnMock.mock.calls)).not.toContain('shell":true');
  });

  it('enforces trust gate before spawn (RS-05)', async () => {
    await expect(
      dispatchHook(
        { on: { 'on-save': [{ action: 'dare-validate' }] }, trusted: false },
        { event: 'on-save' },
        { projectRoot },
      ),
    ).rejects.toThrow(TrustRequiredError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('allows dispatch with trustOverride', async () => {
    await dispatchHook(
      { on: { 'on-save': [{ action: 'dare-validate' }] }, trusted: false },
      { event: 'on-save' },
      { projectRoot, trustOverride: true },
    );
    expect(spawnMock).toHaveBeenCalled();
  });

  it('rejects actions outside allowlist', async () => {
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
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('has zero shell:true in hooks/ and steering/ sources', () => {
    const files = [
      path.join(HOOKS_SRC, 'dispatcher.ts'),
      path.join(HOOKS_SRC, 'allowlist.ts'),
      path.join(HOOKS_SRC, 'config.ts'),
      path.join(STEERING_SRC, 'resolver.ts'),
      path.join(STEERING_SRC, 'loader.ts'),
    ];
    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf-8');
      if (/shell:\s*true/.test(src)) hits.push(path.basename(file));
    }
    expect(hits).toEqual([]);
  });
});
