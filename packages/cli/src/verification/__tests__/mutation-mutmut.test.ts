import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as safeSpawnMod from '../../exec/safe-spawn.js';
import {
  mutmutAdapter,
  parseMutmutReport,
  buildMutmutArgv,
} from '../gates/mutation/mutmut.js';
import { MutationToolNotFoundError } from '../gates/mutation/adapter.js';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'mutmut.results.json',
);

describe('parseMutmutReport', () => {
  it('should_parse_real_mutmut_json', async () => {
    const raw = (await fs.readJson(FIXTURE)) as object;
    const output = parseMutmutReport(raw);

    expect(output.killed).toBe(5);
    expect(output.survived).toBe(1);
    expect(output.noCoverage).toBe(0);
    expect(output.score).toBeCloseTo(5 / 6, 5);
    expect(output.tool).toBe('mutmut');
  });

  it('should_skip_when_zero_mutants', () => {
    const output = parseMutmutReport({ killed: 0, survived: 0 });
    expect(output.killed).toBe(0);
    expect(output.survived).toBe(0);
    expect(Number.isNaN(output.score)).toBe(true);
  });
});

describe('buildMutmutArgv', () => {
  it('should_build_paths_to_mutate', () => {
    const argv = buildMutmutArgv({
      cwd: '/tmp',
      changedFiles: ['src/api.py', 'lib/util.py', 'README.md'],
      incremental: true,
      maxMutants: 50,
      timeoutSeconds: 60,
    });

    expect(argv[0]).toBe('run');
    expect(argv.filter((a) => a === '--paths-to-mutate')).toHaveLength(2);
    expect(argv).toContain('src/api.py');
    expect(argv).toContain('lib/util.py');
    expect(argv).not.toContain('README.md');
  });
});

describe('mutmutAdapter', () => {
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
      mutmutAdapter.run({
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
    vi.spyOn(safeSpawnMod, 'safeSpawn').mockImplementation(
      async (_cmd, args) => {
        if (args[0] === '--version') {
          return {
            code: 0,
            stdout: 'mutmut, version 3.2.3\n',
            stderr: '',
            timedOut: false,
          };
        }
        if (args[0] === 'results' && args[1] === '--json') {
          return {
            code: 0,
            stdout: JSON.stringify(fixture),
            stderr: '',
            timedOut: false,
          };
        }
        return {
          code: 0,
          stdout: '',
          stderr: '',
          timedOut: false,
        };
      },
    );

    const output = await mutmutAdapter.run({
      cwd: '/tmp/project',
      changedFiles: ['src/api.py'],
      incremental: true,
      maxMutants: 200,
      timeoutSeconds: 900,
    });

    expect(output.killed).toBe(5);
    expect(output.survived).toBe(1);
    expect(output.score).toBeCloseTo(5 / 6, 5);
  });
});
