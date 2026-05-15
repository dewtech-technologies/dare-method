/**
 * Types for `dare review` — the post-execution sanity check that catches
 * stubs, mocks, TODOs, empty functions and similar "fake completeness"
 * patterns in the files a task touched.
 *
 * Two complementary layers:
 *   1. Static analysis (deterministic, this module) — regex / AST-lite scanning
 *      of files modified by the task.
 *   2. Semantic review (opt-in, agent-driven) — the IDE agent re-reads the
 *      spec and implementation and answers "does this satisfy the spec?".
 *      That layer lives in the IDE skills, not here; this types file only
 *      models its output so the command can merge both reports.
 */

/** Severity of a violation. `error` blocks DONE; `warning` is informational. */
export type ViolationSeverity = 'error' | 'warning';

/** Stable identifiers for each detector. Used in reports and ignore-lists. */
export type ViolationKind =
  | 'todo-marker' // TODO / FIXME / XXX / HACK comments
  | 'empty-function' // function declared with empty body
  | 'not-implemented-stub' // throw new Error('not implemented'), todo!(), unimplemented!()
  | 'phantom-return' // function whose only statement is `return null/undefined/{}/[]`
  | 'production-mock' // mock library calls outside test files
  | 'placeholder-comment' // // implement later, // stub, # placeholder
  | 'hardcoded-response'; // endpoint returns a literal object/array instead of querying

/** A single finding in a file. */
export interface Violation {
  kind: ViolationKind;
  severity: ViolationSeverity;
  /** Project-relative path. */
  file: string;
  /** 1-based line number where the offense was found. */
  line: number;
  /** Trimmed snippet of the offending line (max ~200 chars). */
  snippet: string;
  /** Short, actionable message for the dev. */
  message: string;
}

/** Aggregated outcome of analyzing one file. */
export interface FileReport {
  /** Project-relative path. */
  file: string;
  /** True if the file matched a "test file" pattern (mocks are allowed). */
  isTestFile: boolean;
  violations: Violation[];
}

/** Final report of a `dare review` invocation. */
export interface ReviewReport {
  /** Task id under review. */
  taskId: string;
  /** Files the task is supposed to have touched (from the spec or git). */
  filesScanned: string[];
  /** Per-file findings, including clean files (empty `violations`). */
  reports: FileReport[];
  /** True when there is at least one `error`-severity violation. */
  failed: boolean;
  /** Quick counts for the summary line. */
  totals: {
    errors: number;
    warnings: number;
    filesWithFindings: number;
  };
  /** Optional semantic verdict from the IDE agent (merged if present). */
  semantic?: SemanticVerdict;
}

/**
 * Verdict produced by the IDE agent in the semantic review layer. The CLI
 * accepts this via `dare review <id> --from-agent <path-to-json>` or via
 * stdin, and merges it into the final report.
 */
export interface SemanticVerdict {
  /** Whether the agent considers the implementation faithful to the spec. */
  passed: boolean;
  /** Spec criteria the agent could not match against implementation. */
  unmetCriteria: string[];
  /** Free-form notes the agent wants to surface. */
  notes?: string;
}

/** Options passed to `runReview`. */
export interface ReviewOptions {
  /** Project root, defaults to `process.cwd()`. */
  projectRoot?: string;
  /** Optional explicit file list (overrides spec/git detection). */
  files?: string[];
  /** Suppress warnings, only print errors. */
  errorsOnly?: boolean;
  /** Treat warnings as errors. */
  strict?: boolean;
  /** Path to JSON file with a `SemanticVerdict` from the IDE agent. */
  fromAgent?: string;
  /** Output format. `json` produces a machine-readable report for hooks. */
  format?: 'human' | 'json';
}
