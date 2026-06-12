import { describe, expect, it } from 'vitest';
import {
  exitCodeForFailOn,
  guardResultsToFindings,
  parseFailOn,
  resolveVerdictFromCounts,
  violationsToFindings,
} from '../../reporters/ci-gate.js';
import type { GuardResult } from '../../guard/types.js';
import type { Violation } from '../../types/Review.types.js';

describe('CI gate flags', () => {
  it('parseFailOn_accepts_none_warn_error', () => {
    expect(parseFailOn('none')).toBe('none');
    expect(parseFailOn('warn')).toBe('warn');
    expect(parseFailOn('error')).toBe('error');
    expect(parseFailOn('invalid')).toBeNull();
  });

  it('fail_on_none_never_blocks', () => {
    expect(exitCodeForFailOn('none', 'fail')).toBe(0);
    expect(exitCodeForFailOn('none', 'warn')).toBe(0);
    expect(exitCodeForFailOn('warn', 'warn')).toBe(1);
    expect(exitCodeForFailOn('error', 'warn')).toBe(0);
    expect(exitCodeForFailOn('error', 'fail')).toBe(1);
  });

  it('violationsToFindings_relativizes_paths', () => {
    const cwd = 'C:\\project';
    const violations: Violation[] = [
      {
        kind: 'todo-marker',
        severity: 'error',
        file: 'src/a.ts',
        line: 3,
        snippet: '// TODO',
        message: 'todo found',
      },
    ];
    const findings = violationsToFindings(violations, cwd);
    expect(findings[0].file).toBe('src/a.ts');
    expect(findings[0].severity).toBe('error');
  });

  it('guardResultsToFindings_maps_verdicts', () => {
    const results: GuardResult[] = [
      {
        artifact: 'DARE/spec.md',
        verdict: 'FAIL',
        findings: [
          {
            layer: 'scan',
            severity: 'FAIL',
            rule: 'secret-pattern',
            evidence: 'possible secret in file',
          },
        ],
      },
    ];
    const findings = guardResultsToFindings(results, process.cwd());
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
  });

  it('resolveVerdictFromCounts', () => {
    expect(resolveVerdictFromCounts(0, 0)).toBe('pass');
    expect(resolveVerdictFromCounts(0, 2)).toBe('warn');
    expect(resolveVerdictFromCounts(1, 0)).toBe('fail');
  });
});
