import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBypass } from '../anti-bypass.js';
import { dafnyBackend } from '../dafny.js';

const FIXTURES_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../fixtures/formal',
);

interface Expected {
  verified: boolean;
  bypassExpected: boolean;
}

describe('formal verified-rate harness', () => {
  it('rejects 100% of bypass fixtures (O-06)', async () => {
    const suite = (await fs.readJson(
      path.join(FIXTURES_ROOT, 'suite.json'),
    )) as { fixtures: string[] };
    let bypassCount = 0;
    let rejected = 0;
    for (const id of suite.fixtures) {
      const dir = path.join(FIXTURES_ROOT, id);
      const expected = (await fs.readJson(
        path.join(dir, 'expected.json'),
      )) as Expected;
      if (!expected.bypassExpected) continue;
      bypassCount += 1;
      const spec = await fs.readFile(path.join(dir, 'spec.dfy'), 'utf8');
      const impl = await fs.readFile(path.join(dir, 'impl.ts'), 'utf8');
      const bypass = detectBypass({ specSource: spec, implSource: impl });
      if (bypass.bypassDetected) rejected += 1;
    }
    expect(bypassCount).toBeGreaterThanOrEqual(2);
    expect(rejected).toBe(bypassCount);
  });

  it('honest fixtures pass anti-bypass', async () => {
    const suite = (await fs.readJson(
      path.join(FIXTURES_ROOT, 'suite.json'),
    )) as { fixtures: string[]; verifiedRateTarget: number };
    let honest = 0;
    let clean = 0;
    for (const id of suite.fixtures) {
      const dir = path.join(FIXTURES_ROOT, id);
      const expected = (await fs.readJson(
        path.join(dir, 'expected.json'),
      )) as Expected;
      if (expected.bypassExpected) continue;
      honest += 1;
      const spec = await fs.readFile(path.join(dir, 'spec.dfy'), 'utf8');
      const impl = await fs.readFile(path.join(dir, 'impl.ts'), 'utf8');
      if (!detectBypass({ specSource: spec, implSource: impl }).bypassDetected) {
        clean += 1;
      }
    }
    expect(honest).toBeGreaterThanOrEqual(3);
    expect(clean / honest).toBeGreaterThanOrEqual(suite.verifiedRateTarget);
  });

  it('dafny isAvailable skips gracefully when absent', async () => {
    const available = await dafnyBackend.isAvailable(process.cwd());
    expect(typeof available).toBe('boolean');
  });
});
