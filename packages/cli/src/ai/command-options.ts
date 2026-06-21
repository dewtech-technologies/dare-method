import type { Command } from 'commander';
import type { AiCommandOptions } from './types.js';

/** Shared CLI flags for heuristic + AI enrichment on DARE commands. */
export function addAiOptions(cmd: Command): Command {
  return cmd
    .option('--ai', 'Run terminal AI enrichment after deterministic heuristics', false)
    .option(
      '--provider <name>',
      'AI provider override (codex, claude-code, cursor-cli, antigravity-cli, mock)',
    );
}

export function aiOptionsFromFlags(flags: AiCommandOptions): {
  enabled: boolean;
  provider?: string;
} {
  return {
    enabled: Boolean(flags.ai),
    provider: flags.provider?.trim() || undefined,
  };
}
