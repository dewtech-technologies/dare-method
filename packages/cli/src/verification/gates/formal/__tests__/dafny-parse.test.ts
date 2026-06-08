import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDafnyOutput,
  buildDafnyArgv,
} from '../dafny.js';
import type { FormalRunInput } from '../backend.js';

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
);

describe('parseDafnyOutput', () => {
  it('parses verified fixture ⇒ verified=true', async () => {
    const stdout = await fs.readFile(
      path.join(FIXTURES, 'dafny.verified.txt'),
      'utf8',
    );
    const result = parseDafnyOutput({
      stdout,
      stderr: '',
      code: 0,
      timedOut: false,
    });
    expect(result.verified).toBe(true);
    expect(result.reason).toBe('dafny: verified');
  });

  it('parses failed fixture ⇒ verified=false with impl stage', async () => {
    const stdout = await fs.readFile(
      path.join(FIXTURES, 'dafny.failed.txt'),
      'utf8',
    );
    const result = parseDafnyOutput({
      stdout,
      stderr: '',
      code: 2,
      timedOut: false,
    });
    expect(result.verified).toBe(false);
    expect(result.stage).toMatch(/impl|both/);
    expect(result.reason).toMatch(/postcondition|assertion|errors/i);
  });

  it('timeout ⇒ verified=false', () => {
    const result = parseDafnyOutput({
      stdout: '',
      stderr: '',
      code: 124,
      timedOut: true,
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('proof timed out');
  });

  it('unparseable exit ⇒ dafny: unparseable', () => {
    const result = parseDafnyOutput({
      stdout: 'unknown crash',
      stderr: '',
      code: 1,
      timedOut: false,
    });
    expect(result.reason).toBe('dafny: unparseable');
  });
});

describe('buildDafnyArgv', () => {
  it('builds verify argv with z3 and time limit', () => {
    const input: FormalRunInput = {
      cwd: '/proj',
      target: { file: 'src/a.ts', source: 'config' },
      specPath: 'DARE/EXECUTION/task-1.formal/spec.dfy',
      implPath: 'src/a.ts',
      proofTimeoutSeconds: 120,
    };
    expect(buildDafnyArgv(input)).toEqual([
      'verify',
      'DARE/EXECUTION/task-1.formal/spec.dfy',
      '--solver-path',
      'z3',
      '--verification-time-limit',
      '120',
    ]);
  });
});
