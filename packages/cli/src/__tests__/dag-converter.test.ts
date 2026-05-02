import { describe, it, expect } from 'vitest';

// DAG types
interface DAGTask {
  id: string;
  depends_on: string[];
  complexity: 'HIGH' | 'MED' | 'LOW';
  subtask_prompt: string;
}

interface DAGConfig {
  title: string;
  models: { HIGH: string; MED: string; LOW: string };
  tasks: DAGTask[];
}

// Inline DAG validation logic
function validateDAG(dag: DAGConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const taskIds = new Set(dag.tasks.map(t => t.id));

  // Check for duplicate IDs
  if (taskIds.size !== dag.tasks.length) {
    errors.push('Duplicate task IDs found');
  }

  // Check dependencies exist
  for (const task of dag.tasks) {
    for (const dep of task.depends_on) {
      if (!taskIds.has(dep)) {
        errors.push(`Task "${task.id}" depends on unknown task "${dep}"`);
      }
    }
  }

  // Check for cycles (simple DFS)
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(taskId: string): boolean {
    visited.add(taskId);
    inStack.add(taskId);

    const task = dag.tasks.find(t => t.id === taskId);
    if (task) {
      for (const dep of task.depends_on) {
        if (!visited.has(dep)) {
          if (hasCycle(dep)) return true;
        } else if (inStack.has(dep)) {
          return true;
        }
      }
    }

    inStack.delete(taskId);
    return false;
  }

  for (const task of dag.tasks) {
    if (!visited.has(task.id)) {
      if (hasCycle(task.id)) {
        errors.push('Circular dependency detected in DAG');
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// Compute execution ranks (tasks with same rank can run in parallel)
function computeRanks(dag: DAGConfig): Map<string, number> {
  const ranks = new Map<string, number>();

  function getRank(taskId: string): number {
    if (ranks.has(taskId)) return ranks.get(taskId)!;

    const task = dag.tasks.find(t => t.id === taskId);
    if (!task || task.depends_on.length === 0) {
      ranks.set(taskId, 0);
      return 0;
    }

    const maxDepRank = Math.max(...task.depends_on.map(dep => getRank(dep)));
    const rank = maxDepRank + 1;
    ranks.set(taskId, rank);
    return rank;
  }

  for (const task of dag.tasks) {
    getRank(task.id);
  }

  return ranks;
}

describe('DAG Converter', () => {
  const validDAG: DAGConfig = {
    title: 'Test Project',
    models: { HIGH: 'gpt-4', MED: 'gpt-3.5-turbo', LOW: 'gpt-3.5-turbo' },
    tasks: [
      { id: 'task-001', depends_on: [], complexity: 'HIGH', subtask_prompt: 'Setup project' },
      { id: 'task-002', depends_on: [], complexity: 'MED', subtask_prompt: 'Setup database' },
      { id: 'task-003', depends_on: ['task-001', 'task-002'], complexity: 'HIGH', subtask_prompt: 'Implement auth' },
      { id: 'task-004', depends_on: ['task-003'], complexity: 'MED', subtask_prompt: 'Write tests' },
    ],
  };

  describe('validateDAG', () => {
    it('should validate a correct DAG', () => {
      const result = validateDAG(validDAG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect unknown dependencies', () => {
      const invalidDAG: DAGConfig = {
        ...validDAG,
        tasks: [
          { id: 'task-001', depends_on: ['task-999'], complexity: 'HIGH', subtask_prompt: 'Test' },
        ],
      };
      const result = validateDAG(invalidDAG);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('task-999');
    });

    it('should detect circular dependencies', () => {
      const cyclicDAG: DAGConfig = {
        ...validDAG,
        tasks: [
          { id: 'task-001', depends_on: ['task-002'], complexity: 'HIGH', subtask_prompt: 'A' },
          { id: 'task-002', depends_on: ['task-001'], complexity: 'MED', subtask_prompt: 'B' },
        ],
      };
      const result = validateDAG(cyclicDAG);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Circular'))).toBe(true);
    });
  });

  describe('computeRanks', () => {
    it('should assign rank 0 to tasks with no dependencies', () => {
      const ranks = computeRanks(validDAG);
      expect(ranks.get('task-001')).toBe(0);
      expect(ranks.get('task-002')).toBe(0);
    });

    it('should assign rank 1 to tasks that depend on rank-0 tasks', () => {
      const ranks = computeRanks(validDAG);
      expect(ranks.get('task-003')).toBe(1);
    });

    it('should assign rank 2 to tasks that depend on rank-1 tasks', () => {
      const ranks = computeRanks(validDAG);
      expect(ranks.get('task-004')).toBe(2);
    });

    it('should identify parallelizable tasks (same rank)', () => {
      const ranks = computeRanks(validDAG);
      const rank0Tasks = [...ranks.entries()].filter(([, r]) => r === 0).map(([id]) => id);
      expect(rank0Tasks).toContain('task-001');
      expect(rank0Tasks).toContain('task-002');
      expect(rank0Tasks).toHaveLength(2);
    });
  });
});
