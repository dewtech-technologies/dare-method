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

export const OUTCOMES_REL = path.join('mutants.out', 'outcomes.json');
const IN_DIFF_REL = path.join('.dare', 'mutation-in-diff.patch');

const MIN_CARGO_MUTANTS_VERSION: readonly [number, number, number] = [25, 0, 0];
const RS_EXT = /\.rs$/i;

interface CargoMutantsSummary {
  readonly caught?: number;
  readonly missed?: number;
  readonly unviable?: number;
  readonly timeout?: number;
}

interface CargoMutantsOutcomeEntry {
  readonly outcome?: string;
}

export interface CargoMutantsOutcomesFile {
  readonly summary?: CargoMutantsSummary;
  readonly outcomes?: ReadonlyArray<CargoMutantsOutcomeEntry>;
  readonly caught?: number;
  readonly missed?: number;
  readonly unviable?: number;
  readonly timeout?: number;
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

function classifyOutcome(raw: string): 'killed' | 'survived' | 'noCoverage' | null {
  const status = raw.toLowerCase();
  if (status === 'caught' || status === 'timeout') return 'killed';
  if (status === 'missed') return 'survived';
  if (status === 'unviable') return 'noCoverage';
  return null;
}

/** Parse `mutants.out/outcomes.json` into normalized output. */
export function parseCargoMutantsReport(
  report: CargoMutantsOutcomesFile,
  timedOut = false,
): MutationRunOutput {
  let killed = 0;
  let survived = 0;
  let noCoverage = 0;

  if (report.summary) {
    killed =
      (report.summary.caught ?? 0) + (report.summary.timeout ?? 0);
    survived = report.summary.missed ?? 0;
    noCoverage = report.summary.unviable ?? 0;
  } else if (report.outcomes?.length) {
    for (const entry of report.outcomes) {
      const kind = classifyOutcome(entry.outcome ?? '');
      if (kind === 'killed') killed += 1;
      else if (kind === 'survived') survived += 1;
      else if (kind === 'noCoverage') noCoverage += 1;
    }
  } else {
    killed = (report.caught ?? 0) + (report.timeout ?? 0);
    survived = report.missed ?? 0;
    noCoverage = report.unviable ?? 0;
  }

  const output: MutationRunOutput = {
    killed,
    survived,
    noCoverage,
    timedOut,
    tool: 'cargo-mutants',
    score: mutationScore({
      killed,
      survived,
      noCoverage,
      timedOut,
      tool: 'cargo-mutants',
      score: 0,
    }),
  };

  return output;
}

/** Build `cargo mutants` argv (exported for tests). */
export function buildCargoMutantsArgv(
  input: MutationRunInput,
  inDiffPath?: string,
): string[] {
  const argv = [
    'mutants',
    '--json',
    '--timeout',
    String(input.timeoutSeconds),
  ];

  if (input.incremental && inDiffPath) {
    argv.push('--in-diff', inDiffPath);
  }

  return argv;
}

function diffPaths(changedFiles: ReadonlyArray<string>): string[] {
  const rustFiles = [
    ...new Set(changedFiles.filter((f) => RS_EXT.test(f))),
  ];
  return rustFiles.length > 0 ? rustFiles : [...new Set(changedFiles)];
}

async function collectGitDiff(
  cwd: string,
  changedFiles: ReadonlyArray<string>,
): Promise<string | null> {
  const paths = diffPaths(changedFiles);
  if (paths.length === 0) return null;

  const result = await safeSpawn('git', ['diff', '--', ...paths], {
    cwd,
    timeoutSeconds: 60,
    maxChars: 500_000,
  });

  if (result.code !== 0 || !result.stdout.trim()) return null;
  return result.stdout;
}

async function writeInDiffFile(cwd: string, diff: string): Promise<string> {
  const abs = path.join(cwd, IN_DIFF_REL);
  await fs.ensureDir(path.dirname(abs));
  await fs.writeFile(abs, diff, 'utf8');
  return IN_DIFF_REL;
}

async function probeCargoMutants(cwd: string): Promise<boolean> {
  const result = await safeSpawn('cargo', ['mutants', '--version'], {
    cwd,
    timeoutSeconds: 30,
    maxChars: 2000,
  });
  if (result.code !== 0) return false;

  const version = parseVersionTuple(`${result.stdout}\n${result.stderr}`);
  if (!version) return true;
  return versionGte(version, MIN_CARGO_MUTANTS_VERSION);
}

async function readOutcomesReport(
  cwd: string,
): Promise<CargoMutantsOutcomesFile> {
  const reportPath = path.join(cwd, OUTCOMES_REL);
  if (!(await fs.pathExists(reportPath))) {
    return {};
  }
  return (await fs.readJson(reportPath)) as CargoMutantsOutcomesFile;
}

export const cargoMutantsAdapter: MutationAdapter = {
  tool: 'cargo-mutants',
  stacks: ['rust-axum', 'rust-leptos', 'rust-leptos-csr'],

  async isAvailable(cwd: string): Promise<boolean> {
    return probeCargoMutants(cwd);
  },

  async run(input: MutationRunInput): Promise<MutationRunOutput> {
    if (!(await probeCargoMutants(input.cwd))) {
      throw new MutationToolNotFoundError('cargo-mutants');
    }

    let inDiffPath: string | undefined;
    if (input.incremental && input.changedFiles.length > 0) {
      const diff = await collectGitDiff(input.cwd, input.changedFiles);
      if (diff) {
        inDiffPath = await writeInDiffFile(input.cwd, diff);
      }
    }

    const spawnResult = await safeSpawn(
      'cargo',
      buildCargoMutantsArgv(input, inDiffPath),
      {
        cwd: input.cwd,
        timeoutSeconds: input.timeoutSeconds,
        maxChars: 8000,
      },
    );

    const report = await readOutcomesReport(input.cwd);
    const output = parseCargoMutantsReport(report, spawnResult.timedOut);

    if (
      spawnResult.code !== 0 &&
      !spawnResult.timedOut &&
      output.killed + output.survived === 0
    ) {
      throw new Error(
        `cargo mutants exited with code ${spawnResult.code}: ${spawnResult.stderr.trim()}`,
      );
    }

    return output;
  },
};

/** Registry export (task-030). */
export const adapter = cargoMutantsAdapter;
