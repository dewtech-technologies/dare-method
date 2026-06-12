import type { GuardFinding, GuardResult, GuardVerdict } from '../guard/types.js';
import type { DriftFinding } from '../graphrag/drift.js';
import type { Violation } from '../types/Review.types.js';
import {
  emitAnnotations,
  readGitHubPrContext,
  relativizePath,
  sanitizeFindingText,
  upsertPrComment,
  type Finding,
  type GateSummary,
} from './github.js';

export type FailOnMode = 'none' | 'warn' | 'error';
export type CiOutputFormat = 'human' | 'json' | 'github';

export type GateVerdict = 'pass' | 'warn' | 'fail';

export function parseFailOn(value: string | undefined): FailOnMode | null {
  if (!value || value === 'none') return 'none';
  if (value === 'warn' || value === 'error') return value;
  return null;
}

export function parseCiFormat(value: string | undefined): CiOutputFormat | null {
  if (!value || value === 'human') return 'human';
  if (value === 'json' || value === 'github') return value;
  return null;
}

export function resolveVerdictFromCounts(errors: number, warnings: number): GateVerdict {
  if (errors > 0) return 'fail';
  if (warnings > 0) return 'warn';
  return 'pass';
}

export function guardVerdictToGateVerdict(verdict: GuardVerdict): GateVerdict {
  if (verdict === 'FAIL') return 'fail';
  if (verdict === 'WARN') return 'warn';
  return 'pass';
}

export function worstGuardVerdict(results: ReadonlyArray<GuardResult>): GuardVerdict {
  if (results.some((r) => r.verdict === 'FAIL')) return 'FAIL';
  if (results.some((r) => r.verdict === 'WARN')) return 'WARN';
  return 'PASS';
}

export function exitCodeForFailOn(failOn: FailOnMode, verdict: GateVerdict): number {
  if (failOn === 'none') return 0;
  if (failOn === 'warn' && verdict !== 'pass') return 1;
  if (failOn === 'error' && verdict === 'fail') return 1;
  return 0;
}

export function violationsToFindings(
  violations: ReadonlyArray<Violation>,
  cwd: string,
): Finding[] {
  return violations.map((v) => ({
    severity: v.severity,
    file: relativizePath(v.file, cwd),
    line: v.line,
    rule: v.kind,
    message: sanitizeFindingText(v.message || v.snippet),
  }));
}

export function guardResultsToFindings(
  results: ReadonlyArray<GuardResult>,
  cwd: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const result of results) {
    for (const f of result.findings) {
      findings.push({
        severity: f.severity === 'FAIL' ? 'error' : 'warning',
        file: relativizePath(result.artifact, cwd),
        line: 1,
        rule: f.rule,
        message: sanitizeFindingText(f.evidence),
      });
    }
  }
  return findings;
}

export function driftFindingsToFindings(findings: ReadonlyArray<DriftFinding>): Finding[] {
  return findings.map((f) => ({
    severity: 'warning',
    rule: f.kind,
    message: sanitizeFindingText(`${f.label}: ${f.detail}`),
  }));
}

export interface ApplyCiGateOutputOptions {
  readonly gate: string;
  readonly format: CiOutputFormat;
  readonly comment: boolean;
  readonly failOn: FailOnMode;
  readonly findings: ReadonlyArray<Finding>;
  readonly verdict: GateVerdict;
  readonly cwd: string;
}

export async function applyCiGateOutput(opts: ApplyCiGateOutputOptions): Promise<number> {
  if (opts.format === 'github') {
    emitAnnotations(opts.findings);
  }

  if (opts.comment) {
    const ctx = readGitHubPrContext();
    if (ctx) {
      const summary: GateSummary[] = [
        {
          gate: opts.gate,
          verdict: opts.verdict,
          count: opts.findings.length,
        },
      ];
      await upsertPrComment({
        ...ctx,
        summary,
        findings: opts.findings,
      });
    }
  }

  return exitCodeForFailOn(opts.failOn, opts.verdict);
}
