import { describe, it, expect } from 'vitest';
import { renderDot, renderMermaid } from '../graph.js';

describe('graph viz layers', () => {
  const dualNodes = [
    { id: 'requirement:RF-01', type: 'requirement', label: 'RF-01' },
    { id: 'task:t1', type: 'task', label: 'Task' },
    { id: 'file:src/a.ts', type: 'file', label: 'a.ts' },
    { id: 'code_symbol:src/a.ts::fn', type: 'code_symbol', label: 'fn' },
  ];
  const dualEdges = [
    { sourceId: 'task:t1', targetId: 'file:src/a.ts', type: 'implements' },
  ];

  it('mermaid includes requirement and code subgraphs', () => {
    const mmd = renderMermaid(dualNodes, dualEdges);
    expect(mmd).toContain('subgraph requirements [Requirements]');
    expect(mmd).toContain('subgraph code [Code]');
    expect(mmd).toContain('classDef requirement');
    expect(mmd).toContain('classDef code');
  });

  it('legacy graph without new types has no empty subgraphs', () => {
    const legacy = [
      { id: 'concept:c1', type: 'concept', label: 'Concept' },
      { id: 'endpoint:GET:/x', type: 'endpoint', label: 'GET /x' },
    ];
    const mmd = renderMermaid(legacy, []);
    expect(mmd).not.toContain('subgraph requirements');
    expect(mmd).not.toContain('subgraph code');
    expect(mmd).toContain('concept_c1');
  });

  it('dot clusters requirements and code', () => {
    const dot = renderDot(dualNodes, dualEdges);
    expect(dot).toContain('cluster_requirements');
    expect(dot).toContain('cluster_code');
  });
});
