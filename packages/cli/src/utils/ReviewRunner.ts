/**
 * Orchestrates `dare review`:
 *   1. Resolve the task spec from `DARE/EXECUTION/task-<id>.md` (or other
 *      common locations).
 *   2. Discover which files the task touched — by parsing the spec's
 *      "ARQUIVOS A CRIAR / MODIFICAR" table, falling back to `git diff`
 *      against the merge base when the spec doesn't list files.
 *   3. Run the static analyzer over those files.
 *   4. Optionally merge a `SemanticVerdict` provided by the IDE agent
 *      (via `--from-agent <path>`).
 *
 * Pure data manipulation — file I/O happens through `fs-extra` and `child_process`.
 * The CLI command (`commands/review.ts`) wraps this with chalk output.
 */

import fs from 'fs-extra';
import path from 'path';
import { execFileSync } from 'child_process';
import type {
  ReviewOptions,
  ReviewReport,
  SemanticVerdict,
} from '../types/Review.types.js';
import { runStaticAnalysis } from './static-analyzer.js';

/** Candidate locations of a task spec, tried in order. */
function specCandidates(projectRoot: string, taskId: string): string[] {
  return [
    path.join(projectRoot, 'DARE', 'EXECUTION', `${taskId}.md`),
    path.join(projectRoot, 'DARE', 'EXECUTION', `task-${taskId}.md`),
    path.join(projectRoot, 'DARE', 'tasks', `${taskId}.md`),
    path.join(projectRoot, 'DARE', `${taskId}.md`),
  ];
}

export async function findSpecFile(
  projectRoot: string,
  taskId: string,
): Promise<string | null> {
  for (const candidate of specCandidates(projectRoot, taskId)) {
    if (await fs.pathExists(candidate)) return candidate;
  }
  return null;
}

/**
 * Parse the "ARQUIVOS A CRIAR / MODIFICAR" markdown table from a spec.
 *
 * Expected shape (from `TASK-SPEC-template.md`):
 *
 *   | Ação | Caminho | Descrição |
 *   |------|---------|-----------|
 *   | CRIAR | `src/foo.ts` | ... |
 *   | MODIFICAR | `src/bar.ts` | ... |
 *
 * We grab anything in backticks within rows where the first column is
 * CRIAR/MODIFICAR/CREATE/MODIFY/UPDATE. Returns project-relative paths.
 */
export function parseFilesFromSpec(specMarkdown: string): string[] {
  const lines = specMarkdown.split(/\r?\n/);
  const out: string[] = [];
  const actionRe = /^\|\s*(CRIAR|MODIFICAR|CREATE|MODIFY|UPDATE|TOUCH)\s*\|/i;
  const pathRe = /`([^`]+)`/;

  for (const line of lines) {
    if (!actionRe.test(line)) continue;
    const m = pathRe.exec(line);
    if (!m) continue;
    const filePath = m[1].trim();
    // Filter obvious non-file references (directories, comments).
    if (!filePath || filePath.endsWith('/') || filePath.startsWith('[')) continue;
    out.push(filePath);
  }

  // De-dupe while preserving order.
  return Array.from(new Set(out));
}

/**
 * Fallback: ask git which files diverge from the merge base with the default
 * branch. Returns project-relative paths; on any git error, returns `[]`
 * silently — the caller is expected to surface a friendlier message.
 */
export function discoverFilesFromGit(projectRoot: string): string[] {
  try {
    const baseRef = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    // Diff vs HEAD~1 if no merge-base is sensible — best-effort.
    const out = execFileSync(
      'git',
      ['diff', '--name-only', 'HEAD', '--', '.'],
      { cwd: projectRoot, stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .toString()
      .trim();
    if (!out) return [];
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    void baseRef; // (silence unused-warning when only diff matters)
  } catch {
    return [];
  }
}

/** Build the empty-shell report when there are no files to scan. */
function emptyReport(taskId: string): ReviewReport {
  return {
    taskId,
    filesScanned: [],
    reports: [],
    failed: false,
    totals: { errors: 0, warnings: 0, filesWithFindings: 0 },
  };
}

/** Read the optional semantic verdict supplied by the IDE agent. */
async function loadSemanticVerdict(
  fromAgentPath: string,
): Promise<SemanticVerdict | null> {
  if (!(await fs.pathExists(fromAgentPath))) {
    throw new Error(`--from-agent file not found: ${fromAgentPath}`);
  }
  const data = await fs.readJSON(fromAgentPath);
  if (typeof data?.passed !== 'boolean' || !Array.isArray(data?.unmetCriteria)) {
    throw new Error(
      `Invalid semantic verdict in ${fromAgentPath}: needs { passed: boolean, unmetCriteria: string[] }.`,
    );
  }
  return data as SemanticVerdict;
}

/**
 * Main entry point. Resolves files, runs the analyzer, merges semantic input
 * if any, and returns a fully populated `ReviewReport`.
 */
export async function runReview(
  taskId: string,
  options: ReviewOptions = {},
): Promise<ReviewReport> {
  const projectRoot = options.projectRoot ?? process.cwd();

  // 1. Resolve file list.
  let files = options.files ?? [];
  if (files.length === 0) {
    const specPath = await findSpecFile(projectRoot, taskId);
    if (specPath) {
      const md = await fs.readFile(specPath, 'utf-8');
      files = parseFilesFromSpec(md);
    }
  }
  if (files.length === 0) {
    // Last-ditch: try git.
    files = discoverFilesFromGit(projectRoot);
  }

  if (files.length === 0) {
    return emptyReport(taskId);
  }

  // 2. Run analyzer.
  const reports = await runStaticAnalysis(projectRoot, files);

  // 3. Aggregate totals.
  let errors = 0;
  let warnings = 0;
  let filesWithFindings = 0;
  for (const r of reports) {
    if (r.violations.length === 0) continue;
    filesWithFindings++;
    for (const v of r.violations) {
      if (v.severity === 'error') errors++;
      else warnings++;
    }
  }

  // 4. Optional semantic merge.
  let semantic: SemanticVerdict | undefined;
  if (options.fromAgent) {
    const v = await loadSemanticVerdict(options.fromAgent);
    if (v) semantic = v;
  }

  const failedFromStatic =
    errors > 0 || (Boolean(options.strict) && warnings > 0);
  const failedFromSemantic = semantic ? !semantic.passed : false;

  return {
    taskId,
    filesScanned: files,
    reports,
    failed: failedFromStatic || failedFromSemantic,
    totals: { errors, warnings, filesWithFindings },
    semantic,
  };
}
