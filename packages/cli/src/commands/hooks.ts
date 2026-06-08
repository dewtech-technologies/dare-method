import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'node:path';
import { HOOK_EVENTS } from '../hooks/types.js';
import type { HookEvent, HookEventPayload } from '../hooks/types.js';
import { parseHookConfig, HookConfigError } from '../hooks/config.js';
import {
  dispatchHook,
  TrustRequiredError,
  InvalidHookEventError,
  PathEscapeError,
} from '../hooks/dispatcher.js';
import { resolveAction, ActionNotAllowedError } from '../hooks/allowlist.js';

const ALLOWED_EVENTS = HOOK_EVENTS.join(', ');

async function loadRawConfig(cwd: string): Promise<unknown> {
  const cfgPath = path.join(cwd, 'dare.config.json');
  if (!(await fs.pathExists(cfgPath))) {
    return {};
  }
  return fs.readJson(cfgPath);
}

function isHookEvent(value: string): value is HookEvent {
  return (HOOK_EVENTS as readonly string[]).includes(value);
}

export const hooksCommand = new Command('hooks')
  .description('Manage and run DARE agent hooks (deterministic, no LLM)');

hooksCommand
  .command('list')
  .description('List configured hooks from dare.config.json')
  .option('--json', 'Emit JSON')
  .action(async (options: { json?: boolean }) => {
    const cwd = process.cwd();
    try {
      const config = parseHookConfig(await loadRawConfig(cwd));

      if (options.json) {
        console.log(JSON.stringify({ hooks: config.on, trusted: config.trusted }));
        return;
      }

      console.log(chalk.blue.bold('\n🪝 Configured hooks\n'));
      const entries = Object.entries(config.on);
      if (entries.length === 0) {
        console.log(chalk.gray('  (none — hooks block absent or empty)'));
      } else {
        for (const [event, actions] of entries) {
          const names = (actions ?? []).map((a) => a.action).join(', ');
          console.log(`  ${event} → [${names}]`);
        }
      }
      console.log(chalk.gray(`\n  trusted: ${config.trusted}`));
      console.log();
    } catch (err) {
      if (err instanceof HookConfigError) {
        console.error(err.message);
        process.exit(2);
      }
      throw err;
    }
  });

hooksCommand
  .command('run <event>')
  .description('Run hooks for an event')
  .option('--file <path>', 'Relative file path (on-save / on-file-create)')
  .option('--task <taskId>', 'Task id (on-task-complete)')
  .option('--trust', 'Override hooks.trusted for this run')
  .option('--json', 'Emit JSON results')
  .action(
    async (
      event: string,
      options: { file?: string; task?: string; trust?: boolean; json?: boolean },
    ) => {
      const cwd = process.cwd();

      if (!isHookEvent(event)) {
        console.error(
          `Error: unknown hook event '${event}'. Allowed: ${ALLOWED_EVENTS}`,
        );
        process.exit(2);
      }

      try {
        const config = parseHookConfig(await loadRawConfig(cwd));

        if (config.trusted !== true && !options.trust) {
          console.error(
            'Error: hooks are untrusted for this project. Review dare.config.json#hooks and re-run with --trust or set hooks.trusted: true',
          );
          process.exit(2);
        }

        const payload: HookEventPayload = {
          event,
          ...(options.file ? { file: options.file } : {}),
          ...(options.task ? { taskId: options.task } : {}),
        };

        const results = await dispatchHook(config, payload, {
          projectRoot: cwd,
          trustOverride: options.trust,
        });

        if (options.json) {
          console.log(JSON.stringify(results));
        } else {
          for (const r of results) {
            const status = r.skipped
              ? chalk.gray('skipped')
              : r.exitCode === 0
                ? chalk.green('ok')
                : chalk.red(`exit ${r.exitCode}`);
            console.log(`  ${r.event} → ${r.action}: ${status}`);
          }
        }

        const failed = results.some((r) => !r.skipped && r.exitCode !== 0);
        process.exit(failed ? 1 : 0);
      } catch (err) {
        if (err instanceof HookConfigError || err instanceof TrustRequiredError) {
          console.error(err.message);
          process.exit(2);
        }
        if (err instanceof InvalidHookEventError) {
          console.error(
            `Error: unknown hook event '${event}'. Allowed: ${ALLOWED_EVENTS}`,
          );
          process.exit(2);
        }
        if (err instanceof PathEscapeError) {
          console.error('Error: path must be relative and stay within the project');
          process.exit(1);
        }
        throw err;
      }
    },
  );

hooksCommand
  .command('validate')
  .description('Validate hooks config schema and allowlist')
  .option('--json', 'Emit JSON')
  .action(async (options: { json?: boolean }) => {
    const cwd = process.cwd();
    const errors: string[] = [];

    try {
      const config = parseHookConfig(await loadRawConfig(cwd));

      for (const [event, actions] of Object.entries(config.on)) {
        for (const hookAction of actions ?? []) {
          try {
            resolveAction(
              hookAction.action,
              { event: event as HookEvent },
              {},
            );
          } catch (err) {
            if (err instanceof ActionNotAllowedError) {
              errors.push(err.message);
            } else {
              errors.push(err instanceof Error ? err.message : String(err));
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof HookConfigError) {
        errors.push(err.message);
      } else {
        throw err;
      }
    }

    const valid = errors.length === 0;

    if (options.json) {
      console.log(JSON.stringify({ valid, errors }));
    } else if (valid) {
      console.log(chalk.green('✓ hooks config is valid'));
    } else {
      for (const e of errors) {
        console.error(chalk.red(`✗ ${e}`));
      }
    }

    process.exit(valid ? 0 : 1);
  });
