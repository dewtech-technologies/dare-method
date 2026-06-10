import type { AgentDriver, AgentRunInput, TokenUsage } from '../driver.js';

export interface ClaudeDriverOptions {
  readonly model: string;
  readonly apiKeyEnv?: string;
  readonly maxTokens?: number;
}

export class AgentSdkMissingError extends Error {
  readonly code = 'AGENT_SDK_MISSING' as const;

  constructor() {
    super(
      "Optional dependency '@anthropic-ai/sdk' not installed. Run: npm i @anthropic-ai/sdk — or use --dry-run.",
    );
    this.name = 'AgentSdkMissingError';
  }
}

type ClaudeMessageResponse = {
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
  };
  readonly content?: ReadonlyArray<{
    readonly type?: string;
    readonly text?: string;
  }>;
};

type ClaudeClient = {
  readonly messages: {
    create(
      payload: {
        readonly model: string;
        readonly max_tokens: number;
        readonly messages: ReadonlyArray<{ readonly role: 'user'; readonly content: string }>;
      },
      requestOptions?: { readonly signal?: AbortSignal },
    ): Promise<ClaudeMessageResponse>;
  };
};

type ClaudeSdkModule = {
  readonly default: new (options: { readonly apiKey: string }) => ClaudeClient;
};

const DEFAULT_API_KEY_ENV = 'ANTHROPIC_API_KEY';
const DEFAULT_MAX_TOKENS = 1_200;

const MODEL_COST_PER_MILLION: ReadonlyArray<{
  readonly matcher: RegExp;
  readonly inputUsd: number;
  readonly outputUsd: number;
}> = [
  { matcher: /haiku/i, inputUsd: 0.8, outputUsd: 4 },
  { matcher: /sonnet/i, inputUsd: 3, outputUsd: 15 },
  { matcher: /opus/i, inputUsd: 15, outputUsd: 75 },
];

async function importClaudeSdk(): Promise<ClaudeSdkModule> {
  return (await import('@anthropic-ai/sdk')) as unknown as ClaudeSdkModule;
}

let sdkImporter: () => Promise<ClaudeSdkModule> = importClaudeSdk;

export function setClaudeSdkImporterForTests(
  importer: (() => Promise<ClaudeSdkModule>) | null,
): void {
  sdkImporter = importer ?? importClaudeSdk;
}

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing =
    MODEL_COST_PER_MILLION.find((entry) => entry.matcher.test(model)) ?? MODEL_COST_PER_MILLION[1];
  const inputCost = (inputTokens / 1_000_000) * pricing.inputUsd;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputUsd;
  return Number((inputCost + outputCost).toFixed(6));
}

function summarizeContent(response: ClaudeMessageResponse): string {
  const chunks =
    response.content
      ?.filter((chunk) => chunk.type === 'text' && typeof chunk.text === 'string')
      .map((chunk) => chunk.text?.trim() ?? '')
      .filter(Boolean) ?? [];
  return chunks.length > 0 ? chunks.join('\n') : 'claude run completed';
}

function usageFromResponse(model: string, response: ClaudeMessageResponse): TokenUsage {
  const inputTokens = Math.max(0, Math.trunc(response.usage?.input_tokens ?? 0));
  const outputTokens = Math.max(0, Math.trunc(response.usage?.output_tokens ?? 0));
  return {
    inputTokens,
    outputTokens,
    costUsd: estimateCostUsd(model, inputTokens, outputTokens),
    model,
  };
}

function zeroUsage(model: string): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    model,
  };
}

function buildPrompt(input: AgentRunInput): string {
  const steeringList =
    input.steering.length > 0
      ? input.steering
          .map((artifact) => `- ${artifact.path} (${artifact.origin}/${artifact.channel})`)
          .join('\n')
      : '- none';

  return [
    `Task: ${input.taskId}`,
    `Worktree: ${input.worktree}`,
    `Budget remaining tokens: ${input.budgetRemaining}`,
    'Steering artifacts:',
    steeringList,
    '',
    'Specification:',
    input.spec,
  ].join('\n');
}

export async function createClaudeDriver(opts: ClaudeDriverOptions): Promise<AgentDriver> {
  let sdk: ClaudeSdkModule;
  try {
    sdk = await sdkImporter();
  } catch {
    throw new AgentSdkMissingError();
  }

  const apiKeyEnv = opts.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Missing Claude API key in env var ${apiKeyEnv}.`);
  }

  const client = new sdk.default({ apiKey });

  return {
    id: 'claude',
    requiresNetwork: true,
    async run(input) {
      if (input.signal.aborted) {
        return {
          status: 'aborted',
          worktree: input.worktree,
          summary: 'claude aborted by signal',
          usage: zeroUsage(opts.model),
        };
      }

      try {
        const response = await client.messages.create(
          {
            model: opts.model,
            max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
            messages: [
              {
                role: 'user',
                content: buildPrompt(input),
              },
            ],
          },
          { signal: input.signal },
        );

        return {
          status: 'implemented',
          worktree: input.worktree,
          summary: summarizeContent(response),
          usage: usageFromResponse(opts.model, response),
        };
      } catch (error) {
        if (input.signal.aborted) {
          return {
            status: 'aborted',
            worktree: input.worktree,
            summary: 'claude aborted by signal',
            usage: zeroUsage(opts.model),
          };
        }

        return {
          status: 'failed',
          worktree: input.worktree,
          summary: 'claude run failed',
          usage: zeroUsage(opts.model),
          failureSignature: error instanceof Error ? error.name : 'ClaudeRunError',
        };
      }
    },
  };
}
