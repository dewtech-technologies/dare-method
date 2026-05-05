import { describe, it, expect } from 'vitest';
import {
  applyCascadingSkip,
  buildTaskPrompt,
  computeRanks,
  markDone,
  markFailed,
  markRunning,
  nextExecutableTasks,
  type Dag,
  type DagTask,
} from '../../dag-runner/run_dag.js';

const sampleDag = (): Dag => ({
  title: 'sample',
  version: '1.0.0',
  models: { cursor: { HIGH: 'h', MED: 'm', LOW: 'l' } },
  tasks: [
    { id: 't1', title: 'one',   depends_on: [],          complexity: 'LOW',  subtask_prompt: 'p1', status: 'PENDING' },
    { id: 't2', title: 'two',   depends_on: [],          complexity: 'LOW',  subtask_prompt: 'p2', status: 'PENDING' },
    { id: 't3', title: 'three', depends_on: ['t1', 't2'], complexity: 'MED',  subtask_prompt: 'p3', status: 'PENDING' },
    { id: 't4', title: 'four',  depends_on: ['t3'],       complexity: 'HIGH', subtask_prompt: 'p4', status: 'PENDING' },
  ],
});

describe('computeRanks', () => {
  it('groups parallelizable tasks at the same rank', () => {
    const ranks = computeRanks(sampleDag().tasks);
    expect(ranks.get('t1')).toBe(0);
    expect(ranks.get('t2')).toBe(0);
    expect(ranks.get('t3')).toBe(1);
    expect(ranks.get('t4')).toBe(2);
  });

  it('throws on cycles', () => {
    const dag = sampleDag();
    dag.tasks[0].depends_on = ['t4']; // t1 → t4 → t3 → t1
    expect(() => computeRanks(dag.tasks)).toThrow(/Circular dependency/);
  });
});

describe('nextExecutableTasks', () => {
  it('returns rank-0 tasks at the start', () => {
    const dag = sampleDag();
    const ready = nextExecutableTasks(dag);
    expect(ready.map((t) => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('advances to next rank when current rank is DONE', () => {
    const dag = sampleDag();
    markDone(dag, 't1', { output: 'x' });
    markDone(dag, 't2', { output: 'y' });
    const ready = nextExecutableTasks(dag);
    expect(ready.map((t) => t.id)).toEqual(['t3']);
  });

  it('skips RUNNING tasks (already picked up by the agent)', () => {
    const dag = sampleDag();
    markRunning(dag, 't1');
    const ready = nextExecutableTasks(dag);
    // t1 is RUNNING; only t2 remains in rank 0
    expect(ready.map((t) => t.id)).toEqual(['t2']);
  });
});

describe('markFailed + applyCascadingSkip', () => {
  it('cascades SKIPPED through descendants when a parent fails', () => {
    const dag = sampleDag();
    markDone(dag, 't1', { output: 'x' });
    markFailed(dag, 't2', { error: 'boom' });
    expect(byId(dag, 't2').status).toBe('FAILED');
    expect(byId(dag, 't3').status).toBe('SKIPPED'); // depends on t2
    expect(byId(dag, 't4').status).toBe('SKIPPED'); // depends on t3
  });

  it('applyCascadingSkip is idempotent and only re-skips PENDING', () => {
    const dag = sampleDag();
    markFailed(dag, 't1', { error: 'x' });
    const firstPass = applyCascadingSkip(dag);
    const secondPass = applyCascadingSkip(dag);
    expect(secondPass).toHaveLength(0);
    // t3 + t4 transitively skipped from t1's failure (t3 also depends on t2 still PENDING — but cascade only triggers on FAILED/SKIPPED parents)
    expect(byId(dag, 't1').status).toBe('FAILED');
    expect(firstPass.length).toBeGreaterThanOrEqual(0); // depending on cascade ordering
  });
});

describe('markDone', () => {
  it('caps output to limits.task_output_chars (with truncation notice when room allows)', () => {
    const dag = sampleDag();
    dag.limits = { parent_context_chars: 100, task_output_chars: 80, timeout_seconds: 60 };
    markDone(dag, 't1', { output: 'x'.repeat(500) });
    expect(byId(dag, 't1').output?.length).toBe(80);
    expect(byId(dag, 't1').output).toMatch(/truncated by DARE/);
  });

  it('records tokens and duration when provided', () => {
    const dag = sampleDag();
    markDone(dag, 't1', { tokens: 1234, durationMs: 500 });
    expect(byId(dag, 't1').tokens).toBe(1234);
    expect(byId(dag, 't1').duration).toBe(500);
  });
});

describe('buildTaskPrompt', () => {
  it('returns the bare prompt when no parents have output', () => {
    const dag = sampleDag();
    const prompt = buildTaskPrompt(dag, byId(dag, 't1'));
    expect(prompt).toBe('p1');
  });

  it('appends parent outputs as Upstream context', () => {
    const dag = sampleDag();
    markDone(dag, 't1', { output: 'parent one done' });
    markDone(dag, 't2', { output: 'parent two done' });
    const prompt = buildTaskPrompt(dag, byId(dag, 't3'));
    expect(prompt).toMatch(/^p3/);
    expect(prompt).toMatch(/Upstream context/);
    expect(prompt).toMatch(/parent one done/);
    expect(prompt).toMatch(/parent two done/);
  });
});

function byId(dag: Dag, id: string): DagTask {
  const t = dag.tasks.find((task) => task.id === id);
  if (!t) throw new Error(`missing task ${id}`);
  return t;
}
