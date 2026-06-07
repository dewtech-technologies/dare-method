import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadFixture, loadSuite } from '../bench/fixtures.js';

const packagedSuiteDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/bench',
);

describe('bench fixtures loader', () => {
  it('should_load_valid_suite', async () => {
    const fixtures = await loadSuite(packagedSuiteDir);
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
    const ids = fixtures.map((f) => f.id);
    expect(ids).toContain('fix-001-nest-correct');
    expect(ids).toContain('fix-002-nest-weak-test');
    expect(ids).toContain('fix-006-fastapi-weak-test');
  });
});

describe('bench fixtures validation', () => {
  let tmpSuite: string;

  beforeEach(async () => {
    tmpSuite = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-bench-fixtures-'));
    await fs.copy(packagedSuiteDir, tmpSuite);
  });

  afterEach(async () => {
    await fs.remove(tmpSuite).catch(() => undefined);
  });

  it('should_reject_missing_files', async () => {
    await fs.remove(path.join(tmpSuite, 'fix-001-nest-correct', 'fail_to_pass.txt'));
    await expect(loadFixture(tmpSuite, 'fix-001-nest-correct')).rejects.toThrow(
      /missing required file: fail_to_pass\.txt/,
    );
  });

  it('should_reject_unsafe_paths', async () => {
    await expect(loadFixture(tmpSuite, '../escape')).rejects.toThrow(/must not contain '\.\.'/);
  });
});
