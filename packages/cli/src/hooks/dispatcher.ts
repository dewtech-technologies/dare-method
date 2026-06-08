import pino from 'pino';
import { safeSpawn } from '../exec/safe-spawn.js';
import {
  resolveAction,
  ActionNotAllowedError,
  INTERNAL_ACTIONS,
} from './allowlist.js';
import type { AllowedActionKey } from './allowlist.js';
import { shouldSkip, markSeen } from './idempotency.js';
import { recordHookTrigger } from './telemetry.js';
import { assertRelativeSafe, PathEscapeError } from '../utils/path-safety.js';
import { HOOK_EVENTS } from './types.js';
import type { HookConfig, HookEventPayload, HookResult, HookEvent } from './types.js';
import {
  gatesFor,
  resolveStackFromConfig,
  formatGateCommand,
} from '../dag-runner/ralph-loop.js';
import { createGraph, loadGraphConfig } from '../graphrag/index.js';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';

const logger = pino({ level: process.env.DARE_HOOKS_LOG_LEVEL ?? 'info' });

export class TrustRequiredError extends Error {
  readonly code = 'TRUST_REQUIRED' as const;
  constructor(message = 'hooks are untrusted for this project') {
    super(message);
    this.name = 'TrustRequiredError';
  }
}

export class InvalidHookEventError extends Error {
  readonly code = 'INVALID_HOOK_EVENT' as const;
  constructor(event: string) {
    super(`Invalid hook event: ${event}`);
    this.name = 'InvalidHookEventError';
  }
}

const TASK_ID_RE = /^task-[0-9a-z-]+$/;

const VERDICT_ACTIONS: ReadonlySet<AllowedActionKey> = new Set([
  'dare-validate',
  'dare-review',
  'lint',
  'test',
]);

function isHookEvent(value: string): value is HookEvent {
  return (HOOK_EVENTS as readonly string[]).includes(value);
}

async function resolveHookStack(
  projectRoot: string,
): Promise<{ lint?: string; test?: string }> {
  try {
    const stack = await resolveStackFromConfig(projectRoot);
    const gates = gatesFor(stack, projectRoot);
    const lintGate = gates.find((g) => g.name === 'lint');
    const testGate = gates.find((g) => g.name === 'test');
    return {
      lint: lintGate ? formatGateCommand(lintGate) : undefined,
      test: testGate ? formatGateCommand(testGate) : undefined,
    };
  } catch {
    return {};
  }
}

async function withProjectGraph<T>(
  projectRoot: string,
  fn: (graph: KnowledgeGraph) => Promise<T>,
): Promise<T> {
  const config = await loadGraphConfig({ cwd: projectRoot });
  const graph = await createGraph(config, { cwd: projectRoot });
  try {
    return await fn(graph);
  } finally {
    await Promise.resolve(graph.close());
  }
}

function verdictFor(
  action: AllowedActionKey,
  exitCode: number,
): 'pass' | 'fail' | undefined {
  if (!VERDICT_ACTIONS.has(action)) return undefined;
  return exitCode === 0 ? 'pass' : 'fail';
}

function isInternalAction(action: AllowedActionKey): boolean {
  return (INTERNAL_ACTIONS as readonly AllowedActionKey[]).includes(action);
}

export async function dispatchHook(
  config: HookConfig,
  payload: HookEventPayload,
  ctx: { projectRoot: string; trustOverride?: boolean },
): Promise<HookResult[]> {
  if (config.trusted !== true && ctx.trustOverride !== true) {
    throw new TrustRequiredError();
  }

  if (!isHookEvent(payload.event)) {
    throw new InvalidHookEventError(String(payload.event));
  }

  if (payload.file) {
    try {
      assertRelativeSafe(payload.file);
    } catch {
      throw new PathEscapeError();
    }
  }
  if (payload.taskId && !TASK_ID_RE.test(payload.taskId)) {
    throw new Error(`Invalid taskId: ${payload.taskId}`);
  }

  const actions = config.on[payload.event] ?? [];
  if (actions.length === 0) {
    return [];
  }

  const stack = await resolveHookStack(ctx.projectRoot);
  const results: HookResult[] = [];

  await withProjectGraph(ctx.projectRoot, async (graph) => {
    for (const hookAction of actions) {
      const action = hookAction.action;
      const start = performance.now();

      if (
        await shouldSkip(payload.event, action, payload, {
          projectRoot: ctx.projectRoot,
        })
      ) {
        const durationMs = Math.round(performance.now() - start);
        results.push({
          event: payload.event,
          action,
          exitCode: 0,
          skipped: true,
          durationMs,
        });
        continue;
      }

      const { cmd, argv } = resolveAction(action, payload, stack);
      const triggeredAt = new Date().toISOString();
      let exitCode = 0;
      let skipped = false;

      if (isInternalAction(action)) {
        recordHookTrigger(graph, {
          event: payload.event,
          action,
          exitCode: 0,
          skipped: false,
          triggeredAt,
        });
      } else {
        const res = await safeSpawn(cmd, [...argv, ...(hookAction.args ?? [])], {
          cwd: ctx.projectRoot,
          timeoutSeconds: 600,
        });
        exitCode = res.code;
        const verdict = verdictFor(action, exitCode);
        recordHookTrigger(graph, {
          event: payload.event,
          action,
          exitCode,
          skipped: false,
          verdict,
          triggeredAt,
        });
      }

      await markSeen(payload.event, action, payload, {
        projectRoot: ctx.projectRoot,
      });

      const durationMs = Math.round(performance.now() - start);
      const verdict = verdictFor(action, exitCode);

      logger.info(
        { event: payload.event, action, exitCode, durationMs, skipped },
        'hook dispatched',
      );

      results.push({
        event: payload.event,
        action,
        exitCode,
        skipped,
        verdict,
        durationMs,
      });
    }
  });

  return results;
}

export { ActionNotAllowedError, PathEscapeError };
