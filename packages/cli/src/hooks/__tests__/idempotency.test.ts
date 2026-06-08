import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { markSeen, shouldSkip, stateKey } from '../idempotency.js';

describe('hooks idempotency', () => {
  let projectRoot: string;
  const ctx = () => ({
    projectRoot,
    statePath: '.dare/hooks-state.json',
  });

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hooks-idem-'));
    await fs.ensureDir(path.join(projectRoot, '.dare'));
  });

  afterEach(async () => {
    await fs.remove(projectRoot).catch(() => undefined);
  });

  it('skips after markSeen for same file event', async () => {
    const payload = { event: 'on-save' as const, file: 'src/a.ts' };
    expect(await shouldSkip('on-save', 'lint', payload, ctx())).toBe(false);
    await markSeen('on-save', 'lint', payload, ctx());
    expect(await shouldSkip('on-save', 'lint', payload, ctx())).toBe(true);
  });

  it('does not skip for different files', async () => {
    const a = { event: 'on-save' as const, file: 'src/a.ts' };
    const b = { event: 'on-save' as const, file: 'src/b.ts' };
    await markSeen('on-save', 'lint', a, ctx());
    expect(await shouldSkip('on-save', 'lint', b, ctx())).toBe(false);
  });

  it('on-task-complete uses stable key regardless of file order', () => {
    const payload = { event: 'on-task-complete' as const, taskId: 'task-101' };
    const k1 = stateKey('on-task-complete', 'dare-review', payload, {
      touchedFiles: ['src/b.ts', 'src/a.ts'],
    });
    const k2 = stateKey('on-task-complete', 'dare-review', payload, {
      touchedFiles: ['src/a.ts', 'src/b.ts'],
    });
    expect(k1).toBe(k2);
  });

  it('rejects unsafe paths', async () => {
    await expect(
      shouldSkip('on-save', 'lint', { event: 'on-save', file: '../escape.ts' }, ctx()),
    ).rejects.toThrow();
  });
});
