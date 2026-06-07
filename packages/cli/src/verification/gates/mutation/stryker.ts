import path from 'node:path';
import fs from 'fs-extra';
import { safeSpawn } from '../../../exec/safe-spawn.js';
import { npmInvoke } from '../../../exec/npm-invoke.js';
import type {
  MutationAdapter,
  MutationRunInput,
  MutationRunOutput,
} from './adapter.js';
import {
  MutationToolNotFoundError,
  mutationScore,
} from './adapter.js';

export const STRYKER_REPORT_REL = path.join(
  'reports',
  'mutation',
  'mutation.json',
);

const MUTATABLE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i;

interface StrykerMutant {
  readonly status?: string;
}

interface StrykerReport {
  readonly files?: Record<
    string,
    { readonly mutants?: ReadonlyArray<StrykerMutant> }
  >;
}

function isKilledStatus(status: string): boolean {
  return status === 'Killed' || status === 'Timeout';
}

/** Parse Stryker JSON report (mutation-testing-report-schema) into normalized output. */
export function parseStrykerReport(
  report: StrykerReport,
  timedOut = false,
): MutationRunOutput {
  let killed = 0;
  let survived = 0;
  let noCoverage = 0;

  for (const file of Object.values(report.files ?? {})) {
    for (const mutant of file.mutants ?? []) {
      const status = mutant.status ?? '';
      if (isKilledStatus(status)) killed += 1;
      else if (status === 'Survived') survived += 1;
      else if (status === 'NoCoverage') noCoverage += 1;
    }
  }

  const output: MutationRunOutput = {
    killed,
    survived,
    noCoverage,
    timedOut,
    tool: 'stryker',
    score: mutationScore({
      killed,
      survived,
      noCoverage,
      timedOut,
      tool: 'stryker',
      score: 0,
    }),
  };

  return output;
}

function mutableChangedFiles(
  changedFiles: ReadonlyArray<string>,
): string[] {
  return changedFiles.filter((f) => MUTATABLE_EXT.test(f));
}

/** Build npm exec argv for `stryker run` (exported for tests). */
export function buildStrykerArgv(input: MutationRunInput): string[] {
  const argv = ['exec', '--no', 'stryker', 'run', '--reporters', 'json'];

  if (input.maxMutants > 0) {
    argv.push('--maxMutants', String(input.maxMutants));
  }

  if (input.incremental) {
    argv.push('--incremental');
    for (const file of mutableChangedFiles(input.changedFiles)) {
      argv.push('--mutate', file);
    }
  }

  return argv;
}

async function probeStryker(cwd: string): Promise<boolean> {
  const npm = npmInvoke(['exec', '--no', 'stryker', '--version']);
  const result = await safeSpawn(npm.command, npm.args, {
    cwd,
    timeoutSeconds: 30,
    maxChars: 2000,
  });
  return result.code === 0;
}

async function readStrykerReport(cwd: string): Promise<StrykerReport> {
  const reportPath = path.join(cwd, STRYKER_REPORT_REL);
  if (!(await fs.pathExists(reportPath))) {
    return { files: {} };
  }
  return (await fs.readJson(reportPath)) as StrykerReport;
}

export const strykerAdapter: MutationAdapter = {
  tool: 'stryker',
  stacks: ['node-nestjs', 'react', 'vue', 'mcp-server-node-ts'],

  async isAvailable(cwd: string): Promise<boolean> {
    return probeStryker(cwd);
  },

  async run(input: MutationRunInput): Promise<MutationRunOutput> {
    if (!(await probeStryker(input.cwd))) {
      throw new MutationToolNotFoundError('stryker');
    }

    const npm = npmInvoke(buildStrykerArgv(input));
    const spawnResult = await safeSpawn(npm.command, npm.args, {
      cwd: input.cwd,
      timeoutSeconds: input.timeoutSeconds,
      maxChars: 8000,
    });

    const report = await readStrykerReport(input.cwd);
    const output = parseStrykerReport(report, spawnResult.timedOut);

    if (spawnResult.code !== 0 && !spawnResult.timedOut && output.killed + output.survived === 0) {
      throw new Error(
        `Stryker exited with code ${spawnResult.code}: ${spawnResult.stderr.trim()}`,
      );
    }

    return output;
  },
};

/** Registry export (task-030). */
export const adapter = strykerAdapter;
