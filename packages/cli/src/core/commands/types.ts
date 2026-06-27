import type { AiCommandName, EnrichmentResult } from '../../ai/types.js';

export interface CommandRunOptions {
  readonly cwd: string;
  readonly ai?: boolean;
  readonly provider?: string;
  readonly deep?: boolean;
  readonly input?: Record<string, unknown>;
  readonly signal?: AbortSignal;
  readonly timeoutSeconds?: number;
}

export interface CommandRunResult {
  readonly command: AiCommandName;
  readonly ok: boolean;
  readonly facts: unknown;
  readonly artifacts: ReadonlyArray<string>;
  readonly enrichment?: EnrichmentResult;
  readonly summary?: ReadonlyArray<string>;
  readonly error?: string;
}

export type CommandRunner = (opts: CommandRunOptions) => Promise<CommandRunResult>;

export const COMMAND_RUNNERS: Partial<Record<AiCommandName, CommandRunner>> = {};

export function registerRunner(command: AiCommandName, runner: CommandRunner): void {
  COMMAND_RUNNERS[command] = runner;
}

export function getRunner(command: AiCommandName): CommandRunner {
  const runner = COMMAND_RUNNERS[command];
  if (!runner) {
    throw new Error(`No command runner registered for: ${command}`);
  }
  return runner;
}
