import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as safeSpawnMod from '../../exec/safe-spawn.js';
import {
  infectionAdapter,
  parseInfectionReport,
  buildInfectionArgv,
} from '../gates/mutation/infection.js';
import { MutationToolNotFoundError } from '../gates/mutation/adapter.js';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'infection.json',
);

describe('parseInfectionReport', () => {
  it('should_parse_real_infection_json', async () => {
    const raw = (await fs.readJson(FIXTURE)) as object;
    const output = parseInfectionReport(raw);

    expect(output.killed).toBe(6);
    expect(output.survived).toBe(2);
    expect(output.noCoverage).toBe(2);
    expect(output.score).toBeCloseTo(0.75, 5);
    expect(output.tool).toBe('infection');
  });

  it('should_skip_when_zero_mutants', () => {
    const output = parseInfectionReport({});
    expect(output.killed).toBe(0);
    expect(output.survived).toBe(0);
    expect(Number.isNaN(output.score)).toBe(true);
  });
});

describe('buildInfectionArgv', () => {
  it('should_apply_filter_for_changed', () => {
    const argv = buildInfectionArgv({
      cwd: '/tmp',
      changedFiles: [
        'app/Models/User.php',
        'app/Services/UserService.php',
        'README.md',
      ],
      incremental: true,
      maxMutants: 50,
      timeoutSeconds: 600,
    });

    expect(argv).toContain('--only-covering-test-cases');
    expect(argv).toContain('--logger-json=infection.json');
    expect(argv).toContain('--no-progress');
    expect(argv).toContain('--filter=app/Models/User.php');
    expect(argv).toContain('--filter=app/Services/UserService.php');
    expect(argv).not.toContain('README.md');
  });
});

describe('infectionAdapter', () => {
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
      infectionAdapter.run({
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
            stdout: 'Infection - PHP Mutation Testing Framework 0.29.6\n',
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

    const output = await infectionAdapter.run({
      cwd: '/tmp/project',
      changedFiles: ['app/Models/User.php'],
      incremental: true,
      maxMutants: 200,
      timeoutSeconds: 900,
    });

    expect(output.killed).toBe(6);
    expect(output.survived).toBe(2);
    expect(output.score).toBeCloseTo(0.75, 5);
  });
});
