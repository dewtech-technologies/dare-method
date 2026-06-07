import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { buildReport } from '../../verification/bench/report.js';

vi.mock('../../verification/bench/harness.js', () => ({
  runSuite: vi.fn(async () => [
    {
      id: 'fix-mini',
      stack: 'node-nestjs',
      fixRate: 1,
      passToPassRegressed: false,
      solved: true,
      failToPass: { passed: 1, total: 1 },
      passToPass: { passed: 1, total: 1 },
      durationMs: 10,
    },
  ]),
}));

describe('dare bench command', () => {
  let suiteDir: string;
  let exitCode: number | undefined;
  let stdout: string;

  beforeEach(async () => {
    suiteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-bench-cmd-'));
    await fs.writeJson(path.join(suiteDir, 'suite.json'), {
      fixtures: [{ id: 'fix-mini', stack: 'node-nestjs', description: 'mini' }],
    });
    exitCode = undefined;
    stdout = '';
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error(`exit:${code}`);
    });
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout += args.map(String).join(' ') + '\n';
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(suiteDir).catch(() => undefined);
  });

  it('should_emit_json_report', async () => {
    const { benchCommand } = await import('../bench.js');
    try {
      await benchCommand.parseAsync(['node', 'bench', '--suite', suiteDir, '--json']);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('exit:0')) throw err;
    }
    const report = JSON.parse(stdout.trim());
    expect(report.schemaVersion).toBe(1);
    expect(report.totals.solved).toBe(1);
  });

  it('should_exit_1_on_regression', async () => {
    const baselinePath = path.join(suiteDir, 'baseline.json');
    const baseline = buildReport(
      [
        {
          id: 'fix-mini',
          stack: 'node-nestjs',
          fixRate: 1,
          passToPassRegressed: false,
          solved: true,
          failToPass: { passed: 1, total: 1 },
          passToPass: { passed: 1, total: 1 },
          durationMs: 1,
        },
      ],
      { suite: suiteDir },
    );
    await fs.writeJson(baselinePath, baseline);

    const { runSuite } = await import('../../verification/bench/harness.js');
    vi.mocked(runSuite).mockResolvedValueOnce([
      {
        id: 'fix-mini',
        stack: 'node-nestjs',
        fixRate: 0,
        passToPassRegressed: true,
        solved: false,
        failToPass: { passed: 0, total: 1 },
        passToPass: { passed: 0, total: 1 },
        durationMs: 1,
      },
    ]);

    const { benchCommand } = await import('../bench.js');
    await expect(
      benchCommand.parseAsync([
        'node',
        'bench',
        '--suite',
        suiteDir,
        '--json',
        '--baseline',
        baselinePath,
        '--fail-on-regression',
        '3',
      ]),
    ).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('should_exit_2_on_missing_suite', async () => {
    await fs.remove(path.join(suiteDir, 'suite.json'));
    const { benchCommand } = await import('../bench.js');
    await expect(
      benchCommand.parseAsync(['node', 'bench', '--suite', suiteDir]),
    ).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });
});
