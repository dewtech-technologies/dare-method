import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { convertYamlToDag } from '../../utils/dag-converter.js';

describe('dare refine --split --apply', () => {
  let projectRoot: string;
  let exitCode: number | undefined;
  let stderr: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-refine-apply-'));
    exitCode = undefined;
    stderr = '';

    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
    vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      exitCode = Number(code ?? 0);
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
    const { refineCommand } = await import('../refine.js');
    exitCode = undefined;
    stderr = '';
    try {
      await refineCommand.parseAsync(['node', 'refine', ...args]);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('exit:')) throw err;
    }
  }

  async function seedProject(maxDepth = 2): Promise<void> {
    await fs.ensureDir(path.join(projectRoot, 'DARE', 'EXECUTION'));
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), {
      verification: { loop: { maxDepth } },
    });
    await fs.writeFile(
      path.join(projectRoot, 'DARE', 'dare-dag.yaml'),
      [
        'title: "Refine Apply"',
        'version: "1.0.0"',
        'models:',
        '  cursor: { HIGH: h, MED: m, LOW: l }',
        'tasks:',
        '  - id: task-root',
        '    title: "root"',
        '    depends_on: []',
        '    complexity: LOW',
        '    subtask_prompt: |',
        '      root',
        '',
        '  - id: task-100',
        '    title: "parent"',
        '    depends_on: [task-root]',
        '    complexity: MED',
        '    spec_file: EXECUTION/task-100.md',
        '    subtask_prompt: |',
        '      parent',
        '',
      ].join('\n'),
    );
    await fs.writeFile(
      path.join(projectRoot, 'DARE', 'EXECUTION', 'task-100.md'),
      [
        '# Task task-100',
        '',
        '| Ação | Caminho |',
        '|------|---------|',
        '| CRIAR | `src/auth/login.ts` |',
        '| CRIAR | `tests/auth/login.test.ts` |',
      ].join('\n'),
    );
  }

  it('apply_injects_subdag', async () => {
    await seedProject();
    await run(['task-100', '--split', '--apply']);

    expect(exitCode).toBe(0);
    const dag = convertYamlToDag(
      await fs.readFile(path.join(projectRoot, 'DARE', 'dare-dag.yaml'), 'utf-8'),
    );
    const parent = dag.tasks.find((task) => task.id === 'task-100');
    const first = dag.tasks.find((task) => task.id === 'task-100a');
    const second = dag.tasks.find((task) => task.id === 'task-100b');

    expect(parent?.depends_on).toEqual(['task-root', 'task-100a', 'task-100b']);
    expect(first?.spec_file).toBe('EXECUTION/task-100a.md');
    expect(first?.depends_on).toEqual(['task-root']);
    expect(second?.depends_on).toEqual(['task-100a']);

    const state = await fs.readJson(path.join(projectRoot, '.dare', 'state.json'));
    expect(state.tasks['task-100a'].status).toBe('PENDING');
    expect(state.tasks['task-100b'].status).toBe('PENDING');
  });

  it('apply_is_idempotent', async () => {
    await seedProject();
    await run(['task-100', '--split', '--apply']);
    expect(exitCode).toBe(0);

    await run(['task-100', '--split', '--apply']);
    expect(exitCode).toBe(0);

    const dag = convertYamlToDag(
      await fs.readFile(path.join(projectRoot, 'DARE', 'dare-dag.yaml'), 'utf-8'),
    );
    const inserted = dag.tasks.filter((task) => /^task-100[a-z]$/.test(task.id));
    const parent = dag.tasks.find((task) => task.id === 'task-100');

    expect(inserted.map((task) => task.id)).toEqual(['task-100a', 'task-100b']);
    expect(parent?.depends_on).toEqual(['task-root', 'task-100a', 'task-100b']);
  });

  it('apply_without_split_errors', async () => {
    await run(['task-100', '--apply']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--apply exige --split');
  });

  it('respects_maxDepth', async () => {
    await seedProject(0);
    await run(['task-100', '--split', '--apply']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('exceeds maxDepth 0');

    const dag = convertYamlToDag(
      await fs.readFile(path.join(projectRoot, 'DARE', 'dare-dag.yaml'), 'utf-8'),
    );
    expect(dag.tasks.some((task) => task.id === 'task-100a')).toBe(false);
  });
});
