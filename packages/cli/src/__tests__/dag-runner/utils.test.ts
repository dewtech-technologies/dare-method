import { describe, it, expect } from 'vitest';
import { capOutput } from '../../dag-runner/utils/cap-output.js';
import {
  composePrompt,
  stitchParentContext,
} from '../../dag-runner/utils/stitch-context.js';
import {
  TaskAbortedError,
  TaskTimeoutError,
  withTimeout,
} from '../../dag-runner/utils/timeout.js';
import type { DagTask } from '../../dag-runner/run_dag.js';

const makeTask = (over: Partial<DagTask>): DagTask => ({
  id: 't',
  title: 't',
  depends_on: [],
  complexity: 'MED',
  subtask_prompt: '',
  ...over,
});

describe('capOutput', () => {
  it('passes through when below the cap', () => {
    expect(capOutput('hello', 100)).toBe('hello');
  });

  it('truncates with notice when above the cap', () => {
    const out = capOutput('a'.repeat(200), 50);
    expect(out.length).toBe(50);
    expect(out).toMatch(/truncated by DARE/);
  });

  it('returns empty when cap is 0', () => {
    expect(capOutput('anything', 0)).toBe('');
  });
});

describe('stitchParentContext / composePrompt', () => {
  it('returns empty string when no parents', () => {
    const task = makeTask({ id: 'child', subtask_prompt: 'do x' });
    expect(stitchParentContext({ task, parents: [], parentContextChars: 2000 })).toBe('');
  });

  it('appends a tail snippet for each parent capped to N chars', () => {
    const parent = makeTask({ id: 'p1', output: 'A'.repeat(5000) });
    const task = makeTask({ id: 'c', subtask_prompt: 'work' });
    const ctx = stitchParentContext({ task, parents: [parent], parentContextChars: 100 });

    expect(ctx).toMatch(/From parent: p1/);
    // Tail-of-output strategy: ellipsis + 99 chars = 100
    expect(ctx).toMatch(/A{50,}/); // contains a long run of As
    const snippetLine = ctx.split('\n').find((l) => l.startsWith('…')) ?? '';
    expect(snippetLine.length).toBe(100);
  });

  it('composePrompt prepends prompt and appends context', () => {
    const parent = makeTask({ id: 'p', output: 'parent says hi' });
    const task = makeTask({ subtask_prompt: 'go' });
    const out = composePrompt({ task, parents: [parent], parentContextChars: 2000 });
    expect(out.startsWith('go')).toBe(true);
    expect(out).toMatch(/Upstream context/);
    expect(out).toMatch(/parent says hi/);
  });
});

describe('withTimeout', () => {
  it('resolves when the operation finishes in time', async () => {
    const result = await withTimeout(async () => 42, { timeoutSeconds: 5 });
    expect(result).toBe(42);
  });

  it('rejects with TaskTimeoutError when the operation exceeds the budget', async () => {
    await expect(
      withTimeout(
        async ({ signal }) =>
          new Promise<number>((resolve, reject) => {
            const t = setTimeout(() => resolve(1), 500);
            signal.addEventListener('abort', () => {
              clearTimeout(t);
              reject(new Error('ignored — outer rejects first'));
            });
          }),
        // 50ms timeout — way before the 500ms operation finishes
        { timeoutSeconds: 0.05 },
      ),
    ).rejects.toBeInstanceOf(TaskTimeoutError);
  });

  it('rejects with TaskAbortedError when the external signal aborts', async () => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort('user'), 20);
    await expect(
      withTimeout(
        async ({ signal }) =>
          new Promise<number>((resolve) => {
            const t = setTimeout(() => resolve(1), 500);
            signal.addEventListener('abort', () => clearTimeout(t));
          }),
        { timeoutSeconds: 5, externalSignal: ctrl.signal },
      ),
    ).rejects.toBeInstanceOf(TaskAbortedError);
  });
});
