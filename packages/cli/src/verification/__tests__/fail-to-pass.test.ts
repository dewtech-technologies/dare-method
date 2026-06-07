import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import * as safeSpawnMod from '../../exec/safe-spawn.js';
import {
  recordFailToPassBaseline,
  checkFailToPass,
  testCommandFor,
} from '../gates/fail-to-pass.js';

const FAIL_JSON = JSON.stringify({
  testResults: [
    {
      name: 'fail-to-pass.fixture.test.ts',
      assertionResults: [
        { fullName: 'should fail before impl', status: 'failed' },
      ],
    },
  ],
});

const PASS_JSON = JSON.stringify({
  testResults: [
    {
      name: 'fail-to-pass.fixture.test.ts',
      assertionResults: [
        { fullName: 'should fail before impl', status: 'passed' },
      ],
    },
  ],
});

const GIT_OK = {
  code: 0,
  stdout: 'abc123\n',
  stderr: '',
  timedOut: false,
};

function mockSafeSpawn(
  ...testRuns: Array<{
    code: number;
    stdout: string;
    stderr?: string;
  }>
): void {
  let idx = 0;
  vi.spyOn(safeSpawnMod, 'safeSpawn').mockImplementation(async (command) => {
    if (command === 'git') return GIT_OK;
    const run = testRuns[idx++] ?? testRuns[testRuns.length - 1];
    return {
      code: run.code,
      stdout: run.stdout,
      stderr: run.stderr ?? '',
      timedOut: false,
    };
  });
}

describe('fail-to-pass', () => {
  let cwd: string;
  const taskId = 'task-ftptest';
  const specRel = 'fail-to-pass.fixture.test.ts';

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-ftp-'));
    await fs.writeJson(path.join(cwd, 'dare.config.json'), {
      structure: 'mcp-server',
      mcpLanguage: 'node-ts',
    });
    await fs.writeFile(path.join(cwd, specRel), '// fixture\n');
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(cwd).catch(() => undefined);
  });

  it('should_record_allFailed_baseline', async () => {
    mockSafeSpawn({ code: 1, stdout: FAIL_JSON });

    const baseline = await recordFailToPassBaseline({
      taskId,
      cwd,
      specGlob: specRel,
    });
    expect(baseline.allFailed).toBe(true);
    expect(baseline.failed[0]).toContain('fail-to-pass.fixture.test.ts');

    const stored = await fs.readJson(
      path.join(cwd, '.dare/verification', `${taskId}.json`),
    );
    expect(stored.failToPassBaseline.allFailed).toBe(true);
  });

  it('should_fail_when_baseline_missing', async () => {
    const result = await checkFailToPass({ taskId, cwd });
    expect(result.verdict).toBe('FAIL');
    expect(result.reason).toBe('no baseline recorded');
    expect(result.aspect).toBe('fail-to-pass');
  });

  it('should_pass_when_spec_passes_after_impl', async () => {
    mockSafeSpawn(
      { code: 1, stdout: FAIL_JSON },
      { code: 0, stdout: PASS_JSON },
    );

    await recordFailToPassBaseline({ taskId, cwd, specGlob: specRel });
    const result = await checkFailToPass({ taskId, cwd });
    expect(result.verdict).toBe('PASS');
    expect(result.reason).toBe('all baseline tests now pass');
  });

  it('should_fail_if_some_still_failing', async () => {
    mockSafeSpawn(
      { code: 1, stdout: FAIL_JSON },
      { code: 1, stdout: FAIL_JSON },
    );

    await recordFailToPassBaseline({ taskId, cwd, specGlob: specRel });
    const result = await checkFailToPass({ taskId, cwd });
    expect(result.verdict).toBe('FAIL');
    expect(result.reason).toContain('still failing');
    expect(result.reason).toContain('should fail before impl');
  });
});

describe('testCommandFor', () => {
  it('maps node stack to vitest via npm exec', () => {
    const cmd = testCommandFor('mcp-server-node-ts', 'x.test.ts');
    expect(cmd.args).toContain('exec');
    expect(cmd.args).toContain('vitest');
    expect(cmd.args).toContain('x.test.ts');
    expect(cmd.args).toContain('--reporter=json');
  });
});
