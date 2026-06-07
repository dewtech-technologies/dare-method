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
import type { AttemptRecord } from '../verification/types.js';
import type { Dag, DagTask, TaskStatus } from './run_dag.js';

export interface PersistedTaskState {
  status: TaskStatus;
  output?: string;
  error?: string;
  tokens?: number;
  duration?: number;
  attempts?: AttemptRecord[];
}

interface PersistedState {
  version: 1;
  updatedAt: string;
  tasks: Record<string, PersistedTaskState>;
}

export const DEFAULT_STATE_PATH = path.join('.dare', 'state.json');

async function readPersistedState(
  stateFile: string,
): Promise<PersistedState | null> {
  if (!(await fs.pathExists(stateFile))) return null;
  const raw = (await fs.readJson(stateFile)) as unknown;
  return isPersistedState(raw) ? raw : null;
}

function emptyPersistedState(): PersistedState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    tasks: {},
  };
}

/**
 * Read state from disk and merge it into `dag.tasks`. Missing tasks default
 * to PENDING.
 */
export async function loadAndApplyState(dag: Dag, stateFile: string): Promise<void> {
  const data = await readPersistedState(stateFile);
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
  const existing = await readPersistedState(stateFile);
  const tasks: Record<string, PersistedTaskState> = {};
  for (const t of dag.tasks) {
    tasks[t.id] = {
      status: t.status ?? 'PENDING',
      output: t.output,
      error: t.error,
      tokens: t.tokens,
      duration: t.duration,
      attempts: existing?.tasks?.[t.id]?.attempts,
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

/** Return persisted attempts for a task (missing ⇒ []). */
export async function getAttempts(
  cwd: string,
  taskId: string,
  stateFile: string = path.join(cwd, DEFAULT_STATE_PATH),
): Promise<AttemptRecord[]> {
  const data = await readPersistedState(stateFile);
  return data?.tasks?.[taskId]?.attempts ?? [];
}

/** Append an attempt with monotonic `n` and persist to state.json. */
export async function appendAttempt(
  cwd: string,
  taskId: string,
  attempt: Omit<AttemptRecord, 'n'>,
  stateFile: string = path.join(cwd, DEFAULT_STATE_PATH),
): Promise<AttemptRecord> {
  const data = (await readPersistedState(stateFile)) ?? emptyPersistedState();
  const prev = data.tasks[taskId] ?? { status: 'PENDING' as TaskStatus };
  const attempts = [...(prev.attempts ?? [])];
  const record: AttemptRecord = {
    ...attempt,
    n: attempts.length + 1,
  };
  data.tasks[taskId] = {
    ...prev,
    attempts: [...attempts, record],
  };
  data.updatedAt = new Date().toISOString();
  await fs.ensureDir(path.dirname(stateFile));
  await fs.writeJson(stateFile, data, { spaces: 2 });
  return record;
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
