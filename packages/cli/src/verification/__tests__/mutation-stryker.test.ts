import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as safeSpawnMod from '../../exec/safe-spawn.js';
import {
  strykerAdapter,
  parseStrykerReport,
  buildStrykerArgv,
} from '../gates/mutation/stryker.js';
import { MutationToolNotFoundError } from '../gates/mutation/adapter.js';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'stryker.mutation.json',
);

describe('parseStrykerReport', () => {
  it('should_parse_real_stryker_report', async () => {
    const raw = (await fs.readJson(FIXTURE)) as object;
    const output = parseStrykerReport(raw);

    expect(output.killed).toBe(3);
    expect(output.survived).toBe(1);
    expect(output.noCoverage).toBe(1);
    expect(output.score).toBeCloseTo(0.75, 5);
    expect(output.tool).toBe('stryker');
  });

  it('should_skip_when_zero_mutants', () => {
    const output = parseStrykerReport({ files: {} });
    expect(output.killed).toBe(0);
    expect(output.survived).toBe(0);
    expect(Number.isNaN(output.score)).toBe(true);
  });
});

describe('buildStrykerArgv', () => {
  it('should_build_incremental_argv', () => {
    const argv = buildStrykerArgv({
      cwd: '/tmp',
      changedFiles: ['src/a.ts', 'src/b.js', 'README.md'],
      incremental: true,
      maxMutants: 50,
      timeoutSeconds: 60,
    });

    expect(argv).toContain('--incremental');
    expect(argv.filter((a) => a === '--mutate')).toHaveLength(2);
    expect(argv).toContain('src/a.ts');
    expect(argv).toContain('src/b.js');
    expect(argv).not.toContain('README.md');
    expect(argv).toContain('--maxMutants');
    expect(argv).toContain('50');
  });
});

describe('strykerAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_throw_when_unavailable', async () => {
    vi.spyOn(safeSpawnMod, 'safeSpawn').mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'not found',
      timedOut: false,
    });

    await expect(
      strykerAdapter.run({
        cwd: process.cwd(),
        changedFiles: [],
        incremental: false,
        maxMutants: 10,
        timeoutSeconds: 30,
      }),
    ).rejects.toThrow(MutationToolNotFoundError);
  });

  it('should_run_and_parse_report', async () => {
    const fixture = await fs.readJson(FIXTURE);
    vi.spyOn(safeSpawnMod, 'safeSpawn').mockResolvedValue({
      code: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
    });
    vi.spyOn(fs, 'pathExists').mockImplementation(async () => true);
    vi.spyOn(fs, 'readJson').mockResolvedValue(fixture);

    const output = await strykerAdapter.run({
      cwd: '/tmp/project',
      changedFiles: ['src/math.ts'],
      incremental: true,
      maxMutants: 200,
      timeoutSeconds: 900,
    });

    expect(output.killed).toBe(3);
    expect(output.survived).toBe(1);
    expect(output.score).toBeCloseTo(0.75, 5);
  });
});
