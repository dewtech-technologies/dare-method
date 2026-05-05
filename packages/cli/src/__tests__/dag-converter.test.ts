import { describe, it, expect } from 'vitest';
import { convertYamlToDag, convertDagToYaml } from '../utils/dag-converter.js';
import { DEFAULT_DAG_LIMITS } from '../dag-runner/run_dag.js';

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

// ─────────────────────────────────────────────────────────────────────────────
// Real converter tests (v2.1 schema with limits + per-runner models)
// ─────────────────────────────────────────────────────────────────────────────

describe('convertYamlToDag (v2.1 schema)', () => {
  const v21Yaml = `title: "Sample"
version: "1.0.0"

limits:
  parent_context_chars: 1500
  task_output_chars: 3000
  timeout_seconds: 300

models:
  cursor:      { HIGH: gpt-5.3-codex,     MED: composer-2,       LOW: auto-low }
  claude:      { HIGH: claude-sonnet-4-5, MED: claude-haiku-4,   LOW: claude-haiku-4 }
  antigravity: { HIGH: gemini-2.5-pro,    MED: gemini-2.5-flash, LOW: gemini-2.5-flash }

tasks:
  - id: task-001
    title: "Setup"
    depends_on: []
    complexity: LOW
    spec_file: EXECUTION/task-001.md
    subtask_prompt: |
      Do the setup.
  - id: task-002
    title: "Implement"
    depends_on: [task-001]
    complexity: HIGH
    subtask_prompt: |
      Build the thing.
`;

  it('parses limits block', () => {
    const dag = convertYamlToDag(v21Yaml);
    expect(dag.limits).toEqual({
      parent_context_chars: 1500,
      task_output_chars: 3000,
      timeout_seconds: 300,
    });
  });

  it('parses per-runner models', () => {
    const dag = convertYamlToDag(v21Yaml);
    expect(dag.models.cursor?.HIGH).toBe('gpt-5.3-codex');
    expect(dag.models.claude?.MED).toBe('claude-haiku-4');
    expect(dag.models.antigravity?.LOW).toBe('gemini-2.5-flash');
  });

  it('parses spec_file when present', () => {
    const dag = convertYamlToDag(v21Yaml);
    expect(dag.tasks[0].spec_file).toBe('EXECUTION/task-001.md');
    expect(dag.tasks[1].spec_file).toBeUndefined();
  });

  it('initializes status as PENDING for every task', () => {
    const dag = convertYamlToDag(v21Yaml);
    for (const t of dag.tasks) {
      expect(t.status).toBe('PENDING');
    }
  });
});

describe('convertYamlToDag (legacy flat models)', () => {
  const legacyYaml = `title: "Old"
version: "1.0.0"
models:
  HIGH: "gpt-4"
  MED: "gpt-4o-mini"
  LOW: "gpt-4o-mini"
tasks:
  - id: task-1
    depends_on: []
    complexity: MED
    subtask_prompt: "noop"
`;

  it('replicates flat models under each known runner', () => {
    const dag = convertYamlToDag(legacyYaml);
    expect(dag.models.cursor?.HIGH).toBe('gpt-4');
    expect(dag.models.claude?.MED).toBe('gpt-4o-mini');
    expect(dag.models.antigravity?.LOW).toBe('gpt-4o-mini');
  });

  it('falls back to default limits when block is absent', () => {
    const dag = convertYamlToDag(legacyYaml);
    expect(dag.limits).toEqual(DEFAULT_DAG_LIMITS);
  });
});

describe('convertDagToYaml round-trip', () => {
  it('preserves limits, models and spec_file across YAML → Dag → YAML → Dag', () => {
    const original = `title: "RT"
version: "1.0.0"
limits:
  parent_context_chars: 1234
  task_output_chars: 5678
  timeout_seconds: 90
models:
  cursor:      { HIGH: a, MED: b, LOW: c }
  claude:      { HIGH: d, MED: e, LOW: f }
  antigravity: { HIGH: g, MED: h, LOW: i }
tasks:
  - id: t1
    title: "First"
    depends_on: []
    complexity: HIGH
    spec_file: EXECUTION/t1.md
    subtask_prompt: |
      go.
`;
    const dag1 = convertYamlToDag(original);
    const yaml2 = convertDagToYaml(dag1);
    const dag2 = convertYamlToDag(yaml2);

    expect(dag2.limits).toEqual(dag1.limits);
    expect(dag2.models).toEqual(dag1.models);
    expect(dag2.tasks[0].spec_file).toBe('EXECUTION/t1.md');
    expect(dag2.tasks[0].complexity).toBe('HIGH');
  });
});
