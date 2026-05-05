/**
 * Antigravity adapter — uses Google Generative AI (Gemini) to execute a task.
 *
 * Antigravity (Google's IDE) does not expose a public agent SDK at the time
 * of writing, so we drive the underlying Gemini family directly. Models in
 * `dare-dag.yaml`'s `models.antigravity` block (e.g. `gemini-2.5-pro`,
 * `gemini-2.5-flash`) are passed as the model id.
 *
 * Env: ANTIGRAVITY_API_KEY (preferred) or GOOGLE_API_KEY (fallback).
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  AdapterCallError,
  MissingApiKeyError,
  pickModel,
  type AdapterCallInput,
  type AdapterCallResult,
  type RunnerAdapter,
} from './index.js';

const SYSTEM_INSTRUCTION =
  'You are a DARE subagent executing a single task from a DAG. Follow the prompt ' +
  'exactly. When you finish, respond with a concise summary of what you did and the ' +
  'paths of files you created or modified. Keep responses self-contained — your ' +
  'output may be quoted into a downstream task.';

export class AntigravityAdapter implements RunnerAdapter {
  readonly name = 'antigravity' as const;

  async call({ prompt, complexity, models, signal }: AdapterCallInput): Promise<AdapterCallResult> {
    const apiKey = process.env.ANTIGRAVITY_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new MissingApiKeyError('antigravity', 'ANTIGRAVITY_API_KEY');

    const modelId = pickModel(models, complexity);

    try {
      const client = new GoogleGenerativeAI(apiKey);
      const model = client.getGenerativeModel({
        model: modelId,
        systemInstruction: SYSTEM_INSTRUCTION,
      });

      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }, { signal });

      const text = res.response.text();
      const usage = res.response.usageMetadata;
      const tokens = usage
        ? (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0)
        : undefined;

      return { output: text, tokens };
    } catch (err) {
      if (err instanceof MissingApiKeyError) throw err;
      throw new AdapterCallError('antigravity', extractErrorMessage(err), err);
    }
  }
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
