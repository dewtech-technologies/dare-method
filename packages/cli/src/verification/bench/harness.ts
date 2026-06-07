import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { safeSpawn } from '../../exec/safe-spawn.js';
import { assertRelativeSafe } from '../../utils/path-safety.js';
import { testCommandFor } from '../gates/fail-to-pass.js';
import type { FixtureMeta } from './fixtures.js';
import { loadFixture, loadSuite } from './fixtures.js';
import {
  computeFixtureResult,
  type FixtureResult,
  type RawFixtureCounts,
} from './report.js';

interface VitestJsonReport {
  testResults?: Array<{
    name?: string;
    assertionResults?: Array<{ fullName?: string; status?: string }>;
  }>;
}

export interface SuiteRunResult {
  readonly passed: string[];
  readonly failed: string[];
}

export interface HarnessDeps {
  readonly runTestSuite: (
    cwd: string,
    stack: string,
  ) => Promise<SuiteRunResult>;
  readonly copyRepo: (src: string, dest: string) => Promise<void>;
  readonly applyPatch: (cwd: string, patchPath: string) => Promise<void>;
}

function parseVitestJson(stdout: string): SuiteRunResult {
  const passed: string[] = [];
  const failed: string[] = [];
  try {
    const report = JSON.parse(stdout) as VitestJsonReport;
    for (const fileResult of report.testResults ?? []) {
      for (const assertion of fileResult.assertionResults ?? []) {
        const name = assertion.fullName ?? 'unknown';
        if (assertion.status === 'passed') passed.push(name);
        else if (assertion.status === 'failed') failed.push(name);
      }
    }
  } catch {
    // unstructured output
  }
  return { passed, failed };
}

async function defaultRunTestSuite(
  cwd: string,
  stack: string,
): Promise<SuiteRunResult> {
  const { command, args } = testCommandFor(stack, '**/*.{spec,test}.{ts,tsx,js}');
  const result = await safeSpawn(command, args, {
    cwd,
    timeoutSeconds: 300,
    maxChars: 200_000,
  });
  return parseVitestJson(result.stdout);
}

function normalizePatch(content: string): string {
  return content
    .replace(/^--- a\/repo\//gm, '--- a/')
    .replace(/^\+\+\+ b\/repo\//gm, '+++ b/')
    .replace(/^diff --git a\/repo\//gm, 'diff --git a/');
}

async function defaultApplyPatch(cwd: string, patchPath: string): Promise<void> {
  const raw = await fs.readFile(patchPath, 'utf8');
  const normalized = normalizePatch(raw);
  const tmpPatch = path.join(cwd, '.dare-patch.tmp');
  await fs.writeFile(tmpPatch, normalized);
  const result = await safeSpawn('git', ['apply', '--whitespace=nowarn', tmpPatch], {
    cwd,
    timeoutSeconds: 60,
    maxChars: 8000,
  });
  await fs.remove(tmpPatch).catch(() => undefined);
  if (result.code !== 0) {
    throw new Error(`patch apply failed: ${result.stderr.trim()}`);
  }
}

async function readTestList(fixtureDir: string, file: string): Promise<string[]> {
  const content = await fs.readFile(path.join(fixtureDir, file), 'utf8');
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function countListedTests(
  listed: ReadonlyArray<string>,
  passed: ReadonlyArray<string>,
): { passed: number; total: number } {
  let passCount = 0;
  for (const name of listed) {
    if (passed.some((p) => p.includes(name) || name.includes(p))) passCount++;
  }
  return { passed: passCount, total: listed.length };
}

const defaultDeps: HarnessDeps = {
  runTestSuite: defaultRunTestSuite,
  copyRepo: async (src, dest) => fs.copy(src, dest),
  applyPatch: defaultApplyPatch,
};

export function createRunFixture(deps: Partial<HarnessDeps> = {}) {
  const d = { ...defaultDeps, ...deps };

  return async function runFixture(
    meta: FixtureMeta,
    baseDir: string,
  ): Promise<FixtureResult> {
    assertRelativeSafe(meta.id);
    const fixtureDir = path.join(baseDir, meta.id);
    const repoSrc = path.join(fixtureDir, 'repo');
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-bench-'));
    const started = Date.now();

    try {
      await d.copyRepo(repoSrc, tmpDir);
      await safeSpawn('git', ['init'], { cwd: tmpDir, timeoutSeconds: 30 });
      await safeSpawn('git', ['add', '.'], { cwd: tmpDir, timeoutSeconds: 30 });
      await safeSpawn('git', ['commit', '-m', 'baseline'], {
        cwd: tmpDir,
        timeoutSeconds: 30,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'dare-bench',
          GIT_AUTHOR_EMAIL: 'bench@dare.local',
          GIT_COMMITTER_NAME: 'dare-bench',
          GIT_COMMITTER_EMAIL: 'bench@dare.local',
        },
      });

      await d.applyPatch(tmpDir, path.join(fixtureDir, meta.patch));

      const run = await d.runTestSuite(tmpDir, meta.stack);
      const f2pList = await readTestList(fixtureDir, meta.failToPass);
      const p2pList = await readTestList(fixtureDir, meta.passToPass);

      const raw: RawFixtureCounts = {
        id: meta.id,
        stack: meta.stack,
        failToPass: countListedTests(f2pList, run.passed),
        passToPass: countListedTests(p2pList, run.passed),
        durationMs: Date.now() - started,
      };

      return computeFixtureResult(raw);
    } finally {
      await fs.remove(tmpDir).catch(() => undefined);
    }
  };
}

export const runFixture = createRunFixture();

export interface RunSuiteOptions {
  readonly filter?: string;
  readonly deps?: Partial<HarnessDeps>;
}

function matchesFilter(id: string, filter?: string): boolean {
  if (!filter) return true;
  const re = new RegExp(
    '^' + filter.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
  );
  return re.test(id);
}

export async function runSuite(
  suiteDir: string,
  opts: RunSuiteOptions = {},
): Promise<FixtureResult[]> {
  const fixtures = await loadSuite(suiteDir);
  const runOne = createRunFixture(opts.deps);
  const results: FixtureResult[] = [];

  for (const meta of fixtures) {
    if (!matchesFilter(meta.id, opts.filter)) continue;
    results.push(await runOne(meta, suiteDir));
  }

  return results;
}
