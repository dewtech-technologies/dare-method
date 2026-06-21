import type { AgentDriver, AgentRunInput, TokenUsage } from '../driver.js';
import { safeSpawn, type SafeSpawnResult } from '../../exec/safe-spawn.js';

export interface CliDriverOptions {
  readonly command?: string;
  readonly model?: string;
  readonly timeoutSeconds?: number;
}

const DEFAULT_TIMEOUT_SECONDS = 30 * 60;
const DEFAULT_MODEL = 'antigravity-cli';

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

function summarizeStdout(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return 'antigravity run completed';
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  return lines[lines.length - 1] ?? trimmed;
}

function failureSignature(prefix: string, result: SafeSpawnResult): string {
  if (result.timedOut) return `${prefix}Timeout`;
  const body = `${result.stderr}\n${result.stdout}`.trim();
  if (body.includes('spawn error')) return `${prefix}SpawnError`;
  return `${prefix}Exit${result.code}`;
}

export function createAntigravityCliDriver(opts: CliDriverOptions = {}): AgentDriver {
  const command = opts.command ?? process.env['DARE_ANTIGRAVITY_COMMAND'] ?? 'antigravity';
  const model = opts.model?.trim() || DEFAULT_MODEL;
  const timeoutSeconds = opts.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

  return {
    id: 'antigravity',
    requiresNetwork: true,
    async run(input) {
      if (input.signal.aborted) {
        return {
          status: 'aborted',
          worktree: input.worktree,
          summary: 'antigravity aborted by signal',
          usage: zeroUsage(model),
        };
      }

      const argv = ['-p', buildPrompt(input), '--output-format', 'text'];
      if (opts.model?.trim()) argv.push('--model', opts.model.trim());

      const result = await safeSpawn(command, argv, {
        cwd: input.worktree,
        timeoutSeconds,
        maxChars: 200_000,
      });

      if (input.signal.aborted) {
        return {
          status: 'aborted',
          worktree: input.worktree,
          summary: 'antigravity aborted by signal',
          usage: zeroUsage(model),
        };
      }

      if (result.code !== 0) {
        const detail = (result.stderr || result.stdout || 'antigravity run failed').trim();
        return {
          status: 'failed',
          worktree: input.worktree,
          summary: detail.split(/\r?\n/).slice(0, 20).join('\n'),
          usage: zeroUsage(model),
          failureSignature: failureSignature('Antigravity', result),
        };
      }

      return {
        status: 'implemented',
        worktree: input.worktree,
        summary: summarizeStdout(result.stdout),
        usage: zeroUsage(model),
      };
    },
  };
}
