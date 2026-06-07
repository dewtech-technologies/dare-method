import path from 'node:path';
import fs from 'fs-extra';
import { safeSpawn } from '../../../exec/safe-spawn.js';
import { resolvePythonBin } from '../../../dag-runner/ralph-loop.js';
import type {
  MutationAdapter,
  MutationRunInput,
  MutationRunOutput,
} from './adapter.js';
import {
  MutationToolNotFoundError,
  mutationScore,
} from './adapter.js';

export const MUTMUT_CICD_STATS_REL = path.join(
  'mutants',
  'mutmut-cicd-stats.json',
);

const MIN_MUTMUT_VERSION: readonly [number, number, number] = [3, 2, 0];
const PY_EXT = /\.py$/i;

interface MutmutCicdStats {
  readonly killed?: number;
  readonly survived?: number;
  readonly skipped?: number;
  readonly timeout?: number;
  readonly no_tests?: number;
  readonly total?: number;
}

interface MutmutResultEntry {
  readonly status?: string;
}

export type MutmutReport = MutmutCicdStats | ReadonlyArray<MutmutResultEntry>;

function parseVersionTuple(text: string): [number, number, number] | null {
  const match = text.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionGte(
  version: [number, number, number],
  minimum: readonly [number, number, number],
): boolean {
  for (let i = 0; i < 3; i += 1) {
    if (version[i] > minimum[i]) return true;
    if (version[i] < minimum[i]) return false;
  }
  return true;
}

function isKilledStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized === 'killed' || normalized === 'timeout';
}

/** Parse mutmut JSON report (`results --json` or cicd stats) into normalized output. */
export function parseMutmutReport(
  report: MutmutReport,
  timedOut = false,
): MutationRunOutput {
  let killed = 0;
  let survived = 0;
  let noCoverage = 0;

  if (Array.isArray(report)) {
    for (const entry of report) {
      const status = (entry.status ?? '').toLowerCase();
      if (isKilledStatus(status)) killed += 1;
      else if (status === 'survived') survived += 1;
      else if (status === 'no tests' || status === 'no_tests') noCoverage += 1;
    }
  } else {
    const stats = report as MutmutCicdStats;
    killed = (stats.killed ?? 0) + (stats.timeout ?? 0);
    survived = stats.survived ?? 0;
    noCoverage = stats.no_tests ?? 0;
  }

  const output: MutationRunOutput = {
    killed,
    survived,
    noCoverage,
    timedOut,
    tool: 'mutmut',
    score: mutationScore({
      killed,
      survived,
      noCoverage,
      timedOut,
      tool: 'mutmut',
      score: 0,
    }),
  };

  return output;
}

function mutableChangedFiles(
  changedFiles: ReadonlyArray<string>,
): string[] {
  return [...new Set(changedFiles.filter((f) => PY_EXT.test(f)))];
}

/** Build argv for `mutmut run` (exported for tests). */
export function buildMutmutArgv(input: MutationRunInput): string[] {
  const argv = ['run'];

  if (input.incremental) {
    for (const file of mutableChangedFiles(input.changedFiles)) {
      argv.push('--paths-to-mutate', file);
    }
  }

  return argv;
}

async function probeMutmut(cwd: string): Promise<boolean> {
  const bin = resolvePythonBin(cwd, 'mutmut');
  const result = await safeSpawn(bin, ['--version'], {
    cwd,
    timeoutSeconds: 30,
    maxChars: 2000,
  });
  if (result.code !== 0) return false;

  const version = parseVersionTuple(`${result.stdout}\n${result.stderr}`);
  if (!version) return true;
  return versionGte(version, MIN_MUTMUT_VERSION);
}

async function readMutmutReport(
  cwd: string,
  bin: string,
  timeoutSeconds: number,
): Promise<MutmutReport> {
  const resultsTimeout = Math.min(timeoutSeconds, 120);

  const jsonResult = await safeSpawn(bin, ['results', '--json'], {
    cwd,
    timeoutSeconds: resultsTimeout,
    maxChars: 500_000,
  });

  if (jsonResult.code === 0 && jsonResult.stdout.trim()) {
    try {
      return JSON.parse(jsonResult.stdout) as MutmutReport;
    } catch {
      // fall through to cicd stats
    }
  }

  await safeSpawn(bin, ['export_cicd_stats'], {
    cwd,
    timeoutSeconds: resultsTimeout,
    maxChars: 8000,
  });

  const statsPath = path.join(cwd, MUTMUT_CICD_STATS_REL);
  if (await fs.pathExists(statsPath)) {
    return (await fs.readJson(statsPath)) as MutmutCicdStats;
  }

  return { killed: 0, survived: 0, skipped: 0 };
}

export const mutmutAdapter: MutationAdapter = {
  tool: 'mutmut',
  stacks: ['python-fastapi', 'mcp-server-python'],

  async isAvailable(cwd: string): Promise<boolean> {
    return probeMutmut(cwd);
  },

  async run(input: MutationRunInput): Promise<MutationRunOutput> {
    if (!(await probeMutmut(input.cwd))) {
      throw new MutationToolNotFoundError('mutmut');
    }

    const bin = resolvePythonBin(input.cwd, 'mutmut');
    const spawnResult = await safeSpawn(bin, buildMutmutArgv(input), {
      cwd: input.cwd,
      timeoutSeconds: input.timeoutSeconds,
      maxChars: 8000,
    });

    const report = await readMutmutReport(
      input.cwd,
      bin,
      input.timeoutSeconds,
    );
    const output = parseMutmutReport(report, spawnResult.timedOut);

    if (
      spawnResult.code !== 0 &&
      !spawnResult.timedOut &&
      output.killed + output.survived === 0
    ) {
      throw new Error(
        `mutmut exited with code ${spawnResult.code}: ${spawnResult.stderr.trim()}`,
      );
    }

    return output;
  },
};

/** Registry export (task-030). */
export const adapter = mutmutAdapter;
