import type { AgentDriver, AgentRunInput, TokenUsage } from '../driver.js';
import { safeSpawn, type SafeSpawnResult } from '../../exec/safe-spawn.js';

export type CodexSandbox = 'read-only' | 'workspace-write' | 'danger-full-access';
export type CodexApproval = 'untrusted' | 'on-request' | 'never';

export interface CodexCliDriverOptions {
  readonly command?: string;
  readonly model?: string;
  readonly sandbox?: CodexSandbox;
  readonly approval?: CodexApproval;
  readonly timeoutSeconds?: number;
}

const DEFAULT_COMMAND = 'codex';
const DEFAULT_SANDBOX: CodexSandbox = 'workspace-write';
const DEFAULT_APPROVAL: CodexApproval = 'never';
const DEFAULT_TIMEOUT_SECONDS = 30 * 60;
const DEFAULT_MODEL = 'codex-cli';

interface CodexJsonEvent {
  readonly type?: string;
  readonly item?: {
    readonly type?: string;
    readonly text?: string;
  };
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
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
    'You are running inside a DARE agent candidate worktree.',
    'Implement the task directly in this worktree. Make the smallest faithful change.',
    'If blocked, explain the blocker and do not fabricate completed work.',
    '',
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

function parseJsonEvents(stdout: string, model: string): { summary: string; usage: TokenUsage } {
  let summary = '';
  let usage = zeroUsage(model);

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: CodexJsonEvent;
    try {
      event = JSON.parse(trimmed) as CodexJsonEvent;
    } catch {
      continue;
    }

    if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      summary = event.item.text?.trim() ?? summary;
    }

    if (event.type === 'turn.completed' && event.usage) {
      usage = {
        inputTokens: Math.max(0, Math.trunc(event.usage.input_tokens ?? 0)),
        outputTokens: Math.max(0, Math.trunc(event.usage.output_tokens ?? 0)),
        costUsd: 0,
        model,
      };
    }
  }

  return {
    summary: summary || 'codex run completed',
    usage,
  };
}

function failureSignature(result: SafeSpawnResult): string {
  if (result.timedOut) return 'CodexTimeout';
  const body = `${result.stderr}\n${result.stdout}`.trim();
  if (body.includes('spawn error')) return 'CodexSpawnError';
  return `CodexExit${result.code}`;
}

export function createCodexCliDriver(opts: CodexCliDriverOptions = {}): AgentDriver {
  const command = opts.command ?? process.env['DARE_CODEX_COMMAND'] ?? DEFAULT_COMMAND;
  const model = opts.model?.trim() || DEFAULT_MODEL;
  const sandbox = opts.sandbox ?? DEFAULT_SANDBOX;
  const approval = opts.approval ?? DEFAULT_APPROVAL;
  const timeoutSeconds = opts.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

  return {
    id: 'codex',
    requiresNetwork: true,
    async run(input) {
      if (input.signal.aborted) {
        return {
          status: 'aborted',
          worktree: input.worktree,
          summary: 'codex aborted by signal',
          usage: zeroUsage(model),
        };
      }

      const argv = [
        'exec',
        '--json',
        '--sandbox',
        sandbox,
        '--ask-for-approval',
        approval,
      ];
      if (opts.model?.trim()) argv.push('--model', opts.model.trim());
      argv.push(buildPrompt(input));

      const result = await safeSpawn(command, argv, {
        cwd: input.worktree,
        timeoutSeconds,
        maxChars: 200_000,
      });

      if (input.signal.aborted) {
        return {
          status: 'aborted',
          worktree: input.worktree,
          summary: 'codex aborted by signal',
          usage: zeroUsage(model),
        };
      }

      const parsed = parseJsonEvents(result.stdout, model);
      if (result.code !== 0) {
        const detail = (result.stderr || result.stdout || 'codex run failed').trim();
        return {
          status: 'failed',
          worktree: input.worktree,
          summary: detail.split(/\r?\n/).slice(0, 20).join('\n'),
          usage: parsed.usage,
          failureSignature: failureSignature(result),
        };
      }

      return {
        status: 'implemented',
        worktree: input.worktree,
        summary: parsed.summary,
        usage: parsed.usage,
      };
    },
  };
}
