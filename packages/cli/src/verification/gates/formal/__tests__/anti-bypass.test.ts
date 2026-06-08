import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBypass, extractClauses } from '../anti-bypass.js';

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
);

describe('detectBypass', () => {
  it('reprova bypass.spec.dfy com assume(false) mesmo com solver exit 0', async () => {
    const spec = await fs.readFile(path.join(FIXTURES, 'bypass.spec.dfy'), 'utf8');
    const result = detectBypass({ specSource: spec, implSource: '' });
    expect(result.bypassDetected).toBe(true);
    expect(result.pattern).toBe('assume(false)');
  });

  it('spec honesta ⇒ bypassDetected=false', () => {
    const spec = `
method Add(a: int, b: int) returns (result: int)
  ensures result == a + b
{
}
`;
    const impl = `
function add(a: number, b: number): number {
  return a + b;
}
`;
    expect(detectBypass({ specSource: spec, implSource: impl })).toEqual({
      bypassDetected: false,
    });
  });

  it('vazamento spec→impl ⇒ bypassDetected=true', () => {
    const spec = `
method Check(x: int) returns (ok: bool)
  ensures x >= 0 && x <= 100;
{
}
`;
    const impl = `
export function check(x: number): boolean {
  return x >= 0 && x <= 100;
}
`;
    const result = detectBypass({ specSource: spec, implSource: impl });
    expect(result.bypassDetected).toBe(true);
    expect(result.pattern).toBe('spec leaked into impl');
  });

  it('extractClauses collects ensures/requires bodies', () => {
    const clauses = extractClauses(`
ensures result == a + b;
requires x > 0;
`);
    expect(clauses).toContain('result == a + b');
    expect(clauses).toContain('x > 0');
  });
});
