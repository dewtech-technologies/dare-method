import { describe, it, expect } from 'vitest';
import { renderDagExcalidraw, serializeExcalidraw } from './excalidraw-renderer.js';
import type { Dag } from '../dag-runner/run_dag.js';

describe('ExcalidrawRenderer', () => {
  const mockDag: Dag = {
    title: 'Test DAG',
    version: '1.0.0',
    models: {},
    tasks: [
      {
        id: 'task-001',
        title: 'Setup',
        complexity: 'LOW',
        depends_on: [],
        status: 'DONE',
        subtask_prompt: 'Setup task',
      },
      {
        id: 'task-002',
        title: 'Build',
        complexity: 'MED',
        depends_on: ['task-001'],
        status: 'RUNNING',
        subtask_prompt: 'Build task',
      },
      {
        id: 'task-003',
        title: 'Test',
        complexity: 'HIGH',
        depends_on: ['task-002'],
        status: 'PENDING',
        subtask_prompt: 'Test task',
      },
    ],
  };

  it('renders DAG to Excalidraw JSON', () => {
    const data = renderDagExcalidraw(mockDag);

    expect(data.type).toBe('excalidraw');
    expect(data.version).toBe(2);
    expect(data.source).toBe('dare-dag-viz');
    expect(data.elements).toHaveLength(5); // 3 tasks + 2 arrows
  });

  it('creates rectangle elements for tasks', () => {
    const data = renderDagExcalidraw(mockDag);
    const taskElements = data.elements.filter((e) => e.type === 'rectangle');

    expect(taskElements).toHaveLength(3);
    expect(taskElements[0].id).toBe('task-001');
    expect(taskElements[0].width).toBe(120);
    expect(taskElements[0].height).toBe(60);
  });

  it('applies correct colors by complexity when PENDING', () => {
    const data = renderDagExcalidraw(mockDag);
    const task003 = data.elements.find((e) => e.id === 'task-003');

    // PENDING + HIGH complexity should use HIGH complexity colors
    expect(task003?.backgroundColor).toBe('#fce4ec'); // HIGH pink
    expect(task003?.strokeColor).toBe('#c2185b');
  });

  it('applies correct colors by status when not PENDING', () => {
    const data = renderDagExcalidraw(mockDag);

    const task001 = data.elements.find((e) => e.id === 'task-001');
    expect(task001?.backgroundColor).toBe('#e8f5e9'); // DONE green
    expect(task001?.strokeColor).toBe('#388e3c');

    const task002 = data.elements.find((e) => e.id === 'task-002');
    expect(task002?.backgroundColor).toBe('#e3f2fd'); // RUNNING blue
    expect(task002?.strokeColor).toBe('#1976d2');
    expect(task002?.strokeStyle).toBe('dashed'); // RUNNING is dashed
  });

  it('creates arrow elements for dependencies', () => {
    const data = renderDagExcalidraw(mockDag);
    const arrows = data.elements.filter((e) => e.type === 'arrow');

    expect(arrows).toHaveLength(2);
    expect(arrows[0].startBinding?.elementId).toBe('task-001');
    expect(arrows[0].endBinding?.elementId).toBe('task-002');
    expect(arrows[1].startBinding?.elementId).toBe('task-002');
    expect(arrows[1].endBinding?.elementId).toBe('task-003');
  });

  it('positions tasks correctly by rank', () => {
    const data = renderDagExcalidraw(mockDag);

    const task001 = data.elements.find((e) => e.id === 'task-001') as any;
    const task002 = data.elements.find((e) => e.id === 'task-002') as any;
    const task003 = data.elements.find((e) => e.id === 'task-003') as any;

    // Rank 1: y = 20 + (1-1) * 160 = 20
    expect(task001?.y).toBe(20);

    // Rank 2: y = 20 + (2-1) * 160 = 180
    expect(task002?.y).toBe(180);

    // Rank 3: y = 20 + (3-1) * 160 = 340
    expect(task003?.y).toBe(340);
  });

  it('serializes to valid JSON', () => {
    const data = renderDagExcalidraw(mockDag);
    const json = serializeExcalidraw(data);

    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe('excalidraw');
    expect(parsed.elements).toHaveLength(5);
  });

  it('includes task title and complexity in text', () => {
    const data = renderDagExcalidraw(mockDag);
    const task001 = data.elements.find((e) => e.id === 'task-001') as any;

    expect(task001?.text).toContain('task-001');
    expect(task001?.text).toContain('Setup');
    expect(task001?.text).toContain('[LOW]');
  });

  it('handles parallel tasks (same rank)', () => {
    const parallelDag: Dag = {
      title: 'Parallel DAG',
      version: '1.0.0',
      models: {},
      tasks: [
        {
          id: 'task-a',
          title: 'Task A',
          complexity: 'LOW',
          depends_on: [],
          status: 'PENDING',
          subtask_prompt: '',
        },
        {
          id: 'task-b',
          title: 'Task B',
          complexity: 'LOW',
          depends_on: [],
          status: 'PENDING',
          subtask_prompt: '',
        },
      ],
    };

    const data = renderDagExcalidraw(parallelDag);
    const taskA = data.elements.find((e) => e.id === 'task-a') as any;
    const taskB = data.elements.find((e) => e.id === 'task-b') as any;

    // Both should be at same Y (rank 1), different X
    expect(taskA?.y).toBe(taskB?.y);
    expect(taskA?.x).not.toBe(taskB?.x);
  });
});
