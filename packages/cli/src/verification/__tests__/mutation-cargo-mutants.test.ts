import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as safeSpawnMod from '../../exec/safe-spawn.js';
import {
  cargoMutantsAdapter,
  parseCargoMutantsReport,
  buildCargoMutantsArgv,
} from '../gates/mutation/cargo-mutants.js';
import { MutationToolNotFoundError } from '../gates/mutation/adapter.js';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'cargo-mutants.outcomes.json',
);

describe('parseCargoMutantsReport', () => {
  it('should_parse_real_outcomes_json', async () => {
    const raw = (await fs.readJson(FIXTURE)) as object;
    const output = parseCargoMutantsReport(raw);

    expect(output.killed).toBe(4);
    expect(output.survived).toBe(1);
    expect(output.noCoverage).toBe(2);
    expect(output.score).toBeCloseTo(0.8, 5);
    expect(output.tool).toBe('cargo-mutants');
  });

  it('should_skip_when_zero_mutants', () => {
    const output = parseCargoMutantsReport({});
    expect(output.killed).toBe(0);
    expect(output.survived).toBe(0);
    expect(Number.isNaN(output.score)).toBe(true);
  });
});

describe('buildCargoMutantsArgv', () => {
  it('should_include_in_diff_when_incremental', () => {
    const argv = buildCargoMutantsArgv(
      {
        cwd: '/tmp',
        changedFiles: ['src/lib.rs'],
        incremental: true,
        maxMutants: 50,
        timeoutSeconds: 300,
      },
      '.dare/mutation-in-diff.patch',
    );

    expect(argv).toContain('--in-diff');
    expect(argv).toContain('.dare/mutation-in-diff.patch');
    expect(argv).toContain('--json');
    expect(argv).toContain('--timeout');
    expect(argv).toContain('300');
  });
});

describe('cargoMutantsAdapter', () => {
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
      cargoMutantsAdapter.run({
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
        if (args[0] === 'mutants' && args[1] === '--version') {
          return {
            code: 0,
            stdout: 'cargo-mutants 25.1.0\n',
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
    vi.spyOn(fs, 'pathExists').mockImplementation(async () => true);
    vi.spyOn(fs, 'readJson').mockResolvedValue(fixture);

    const output = await cargoMutantsAdapter.run({
      cwd: '/tmp/project',
      changedFiles: ['src/lib.rs'],
      incremental: true,
      maxMutants: 200,
      timeoutSeconds: 900,
    });

    expect(output.killed).toBe(4);
    expect(output.survived).toBe(1);
    expect(output.score).toBeCloseTo(0.8, 5);
  });
});
