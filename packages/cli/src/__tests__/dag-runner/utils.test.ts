import { describe, it, expect } from 'vitest';
import { capOutput } from '../../dag-runner/utils/cap-output.js';
import {
  composePrompt,
  stitchParentContext,
} from '../../dag-runner/utils/stitch-context.js';
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
