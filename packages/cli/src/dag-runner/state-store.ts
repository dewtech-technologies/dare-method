/**
 * Runtime state store for the DAG.
 *
 * `dare-dag.yaml` stays the canonical spec (id / depends_on / complexity /
 * subtask_prompt / spec_file). Per-task runtime fields — status, output,
 * error, tokens, duration — live in a separate JSON file so that:
 *   - the YAML stays diff-friendly and reviewable
 *   - the state file can be gitignored (`.dare/`)
 *   - CLI invocations can rehydrate the in-memory DAG between commands
 */
import path from 'path';
import fs from 'fs-extra';
import type { Dag, DagTask, TaskStatus } from './run_dag.js';

interface PersistedTaskState {
  status: TaskStatus;
  output?: string;
  error?: string;
  tokens?: number;
  duration?: number;
}

interface PersistedState {
  version: 1;
  updatedAt: string;
  tasks: Record<string, PersistedTaskState>;
}

export const DEFAULT_STATE_PATH = path.join('.dare', 'state.json');

/**
 * Read state from disk and merge it into `dag.tasks`. Missing tasks default
 * to PENDING.
 */
export async function loadAndApplyState(dag: Dag, stateFile: string): Promise<void> {
  const exists = await fs.pathExists(stateFile);
  if (!exists) {
    for (const task of dag.tasks) task.status = task.status ?? 'PENDING';
    return;
  }
  const raw = (await fs.readJson(stateFile)) as PersistedState | unknown;
  const data = isPersistedState(raw) ? raw : null;
  for (const task of dag.tasks) {
    const persisted = data?.tasks?.[task.id];
    if (persisted) {
      task.status = persisted.status;
      task.output = persisted.output;
      task.error = persisted.error;
      task.tokens = persisted.tokens;
      task.duration = persisted.duration;
    } else {
      task.status = task.status ?? 'PENDING';
    }
  }
}

/**
 * Write the current `dag` runtime state to disk.
 */
export async function saveState(dag: Dag, stateFile: string): Promise<void> {
  const tasks: Record<string, PersistedTaskState> = {};
  for (const t of dag.tasks) {
    tasks[t.id] = {
      status: t.status ?? 'PENDING',
      output: t.output,
      error: t.error,
      tokens: t.tokens,
      duration: t.duration,
    };
  }
  const payload: PersistedState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    tasks,
  };
  await fs.ensureDir(path.dirname(stateFile));
  await fs.writeJson(stateFile, payload, { spaces: 2 });
}

function isPersistedState(value: unknown): value is PersistedState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tasks' in value &&
    typeof (value as { tasks: unknown }).tasks === 'object'
  );
}

export type { DagTask };
