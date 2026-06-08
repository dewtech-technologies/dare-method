import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

describe('dare patterns command', () => {
  let projectRoot: string;
  let exitCode: number | undefined;
  let stderr: string;
  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'patterns-cmd-'));
    await fs.ensureDir(path.join(projectRoot, 'src'));
    await fs.writeFile(path.join(projectRoot, 'src', 'app.service.ts'), 'export class AppService {}');
    await fs.writeFile(path.join(projectRoot, 'src', 'app.controller.ts'), 'import { AppService } from "./app.service";');

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

  async function run(args: string[]) {
    const { patternsCommand } = await import('../patterns.js');
    try {
      await patternsCommand.parseAsync(['node', 'patterns', ...args]);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('exit:')) throw err;
    }
  }

  it('writes DARE artifacts on success', async () => {
    await run([]);
    expect(await fs.pathExists(path.join(projectRoot, 'DARE', 'patterns-facts.json'))).toBe(true);
    expect(await fs.pathExists(path.join(projectRoot, 'DARE', 'PATTERNS.md'))).toBe(true);
  });

  it('--check does not write files', async () => {
    await run(['--check']);
    expect(await fs.pathExists(path.join(projectRoot, 'DARE', 'patterns-facts.json'))).toBe(false);
    expect(await fs.pathExists(path.join(projectRoot, 'DARE', 'PATTERNS.md'))).toBe(false);
  });

  it('rejects invalid --dir with exact error message', async () => {
    await run(['--dir', '../escape']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain(
      "Error: --dir must stay within the project (no '..' or absolute escape)",
    );
  });
});
