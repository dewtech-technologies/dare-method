import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {
  snapshotTests,
  checkAntiTamper,
} from '../gates/anti-tamper.js';

describe('anti-tamper', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-tamper-'));
  });

  afterEach(async () => {
    await fs.remove(cwd).catch(() => undefined);
  });

  it('should_count_assertions_js', async () => {
    await fs.writeFile(
      path.join(cwd, 'sample.test.ts'),
      `
        // expect(1) in comment should not count
        it('x', () => {
          expect(1).toBe(1);
          expect(2).toEqual(2);
          assert(true);
        });
      `,
    );

    const snap = await snapshotTests({ cwd, testGlob: 'sample.test.ts' });
    expect(snap.assertionCount).toBe(5);
  });

  it('should_count_assertions_py', async () => {
    await fs.writeFile(
      path.join(cwd, 'sample_test.py'),
      `
def test_x():
    assert 1 == 1
    self.assertTrue(True)
    with pytest.raises(ValueError):
        raise ValueError()
      `,
    );

    const snap = await snapshotTests({ cwd, testGlob: 'sample_test.py' });
    expect(snap.assertionCount).toBe(3);
  });

  it('should_fail_when_assertion_removed', async () => {
    const file = 'suite.test.ts';
    await fs.writeFile(
      path.join(cwd, file),
      `it('a', () => { expect(1).toBe(1); expect(2).toBe(2); });`,
    );
    const baseline = await snapshotTests({ cwd, testGlob: file });

    await fs.writeFile(
      path.join(cwd, file),
      `it('a', () => { expect(1).toBe(1); });`,
    );

    const result = await checkAntiTamper({ baseline, cwd, testGlob: file });
    expect(result.verdict).toBe('FAIL');
    expect(result.reason).toContain('assertion count dropped');
  });

  it('should_fail_on_skip', async () => {
    const file = 'skip.test.ts';
    await fs.writeFile(
      path.join(cwd, file),
      `it('a', () => { expect(1).toBe(1); });`,
    );
    const baseline = await snapshotTests({ cwd, testGlob: file });

    await fs.writeFile(
      path.join(cwd, file),
      `it.skip('a', () => { expect(1).toBe(1); });`,
    );

    const result = await checkAntiTamper({ baseline, cwd, testGlob: file });
    expect(result.verdict).toBe('FAIL');
    expect(result.reason).toContain(file);
  });

  it('should_fail_when_file_deleted', async () => {
    const file = 'gone.test.ts';
    await fs.writeFile(
      path.join(cwd, file),
      `it('a', () => { expect(1).toBe(1); });`,
    );
    const baseline = await snapshotTests({ cwd, testGlob: file });
    await fs.remove(path.join(cwd, file));

    const result = await checkAntiTamper({ baseline, cwd, testGlob: file });
    expect(result.verdict).toBe('FAIL');
    expect(result.reason).toContain('test file removed');
  });

  it('should_pass_when_unchanged_or_strengthened', async () => {
    const file = 'strong.test.ts';
    await fs.writeFile(
      path.join(cwd, file),
      `it('a', () => { expect(1).toBe(1); });`,
    );
    const baseline = await snapshotTests({ cwd, testGlob: file });

    await fs.writeFile(
      path.join(cwd, file),
      `it('a', () => { expect(1).toBe(1); expect(2).toEqual(2); });`,
    );

    const result = await checkAntiTamper({ baseline, cwd, testGlob: file });
    expect(result.verdict).toBe('PASS');
  });
});
