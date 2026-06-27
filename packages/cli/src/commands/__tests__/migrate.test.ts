import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

describe('dare migrate command', () => {
  let projectRoot: string;
  let exitCode: number | undefined;
  let stderr: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'migrate-cmd-'));
    await fs.ensureDir(path.join(projectRoot, 'DARE', 'REVERSE'));
    await fs.writeJSON(path.join(projectRoot, 'DARE', 'REVERSE', 'reverse-facts.json'), {
      project: {
        name: 'sample-project',
        structure: 'monolith',
        backend: 'node',
      },
      modules: [
        { id: 'core-auth', name: 'Core Auth', path: 'src/auth', size: 'S' },
      ],
      confidence: {
        perSpec: [{ spec: 'spec-1', gap: 2 }],
      },
    });

    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
    exitCode = undefined;
    stderr = '';
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error(`exit:${code}`);
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      stderr += args.map(String).join(' ') + '\n';
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(projectRoot).catch(() => undefined);
  });

  async function run(args: string[]): Promise<void> {
    vi.resetModules();
    const { migrateCommand } = await import('../migrate.js');
    try {
      await migrateCommand.parseAsync(['node', 'migrate', ...args]);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('exit:')) throw err;
    }
  }

  it('writes migration artifacts when --to is provided', async () => {
    await run(['--to', 'go-gin']);
    expect(await fs.pathExists(path.join(projectRoot, 'DARE', 'MIGRATION', 'MIGRATION.md'))).toBe(
      true,
    );
    expect(
      await fs.pathExists(path.join(projectRoot, 'DARE', 'MIGRATION', 'migration-facts.json')),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(projectRoot, 'DARE', 'MIGRATION', 'parity', 'core-auth.feature'),
      ),
    ).toBe(true);
    expect(exitCode).toBeUndefined();
  });

  it('--check does not write files', async () => {
    await run(['--check', '--to', 'go-gin']);
    expect(await fs.pathExists(path.join(projectRoot, 'DARE', 'MIGRATION', 'MIGRATION.md'))).toBe(
      false,
    );
    expect(exitCode).toBeUndefined();
  });

  it('fails without --to outside check mode', async () => {
    await run([]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Target stack is required in write mode');
  });
});
