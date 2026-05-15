/**
 * Types for `dare refine` — the planning-time and on-demand check that
 * keeps individual tasks small enough for the agent to implement in a
 * single conversation without hand-waving.
 *
 * Two ways to invoke it:
 *   1. Implicit (during `/dare-tasks` skill): the IDE agent calls
 *      `dare refine <task-id>` for each just-generated task and uses the
 *      report to decide whether to split or keep.
 *   2. Manual (`dare refine <id> [--split]`): the dev kicks it off when a
 *      task feels too heavy or after a scope change.
 *
 * The complexity heuristic is intentionally cheap and deterministic — it
 * counts well-known signals from the task spec (files, functions, tests,
 * deps, prompt keywords). The IDE agent layer can add semantic nuance with
 * `--from-agent <verdict.json>`, mirroring the review pattern.
 */

/** Coarse complexity buckets. Stable strings for cross-process consumers. */
export type ComplexityLevel = 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';

/** Individual contributor to the total score. Used for transparency. */
export interface ComplexitySignal {
  /** Short, lowercase id. Examples: `files`, `functions`, `keywords`. */
  kind: string;
  /** Numeric weight added to the score. */
  weight: number;
  /** Human-readable explanation: "5 arquivos a criar/modificar". */
  detail: string;
}

/** Output of running the heuristic against a single task. */
export interface ComplexityReport {
  /** Task id under analysis. */
  taskId: string;
  /** Path to the spec file that was parsed (relative to project root). */
  specPath: string | null;
  /** Raw score — sum of all signal weights. */
  score: number;
  /** Bucket derived from `score`. */
  level: ComplexityLevel;
  /** Whether the heuristic recommends splitting this task. */
  recommendsSplit: boolean;
  /** Ordered list of signals that contributed to the score (largest first). */
  signals: ComplexitySignal[];
}

/**
 * Proposed sub-task produced by `--split`. Not yet committed to `dare-dag.yaml`
 * — the agent / dev confirms before writing.
 */
export interface ProposedSubtask {
  /** Suggested kebab-case id (e.g. `task-034a`, `task-034b`). */
  id: string;
  /** Short title. */
  title: string;
  /** Files this sub-task should own (subset of the parent's files). */
  files: string[];
  /** Why this slice exists — surfaced to the dev for sanity-check. */
  rationale: string;
  /** Coarse complexity of the sub-task itself (best-effort). */
  estimatedLevel: ComplexityLevel;
}

/** Result of `dare refine <id> --split` before any write happens. */
export interface SplitProposal {
  /** Source task that's being split. */
  originalTaskId: string;
  /** Subtasks the dev / agent will replace it with. */
  subtasks: ProposedSubtask[];
  /** Free-form note from the analyzer about the split shape. */
  notes: string;
}

/** CLI options for `dare refine`. */
export interface RefineOptions {
  /** Project root, defaults to `process.cwd()`. */
  projectRoot?: string;
  /** When true, emit a split proposal alongside the complexity report. */
  split?: boolean;
  /** When true, write the split back into `dare-dag.yaml` after approval. */
  apply?: boolean;
  /** Output format. */
  format?: 'human' | 'json';
  /** Optional semantic verdict from the IDE agent (JSON path). */
  fromAgent?: string;
}

/**
 * Optional semantic input the IDE agent can supply via `--from-agent`. The
 * agent gets a richer view of the spec and may flag tasks the heuristic
 * couldn't see (e.g. "this task needs a new service abstraction we don't
 * have yet — that's a refactor task on its own").
 */
export interface RefineVerdict {
  /** Whether the agent considers the task small enough to ship cleanly. */
  manageable: boolean;
  /** Reasons the agent thinks splitting would help. */
  reasons: string[];
  /** Optional pre-baked subtask proposals from the agent. */
  proposedSubtasks?: ProposedSubtask[];
}
