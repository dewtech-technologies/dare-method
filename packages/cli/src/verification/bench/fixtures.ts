import path from 'node:path';
import fs from 'fs-extra';
import { assertRelativeSafe } from '../../utils/path-safety.js';

export interface FixtureMeta {
  readonly id: string;
  readonly stack: string;
  readonly description: string;
  readonly patch: string;
  readonly failToPass: string;
  readonly passToPass: string;
}

interface SuiteEntry {
  readonly id: string;
  readonly stack: string;
  readonly description: string;
}

interface SuiteJson {
  readonly fixtures: ReadonlyArray<SuiteEntry>;
}

const REQUIRED_FILES = [
  'meta.json',
  'patch.diff',
  'fail_to_pass.txt',
  'pass_to_pass.txt',
] as const;

function fixtureDir(suiteDir: string, id: string): string {
  assertRelativeSafe(id);
  return path.join(suiteDir, id);
}

async function assertFixtureFiles(suiteDir: string, id: string): Promise<string> {
  const dir = fixtureDir(suiteDir, id);
  for (const file of REQUIRED_FILES) {
    const rel = path.posix.join(id, file);
    assertRelativeSafe(rel);
    const abs = path.join(dir, file);
    if (!(await fs.pathExists(abs))) {
      throw new Error(`fixture '${id}' missing required file: ${file}`);
    }
  }
  const repoDir = path.join(dir, 'repo');
  if (!(await fs.pathExists(repoDir))) {
    throw new Error(`fixture '${id}' missing required directory: repo/`);
  }
  const repoEntries = await fs.readdir(repoDir);
  if (repoEntries.length === 0) {
    throw new Error(`fixture '${id}' repo/ must not be empty`);
  }
  return dir;
}

export async function loadFixture(
  suiteDir: string,
  id: string,
): Promise<FixtureMeta> {
  await assertFixtureFiles(suiteDir, id);
  const dir = fixtureDir(suiteDir, id);
  const meta = (await fs.readJson(path.join(dir, 'meta.json'))) as SuiteEntry;

  if (meta.id !== id) {
    throw new Error(`fixture meta id mismatch: expected '${id}', got '${meta.id}'`);
  }

  return {
    id: meta.id,
    stack: meta.stack,
    description: meta.description,
    patch: 'patch.diff',
    failToPass: 'fail_to_pass.txt',
    passToPass: 'pass_to_pass.txt',
  };
}

export async function loadSuite(suiteDir: string): Promise<ReadonlyArray<FixtureMeta>> {
  const suitePath = path.join(suiteDir, 'suite.json');
  if (!(await fs.pathExists(suitePath))) {
    throw new Error(`suite.json not found in ${suiteDir}`);
  }

  const suite = (await fs.readJson(suitePath)) as SuiteJson;
  if (!Array.isArray(suite.fixtures) || suite.fixtures.length === 0) {
    throw new Error(`suite.json in ${suiteDir} has no fixtures`);
  }

  const out: FixtureMeta[] = [];
  for (const entry of suite.fixtures) {
    assertRelativeSafe(entry.id);
    out.push(await loadFixture(suiteDir, entry.id));
  }
  return out;
}
