import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

const DIR_ESCAPE_MSG =
  "Error: --dir must stay within the project (no '..' or absolute escape)";

describe('patterns path confinement (RS-03)', () => {
  let projectRoot: string;
  let exitCode: number | undefined;
  let stderr: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'patterns-path-'));
    await fs.ensureDir(path.join(projectRoot, 'src'));
    await fs.writeFile(path.join(projectRoot, 'src', 'app.service.ts'), 'export class AppService {}');
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

  async function runPatterns(args: string[]): Promise<void> {
    const { patternsCommand } = await import('../commands/patterns.js');
    try {
      await patternsCommand.parseAsync(args, { from: 'user' });
    } catch (e) {
      if (!(e instanceof Error && e.message.startsWith('exit:'))) throw e;
    }
  }

  it('rejects --dir with parent traversal', async () => {
    await runPatterns(['--dir', '../outside', '--check']);
    expect(exitCode).toBe(1);
    expect(stderr.trim()).toBe(DIR_ESCAPE_MSG);
  });

  it('rejects --modules with traversal payload', async () => {
    await runPatterns(['--modules', '../escape', '--check']);
    expect(exitCode).toBe(1);
    expect(stderr.trim()).toBe(DIR_ESCAPE_MSG);
  });

  it('IGNORE_DIRS excludes node_modules from inventory', async () => {
    await fs.ensureDir(path.join(projectRoot, 'node_modules', 'pkg'));
    await fs.writeFile(
      path.join(projectRoot, 'node_modules', 'pkg', 'index.ts'),
      'export class NodeModulesService {}',
    );
    const { detectPatterns } = await import('../utils/pattern-detector.js');
    const facts = await detectPatterns(projectRoot, null);
    const files = facts.patterns.flatMap((p) => p.evidence.map((e) => e.file));
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
  });
});
