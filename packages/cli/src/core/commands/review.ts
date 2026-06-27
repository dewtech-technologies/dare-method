import fs from 'fs-extra';
import { runCommandEnrichment } from '../../ai/pipeline.js';
import { resolveVerdictFromCounts } from '../../reporters/ci-gate.js';
import type { ReviewReport } from '../../types/Review.types.js';
import { findSpecFile, runReview as runStaticReview } from '../../utils/ReviewRunner.js';
import { registerRunner } from './types.js';
import type { CommandRunOptions, CommandRunResult } from './types.js';

type ReviewFormat = 'human' | 'json' | 'github';
type ReviewFailOn = 'none' | 'warn' | 'error';

interface ReviewInput {
  readonly taskId: string;
  readonly strict: boolean;
  readonly errorsOnly: boolean;
  readonly files?: ReadonlyArray<string>;
  readonly fromAgent?: string;
  readonly format: ReviewFormat;
  readonly failOn: ReviewFailOn;
  readonly comment: boolean;
}

function asRecord(input: CommandRunOptions['input']): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  return input as Record<string, unknown>;
}

function readRequiredString(
  value: unknown,
  field: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readFiles(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const files = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return files.length > 0 ? files : undefined;
}

function readFormat(value: unknown): ReviewFormat {
  if (value === 'json' || value === 'github' || value === 'human') return value;
  return 'human';
}

function readFailOn(value: unknown): ReviewFailOn {
  if (value === 'warn' || value === 'error' || value === 'none') return value;
  return 'none';
}

function readInput(input: CommandRunOptions['input']): ReviewInput {
  const raw = asRecord(input);
  return {
    taskId: readRequiredString(raw.taskId, 'input.taskId'),
    strict: readBoolean(raw.strict),
    errorsOnly: readBoolean(raw.errorsOnly),
    files: readFiles(raw.files),
    fromAgent: readOptionalString(raw.fromAgent),
    format: readFormat(raw.format),
    failOn: readFailOn(raw.failOn),
    comment: readBoolean(raw.comment),
  };
}

function toArtifactPath(cwd: string, artifactPath: string): string {
  const normalizedCwd = cwd.replace(/\\/g, '/');
  const normalizedArtifact = artifactPath.replace(/\\/g, '/');
  if (normalizedArtifact.startsWith(normalizedCwd)) {
    return normalizedArtifact.slice(normalizedCwd.length + 1);
  }
  return normalizedArtifact;
}

export async function runReview(opts: CommandRunOptions): Promise<CommandRunResult> {
  let enrichment: CommandRunResult['enrichment'];
  try {
    const input = readInput(opts.input);
    let fromAgent = input.fromAgent;

    if (opts.ai) {
      const specPath = await findSpecFile(opts.cwd, input.taskId);
      const spec = specPath ? await fs.readFile(specPath, 'utf-8') : '';
      enrichment = await runCommandEnrichment({
        command: 'review',
        cwd: opts.cwd,
        facts: { taskId: input.taskId, spec },
        provider: opts.provider,
        deep: opts.deep,
      });
      if (!enrichment.ok) {
        return {
          command: 'review',
          ok: false,
          facts: {
            taskId: input.taskId,
            format: input.format,
            failOn: input.failOn,
            comment: input.comment,
          },
          artifacts: [],
          enrichment,
          error: enrichment.error ?? 'AI enrichment failed for review.',
        };
      }
      if (!fromAgent) {
        fromAgent = enrichment.artifactPath ?? fromAgent;
      }
    }

    const report: ReviewReport = await runStaticReview(input.taskId, {
      projectRoot: opts.cwd,
      files: input.files ? [...input.files] : undefined,
      fromAgent,
      strict: input.strict,
      errorsOnly: input.errorsOnly,
      format: input.format === 'github' ? 'human' : input.format,
    });

    const verdict = report.failed
      ? 'fail'
      : resolveVerdictFromCounts(report.totals.errors, report.totals.warnings);
    const artifacts =
      enrichment?.artifactPath ? [toArtifactPath(opts.cwd, enrichment.artifactPath)] : [];

    return {
      command: 'review',
      ok: verdict === 'pass',
      facts: report,
      artifacts,
      enrichment,
      summary: [
        `taskId=${report.taskId}`,
        `verdict=${verdict}`,
        `errors=${report.totals.errors}`,
        `warnings=${report.totals.warnings}`,
        `format=${input.format}`,
        `failOn=${input.failOn}`,
      ],
    };
  } catch (err) {
    return {
      command: 'review',
      ok: false,
      facts: {
        taskId: asRecord(opts.input).taskId,
      },
      artifacts: [],
      enrichment,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

registerRunner('review', runReview);
