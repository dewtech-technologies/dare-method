import type { MutationTool } from '../../types.js';

export interface MutationRunInput {
  readonly cwd: string;
  readonly changedFiles: ReadonlyArray<string>;
  readonly incremental: boolean;
  readonly maxMutants: number;
  readonly timeoutSeconds: number;
}

export interface MutationRunOutput {
  /** killed/(killed+survived). NaN when no mutants — caller treats as SKIP. */
  readonly score: number;
  readonly killed: number;
  readonly survived: number;
  readonly noCoverage: number;
  readonly timedOut: boolean;
  readonly tool: MutationTool;
}

export interface MutationAdapter {
  readonly tool: MutationTool;
  readonly stacks: ReadonlyArray<string>;
  isAvailable(cwd: string): Promise<boolean>;
  run(input: MutationRunInput): Promise<MutationRunOutput>;
}

export class MutationToolNotFoundError extends Error {
  readonly tool: MutationTool;

  constructor(tool: MutationTool) {
    super(`Mutation tool not available: ${tool}`);
    this.name = 'MutationToolNotFoundError';
    this.tool = tool;
  }
}

export class UnknownMutationStackError extends Error {
  readonly stack: string;

  constructor(stack: string) {
    super(`No mutation adapter registered for stack: ${stack}`);
    this.name = 'UnknownMutationStackError';
    this.stack = stack;
  }
}

/** Normalized mutation score for reporting gates. */
export function mutationScore(output: MutationRunOutput): number {
  const denom = output.killed + output.survived;
  if (denom === 0) return Number.NaN;
  return output.killed / denom;
}
