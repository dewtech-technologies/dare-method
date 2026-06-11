import { computeRanks, type Dag as DagState, type DagTask } from './run_dag.js';

export type { DagState };

export interface SubTask {
  readonly id: string;
  readonly parentId: string;
  readonly dependsOn: ReadonlyArray<string>;
  readonly specPath: string;
}

export interface SpliceResult {
  readonly inserted: ReadonlyArray<string>;
  readonly dag: DagState;
}

interface DagTaskWithParent extends DagTask {
  __parentId?: string;
}

export class CycleError extends Error {
  readonly code = 'DAG_CYCLE' as const;

  constructor(message = 'Sub-DAG splice would introduce a cycle') {
    super(message);
    this.name = 'CycleError';
  }
}

export class MaxDepthError extends Error {
  readonly code = 'DAG_MAX_DEPTH' as const;

  constructor(message = 'Sub-DAG nesting exceeds configured maxDepth') {
    super(message);
    this.name = 'MaxDepthError';
  }
}

export function spliceSubDag(
  dag: DagState,
  parentId: string,
  subTasks: ReadonlyArray<SubTask>,
  maxDepth: number,
): SpliceResult {
  const parentDepth = nestingDepth(dag, parentId);
  if (parentDepth + 1 > maxDepth) {
    throw new MaxDepthError(
      `Cannot splice under "${parentId}": depth ${parentDepth + 1} exceeds maxDepth ${maxDepth}.`,
    );
  }

  if (subTasks.length === 0) {
    return { inserted: [], dag };
  }

  const parent = requireTask(dag, parentId);
  const desiredIds = uniqueIds(subTasks.map((task) => task.id));
  const desiredHash = hashIdSet(desiredIds);
  const taskIds = new Set(dag.tasks.map((task) => task.id));
  const alreadyLinked = parent.depends_on.filter(
    (depId) => taskIds.has(depId) && desiredIds.includes(depId),
  );
  if (hashIdSet(alreadyLinked) === desiredHash) {
    return { inserted: [], dag };
  }

  const candidate = cloneDag(dag);
  const candidateParent = requireTask(candidate, parentId);
  const candidateTaskIds = new Set(candidate.tasks.map((task) => task.id));
  const inserted: string[] = [];

  for (const subTask of uniqueSubTasks(subTasks)) {
    if (subTask.parentId !== parentId) {
      throw new Error(
        `Sub-task "${subTask.id}" has parentId "${subTask.parentId}", expected "${parentId}".`,
      );
    }
    if (candidateTaskIds.has(subTask.id)) {
      throw new Error(`Sub-task id "${subTask.id}" already exists in DAG.`);
    }

    candidate.tasks.push({
      id: subTask.id,
      title: subTask.id,
      depends_on: [...subTask.dependsOn],
      complexity: candidateParent.complexity,
      subtask_prompt: `Execute ${subTask.id} as part of ${parentId}.`,
      spec_file: subTask.specPath,
      status: 'PENDING',
      __parentId: parentId,
    } as DagTask);
    candidateTaskIds.add(subTask.id);
    inserted.push(subTask.id);
  }

  candidateParent.depends_on = uniqueIds([...candidateParent.depends_on, ...desiredIds]);

  try {
    computeRanks(candidate.tasks);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CycleError(message);
  }

  return { inserted, dag: candidate };
}

export function nestingDepth(dag: DagState, taskId: string): number {
  const byId = new Map(dag.tasks.map((task) => [task.id, task as DagTaskWithParent]));
  const visited = new Set<string>();

  const walk = (id: string): number => {
    const task = byId.get(id);
    if (!task) throw new Error(`Task "${id}" not found in DAG`);
    if (visited.has(id)) throw new Error(`Invalid parent chain detected at "${id}"`);

    if (!task.__parentId) return 0;
    visited.add(id);
    const depth = walk(task.__parentId) + 1;
    visited.delete(id);
    return depth;
  };

  return walk(taskId);
}

function requireTask(dag: DagState, taskId: string): DagTaskWithParent {
  const task = dag.tasks.find((item) => item.id === taskId) as DagTaskWithParent | undefined;
  if (!task) throw new Error(`Task "${taskId}" not found in DAG`);
  return task;
}

function uniqueIds(ids: ReadonlyArray<string>): string[] {
  return [...new Set(ids)];
}

function hashIdSet(ids: ReadonlyArray<string>): string {
  return [...new Set(ids)].sort().join('\u0000');
}

function uniqueSubTasks(subTasks: ReadonlyArray<SubTask>): SubTask[] {
  const byId = new Map<string, SubTask>();
  for (const subTask of subTasks) {
    if (!byId.has(subTask.id)) byId.set(subTask.id, subTask);
  }
  return [...byId.values()];
}

function cloneDag(dag: DagState): DagState {
  return {
    ...dag,
    tasks: dag.tasks.map((task) => {
      const withParent = task as DagTaskWithParent;
      return {
        ...task,
        depends_on: [...task.depends_on],
        __parentId: withParent.__parentId,
      } as DagTask;
    }),
  };
}
