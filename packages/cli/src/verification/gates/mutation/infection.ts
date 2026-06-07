import path from 'node:path';
import fs from 'fs-extra';
import { safeSpawn } from '../../../exec/safe-spawn.js';
import type {
  MutationAdapter,
  MutationRunInput,
  MutationRunOutput,
} from './adapter.js';
import {
  MutationToolNotFoundError,
  mutationScore,
} from './adapter.js';

export const INFECTION_REPORT_REL = 'infection.json';

const MIN_INFECTION_VERSION: readonly [number, number, number] = [0, 29, 0];
const PHP_EXT = /\.php$/i;

interface InfectionStats {
  readonly killedCount?: number;
  readonly escapedCount?: number;
  readonly notTestedCount?: number;
  readonly timeOutCount?: number;
  readonly errorCount?: number;
}

export interface InfectionReport {
  readonly stats?: InfectionStats;
  readonly killed?: ReadonlyArray<unknown> | number;
  readonly escaped?: ReadonlyArray<unknown> | number;
  readonly timeouted?: ReadonlyArray<unknown>;
  readonly uncovered?: ReadonlyArray<unknown>;
  readonly notCovered?: ReadonlyArray<unknown> | number;
}

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

function arrayLen(value: ReadonlyArray<unknown> | undefined): number {
  return value?.length ?? 0;
}

/** Parse `infection.json` logger output into normalized output. */
export function parseInfectionReport(
  report: InfectionReport,
  timedOut = false,
): MutationRunOutput {
  let killed = 0;
  let survived = 0;
  let noCoverage = 0;

  if (report.stats) {
    killed =
      (report.stats.killedCount ?? 0) +
      (report.stats.timeOutCount ?? 0) +
      (report.stats.errorCount ?? 0);
    survived = report.stats.escapedCount ?? 0;
    noCoverage = report.stats.notTestedCount ?? 0;
  } else if (typeof report.killed === 'number') {
    killed = report.killed;
    survived =
      typeof report.escaped === 'number' ? report.escaped : 0;
    noCoverage =
      typeof report.notCovered === 'number' ? report.notCovered : 0;
  } else {
    killed =
      arrayLen(Array.isArray(report.killed) ? report.killed : undefined) +
      arrayLen(report.timeouted);
    survived = arrayLen(
      Array.isArray(report.escaped) ? report.escaped : undefined,
    );
    noCoverage = arrayLen(report.uncovered);
    if (noCoverage === 0) {
      noCoverage = arrayLen(
        Array.isArray(report.notCovered) ? report.notCovered : undefined,
      );
    }
  }

  const output: MutationRunOutput = {
    killed,
    survived,
    noCoverage,
    timedOut,
    tool: 'infection',
    score: mutationScore({
      killed,
      survived,
      noCoverage,
      timedOut,
      tool: 'infection',
      score: 0,
    }),
  };

  return output;
}

function mutablePhpFiles(changedFiles: ReadonlyArray<string>): string[] {
  return [...new Set(changedFiles.filter((f) => PHP_EXT.test(f)))];
}

/** Resolve Infection binary: project vendor first, then global. */
export function resolveInfectionBin(cwd: string): string {
  const winBat = path.join(cwd, 'vendor', 'bin', 'infection.bat');
  const vendorBin = path.join(cwd, 'vendor', 'bin', 'infection');
  if (fs.existsSync(winBat)) return winBat;
  if (fs.existsSync(vendorBin)) return vendorBin;
  return 'infection';
}

/** Build Infection argv (exported for tests). */
export function buildInfectionArgv(input: MutationRunInput): string[] {
  const argv = [
    '--only-covering-test-cases',
    '--logger-json=infection.json',
    '--no-progress',
  ];

  if (input.incremental) {
    for (const file of mutablePhpFiles(input.changedFiles)) {
      argv.push(`--filter=${file}`);
    }
  }

  return argv;
}

async function probeInfection(cwd: string): Promise<boolean> {
  const bin = resolveInfectionBin(cwd);
  const result = await safeSpawn(bin, ['--version'], {
    cwd,
    timeoutSeconds: 30,
    maxChars: 2000,
  });
  if (result.code !== 0) return false;

  const version = parseVersionTuple(`${result.stdout}\n${result.stderr}`);
  if (!version) return true;
  return versionGte(version, MIN_INFECTION_VERSION);
}

async function readInfectionReport(cwd: string): Promise<InfectionReport> {
  const reportPath = path.join(cwd, INFECTION_REPORT_REL);
  if (!(await fs.pathExists(reportPath))) {
    return {};
  }
  return (await fs.readJson(reportPath)) as InfectionReport;
}

export const infectionAdapter: MutationAdapter = {
  tool: 'infection',
  stacks: ['php-laravel'],

  async isAvailable(cwd: string): Promise<boolean> {
    return probeInfection(cwd);
  },

  async run(input: MutationRunInput): Promise<MutationRunOutput> {
    if (!(await probeInfection(input.cwd))) {
      throw new MutationToolNotFoundError('infection');
    }

    const bin = resolveInfectionBin(input.cwd);
    const spawnResult = await safeSpawn(bin, buildInfectionArgv(input), {
      cwd: input.cwd,
      timeoutSeconds: input.timeoutSeconds,
      maxChars: 8000,
    });

    const report = await readInfectionReport(input.cwd);
    const output = parseInfectionReport(report, spawnResult.timedOut);

    if (
      spawnResult.code !== 0 &&
      !spawnResult.timedOut &&
      output.killed + output.survived === 0
    ) {
      throw new Error(
        `Infection exited with code ${spawnResult.code}: ${spawnResult.stderr.trim()}`,
      );
    }

    return output;
  },
};

/** Registry export (task-030). */
export const adapter = infectionAdapter;
