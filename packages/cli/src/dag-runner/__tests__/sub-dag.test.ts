import { describe, it, expect } from 'vitest';
import {
  CycleError,
  MaxDepthError,
  nestingDepth,
  spliceSubDag,
  type DagState,
  type SubTask,
} from '../sub-dag.js';

function makeDag(): DagState {
  return {
    title: 'dynamic',
    version: '1.0.0',
    models: { cursor: { HIGH: 'h', MED: 'm', LOW: 'l' } },
    tasks: [
      {
        id: 'task-root',
        title: 'root',
        depends_on: [],
        complexity: 'LOW',
        subtask_prompt: 'root',
        status: 'PENDING',
      },
      {
        id: 'task-parent',
        title: 'parent',
        depends_on: ['task-root'],
        complexity: 'MED',
        subtask_prompt: 'parent',
        status: 'PENDING',
      },
      {
        id: 'task-tail',
        title: 'tail',
        depends_on: ['task-parent'],
        complexity: 'LOW',
        subtask_prompt: 'tail',
        status: 'PENDING',
      },
    ],
  };
}

function makeSubTasks(parentId: string): ReadonlyArray<SubTask> {
  return [
    {
      id: `${parentId}-a`,
      parentId,
      dependsOn: ['task-root'],
      specPath: `DARE/EXECUTION/${parentId}-a.md`,
    },
    {
      id: `${parentId}-b`,
      parentId,
      dependsOn: [`${parentId}-a`],
      specPath: `DARE/EXECUTION/${parentId}-b.md`,
    },
  ];
}

describe('sub-dag splice', () => {
  it('splices_children_under_parent', () => {
    const dag = makeDag();
    const subTasks = makeSubTasks('task-parent');
    const result = spliceSubDag(dag, 'task-parent', subTasks, 3);

    expect(result.inserted).toEqual(['task-parent-a', 'task-parent-b']);
    const parent = result.dag.tasks.find((task) => task.id === 'task-parent');
    expect(parent?.depends_on).toEqual(['task-root', 'task-parent-a', 'task-parent-b']);

    const childA = result.dag.tasks.find((task) => task.id === 'task-parent-a');
    const childB = result.dag.tasks.find((task) => task.id === 'task-parent-b');
    expect(childA?.spec_file).toBe('DARE/EXECUTION/task-parent-a.md');
    expect(childB?.depends_on).toEqual(['task-parent-a']);
  });

  it('rejects_cycle', () => {
    const dag = makeDag();
    const snapshot = structuredClone(dag);
    const cyclicSubTasks: ReadonlyArray<SubTask> = [
      {
        id: 'task-parent-cycle',
        parentId: 'task-parent',
        dependsOn: ['task-parent'],
        specPath: 'DARE/EXECUTION/task-parent-cycle.md',
      },
    ];

    expect(() => spliceSubDag(dag, 'task-parent', cyclicSubTasks, 3)).toThrowError(CycleError);
    expect(dag).toEqual(snapshot);
  });

  it('rejects_beyond_maxDepth', () => {
    const first = spliceSubDag(makeDag(), 'task-parent', makeSubTasks('task-parent'), 2).dag;
    const nested: ReadonlyArray<SubTask> = [
      {
        id: 'task-parent-a-i',
        parentId: 'task-parent-a',
        dependsOn: ['task-root'],
        specPath: 'DARE/EXECUTION/task-parent-a-i.md',
      },
    ];

    expect(() => spliceSubDag(first, 'task-parent-a', nested, 1)).toThrowError(MaxDepthError);
  });

  it('idempotent_resplice', () => {
    const first = spliceSubDag(makeDag(), 'task-parent', makeSubTasks('task-parent'), 3).dag;
    const sameSetDifferentOrder: ReadonlyArray<SubTask> = [
      {
        id: 'task-parent-b',
        parentId: 'task-parent',
        dependsOn: ['task-parent-a'],
        specPath: 'DARE/EXECUTION/task-parent-b.md',
      },
      {
        id: 'task-parent-a',
        parentId: 'task-parent',
        dependsOn: ['task-root'],
        specPath: 'DARE/EXECUTION/task-parent-a.md',
      },
    ];

    const second = spliceSubDag(first, 'task-parent', sameSetDifferentOrder, 3);
    expect(second.inserted).toEqual([]);
    expect(second.dag).toBe(first);
    expect(second.dag.tasks).toHaveLength(first.tasks.length);
  });

  it('nestingDepth_correct', () => {
    const first = spliceSubDag(makeDag(), 'task-parent', makeSubTasks('task-parent'), 3).dag;
    const second = spliceSubDag(
      first,
      'task-parent-a',
      [
        {
          id: 'task-parent-a-i',
          parentId: 'task-parent-a',
          dependsOn: ['task-root'],
          specPath: 'DARE/EXECUTION/task-parent-a-i.md',
        },
      ],
      3,
    ).dag;

    expect(nestingDepth(second, 'task-parent')).toBe(0);
    expect(nestingDepth(second, 'task-parent-a')).toBe(1);
    expect(nestingDepth(second, 'task-parent-a-i')).toBe(2);
  });
});
