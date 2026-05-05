import { describe, it, expect } from 'vitest';
import { renderDagMermaid, renderDagDot } from '../../commands/dag.js';
import type { Dag } from '../../dag-runner/run_dag.js';

const sampleDag = (): Dag => ({
  title: 'Sample',
  version: '1.0.0',
  models: { cursor: { HIGH: 'h', MED: 'm', LOW: 'l' } },
  tasks: [
    { id: 'task-001', title: 'Setup',   depends_on: [],          complexity: 'LOW', subtask_prompt: 'go', status: 'DONE' },
    { id: 'task-002', title: 'DB',      depends_on: [],          complexity: 'MED', subtask_prompt: 'go', status: 'PENDING' },
    { id: 'task-003', title: 'API',     depends_on: ['task-001', 'task-002'], complexity: 'HIGH', subtask_prompt: 'go', status: 'FAILED' },
    { id: 'task-004', title: 'Tests',   depends_on: ['task-003'], complexity: 'MED', subtask_prompt: 'go', status: 'SKIPPED' },
  ],
});

describe('renderDagMermaid', () => {
  it('emits a graph LR diagram', () => {
    const out = renderDagMermaid(sampleDag());
    expect(out).toMatch(/^graph LR/m);
  });

  it('groups tasks into rank subgraphs', () => {
    const out = renderDagMermaid(sampleDag());
    expect(out).toMatch(/subgraph rank_0/);
    expect(out).toMatch(/subgraph rank_1/);
    expect(out).toMatch(/subgraph rank_2/);
  });

  it('emits one edge per dependency', () => {
    const out = renderDagMermaid(sampleDag());
    expect(out).toMatch(/task_001 --> task_003/);
    expect(out).toMatch(/task_002 --> task_003/);
    expect(out).toMatch(/task_003 --> task_004/);
  });

  it('applies status classes', () => {
    const out = renderDagMermaid(sampleDag());
    expect(out).toMatch(/class task_001 st_done/);
    expect(out).toMatch(/class task_002 st_pending/);
    expect(out).toMatch(/class task_003 st_failed/);
    expect(out).toMatch(/class task_004 st_skipped/);
    // classDef definitions present
    expect(out).toMatch(/classDef st_done/);
    expect(out).toMatch(/classDef st_failed/);
  });

  it('shows status icons in node labels', () => {
    const out = renderDagMermaid(sampleDag());
    expect(out).toContain('✅ DONE');
    expect(out).toContain('⏳ PENDING');
    expect(out).toContain('❌ FAILED');
    expect(out).toContain('⏭️ SKIPPED');
  });
});

describe('renderDagDot', () => {
  it('emits a digraph with rankdir=LR', () => {
    const out = renderDagDot(sampleDag());
    expect(out).toMatch(/^digraph DareDAG/);
    expect(out).toMatch(/rankdir=LR/);
  });

  it('emits one labelled node per task', () => {
    const out = renderDagDot(sampleDag());
    expect(out).toMatch(/"task-001".*Setup/);
    expect(out).toMatch(/"task-003".*API/);
  });

  it('emits one edge per dependency using arrow syntax', () => {
    const out = renderDagDot(sampleDag());
    expect(out).toMatch(/"task-001" -> "task-003"/);
    expect(out).toMatch(/"task-002" -> "task-003"/);
    expect(out).toMatch(/"task-003" -> "task-004"/);
  });

  it('colors fillcolor by status', () => {
    const out = renderDagDot(sampleDag());
    expect(out).toMatch(/fillcolor="#dcfce7"/); // done
    expect(out).toMatch(/fillcolor="#fee2e2"/); // failed
  });
});
