/**
 * Cursor adapter — uses @cursor/sdk to execute a task as a local subagent.
 *
 * Env: CURSOR_API_KEY
 *
 * Compatible with the cookbook DAG Task Runner pattern (Agent.create + send + wait).
 */
import { Agent } from '@cursor/sdk';
import {
  AdapterCallError,
  MissingApiKeyError,
  pickModel,
  type AdapterCallInput,
  type AdapterCallResult,
  type RunnerAdapter,
} from './index.js';

export class CursorAdapter implements RunnerAdapter {
  readonly name = 'cursor' as const;

  async call({ prompt, complexity, models, signal }: AdapterCallInput): Promise<AdapterCallResult> {
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) throw new MissingApiKeyError('cursor', 'CURSOR_API_KEY');

    const model = pickModel(models, complexity);

    let agent: Awaited<ReturnType<typeof Agent.create>> | undefined;
    try {
      agent = await Agent.create({
        apiKey,
        model: { id: model },
        name: 'DARE DAG Subagent',
      });

      const run = await agent.send(prompt);

      const onAbort = (): void => {
        // Best-effort cancel; ignore failures.
        run.cancel().catch(() => undefined);
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });

      const result = await run.wait();
      return { output: result.result ?? '' };
    } catch (err) {
      if (err instanceof MissingApiKeyError) throw err;
      throw new AdapterCallError('cursor', extractErrorMessage(err), err);
    } finally {
      try {
        await agent?.close();
      } catch {
        // ignore close failures — task already completed/failed
      }
    }
  }
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
