/**
 * Runner adapters — execute a single DAG task by calling the underlying
 * provider SDK (Anthropic, Cursor, Google).
 *
 * Each adapter must:
 *   - read its API key from the documented env var (or throw a clear error)
 *   - honor the AbortSignal forwarded by `withTimeout`
 *   - return raw text output (capping is the runner's responsibility)
 *   - report token usage when the SDK exposes it
 */
import type { Complexity, DagModelMap, RunnerName } from '../run_dag.js';

export interface AdapterCallInput {
  prompt: string;
  complexity: Complexity;
  models: DagModelMap;
  signal: AbortSignal;
}

export interface AdapterCallResult {
  output: string;
  tokens?: number;
}

export interface RunnerAdapter {
  readonly name: RunnerName;
  call(input: AdapterCallInput): Promise<AdapterCallResult>;
}

export class MissingApiKeyError extends Error {
  constructor(public readonly runner: RunnerName, public readonly envVar: string) {
    super(
      `${runner} runner requires ${envVar} to be set. ` +
        `Export it before running: setx ${envVar} <your-key>  (Windows)  or  export ${envVar}=<your-key>  (bash).`,
    );
    this.name = 'MissingApiKeyError';
  }
}

export class AdapterCallError extends Error {
  constructor(public readonly runner: RunnerName, message: string, public readonly cause?: unknown) {
    super(`${runner} adapter: ${message}`);
    this.name = 'AdapterCallError';
  }
}

/**
 * Resolve a model id from complexity → model map, with a soft fallback.
 */
export function pickModel(models: DagModelMap | undefined, complexity: Complexity): string {
  if (!models) {
    throw new Error(`No model mapping configured for complexity=${complexity}`);
  }
  const id = models[complexity];
  if (!id) {
    throw new Error(`Missing model for complexity=${complexity} in dare-dag.yaml`);
  }
  return id;
}

/**
 * Lazy factory — keeps SDK imports out of the require graph until the
 * specific adapter is actually invoked. Avoids loading three SDKs when only
 * one is in use.
 */
export async function getAdapter(name: RunnerName): Promise<RunnerAdapter> {
  switch (name) {
    case 'claude': {
      const { ClaudeAdapter } = await import('./claude.js');
      return new ClaudeAdapter();
    }
    case 'cursor': {
      const { CursorAdapter } = await import('./cursor.js');
      return new CursorAdapter();
    }
    case 'antigravity': {
      const { AntigravityAdapter } = await import('./antigravity.js');
      return new AntigravityAdapter();
    }
    default: {
      throw new Error(`Unknown runner: ${name as string}`);
    }
  }
}
