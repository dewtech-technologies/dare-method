/**
 * Claude adapter — calls the Anthropic Messages API to execute a task.
 *
 * Env: ANTHROPIC_API_KEY
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  AdapterCallError,
  MissingApiKeyError,
  pickModel,
  type AdapterCallInput,
  type AdapterCallResult,
  type RunnerAdapter,
} from './index.js';

const SYSTEM_PROMPT =
  'You are a DARE subagent executing a single task from a DAG. Follow the prompt ' +
  'exactly. When you finish, respond with a concise summary of what you did and the ' +
  'paths of files you created or modified. Keep responses self-contained — your ' +
  'output may be quoted into a downstream task.';

export class ClaudeAdapter implements RunnerAdapter {
  readonly name = 'claude' as const;

  async call({ prompt, complexity, models, signal }: AdapterCallInput): Promise<AdapterCallResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new MissingApiKeyError('claude', 'ANTHROPIC_API_KEY');

    const model = pickModel(models, complexity);
    const client = new Anthropic({ apiKey });

    try {
      const res = await client.messages.create(
        {
          model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal },
      );

      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      const tokens = (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);

      return { output: text, tokens };
    } catch (err) {
      if (err instanceof MissingApiKeyError) throw err;
      throw new AdapterCallError('claude', extractErrorMessage(err), err);
    }
  }
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
