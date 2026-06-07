import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRunFixture } from '../bench/harness.js';
import { loadFixture } from '../bench/fixtures.js';

const packagedSuiteDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/bench',
);

describe('bench harness', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs) await fs.remove(d).catch(() => undefined);
    tmpDirs.length = 0;
  });

  it('should_mark_solved_when_f2p_and_p2p_pass', async () => {
    const meta = await loadFixture(packagedSuiteDir, 'fix-001-nest-correct');
    const runFixture = createRunFixture({
      runTestSuite: async () => ({
        passed: ['add sums two numbers', 'add handles zero'],
        failed: [],
      }),
      applyPatch: async () => undefined,
      copyRepo: async (src, dest) => fs.copy(src, dest),
    });

    const result = await runFixture(meta, packagedSuiteDir);
    expect(result.solved).toBe(true);
    expect(result.fixRate).toBe(1);
    expect(result.passToPassRegressed).toBe(false);
  });

  it('should_zero_fix_rate_on_p2p_regression', async () => {
    const meta = await loadFixture(packagedSuiteDir, 'fix-004-fastapi-regression');
    const runFixture = createRunFixture({
      runTestSuite: async () => ({
        passed: ['test_add'],
        failed: [],
      }),
      applyPatch: async () => undefined,
      copyRepo: async (src, dest) => fs.copy(src, dest),
    });

    const result = await runFixture(meta, packagedSuiteDir);
    expect(result.passToPassRegressed).toBe(true);
    expect(result.fixRate).toBe(0);
    expect(result.solved).toBe(false);
  });

  it('should_cleanup_temp_dir', async () => {
    const meta = await loadFixture(packagedSuiteDir, 'fix-001-nest-correct');
    let capturedTmp = '';
    const runFixture = createRunFixture({
      copyRepo: async (src, dest) => {
        capturedTmp = dest;
        tmpDirs.push(dest);
        await fs.copy(src, dest);
      },
      applyPatch: async () => undefined,
      runTestSuite: async () => ({ passed: ['add sums two numbers', 'add handles zero'], failed: [] }),
    });

    await runFixture(meta, packagedSuiteDir);
    expect(capturedTmp).toBeTruthy();
    expect(await fs.pathExists(capturedTmp)).toBe(false);
  });

  it('should_reject_weak_test_fixture_as_unsolved', async () => {
    const meta = await loadFixture(packagedSuiteDir, 'fix-002-nest-weak-test');
    const runFixture = createRunFixture({
      runTestSuite: async () => ({
        passed: ['weak test only'],
        failed: ['real assertion'],
      }),
      applyPatch: async () => undefined,
      copyRepo: async (src, dest) => fs.copy(src, dest),
    });

    const result = await runFixture(meta, packagedSuiteDir);
    expect(result.solved).toBe(false);
  });
});
