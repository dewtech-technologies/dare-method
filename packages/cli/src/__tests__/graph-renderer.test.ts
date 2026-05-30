import { describe, it, expect } from 'vitest';
import {
  computeRanks,
  renderGraphMermaid,
  renderGraphDot,
  renderGraphExcalidraw,
  sanitizeId,
  type GraphNode,
} from '../utils/graph-renderer.js';

const nodes = (): GraphNode[] => [
  { id: 'a', depends_on: [], labelLines: ['A', 'small'], bg: '#e3f2fd', stroke: '#1976d2' },
  { id: 'b', depends_on: [], labelLines: ['B'], bg: '#fff3e0', stroke: '#e65100' },
  { id: 'c', depends_on: ['a', 'b'], labelLines: ['C'], bg: '#fce4ec', stroke: '#c2185b' },
];

describe('computeRanks', () => {
  it('assigns rank 0 to roots and max(parent)+1 otherwise', () => {
    const ranks = computeRanks(nodes());
    expect(ranks.get('a')).toBe(0);
    expect(ranks.get('b')).toBe(0);
    expect(ranks.get('c')).toBe(1);
  });

  it('throws on circular dependencies', () => {
    const cyclic: GraphNode[] = [
      { id: 'x', depends_on: ['y'], labelLines: ['X'], bg: '', stroke: '' },
      { id: 'y', depends_on: ['x'], labelLines: ['Y'], bg: '', stroke: '' },
    ];
    expect(() => computeRanks(cyclic)).toThrow(/Circular/);
  });

  it('treats unknown dependency targets as rank-0 anchors (no crash)', () => {
    const dangling: GraphNode[] = [
      { id: 'a', depends_on: ['ghost'], labelLines: ['A'], bg: '', stroke: '' },
    ];
    const ranks = computeRanks(dangling);
    expect(ranks.get('a')).toBe(1);
  });
});

describe('renderGraphMermaid', () => {
  it('emits a graph LR with rank subgraphs and edges', () => {
    const out = renderGraphMermaid(nodes(), { headerComment: 'X', styling: 'inline' });
    expect(out).toMatch(/^graph LR/m);
    expect(out).toMatch(/subgraph rank_0/);
    expect(out).toMatch(/subgraph rank_1/);
    expect(out).toMatch(/a --> c/);
    expect(out).toMatch(/b --> c/);
  });

  it('inline styling emits per-node style directives', () => {
    const out = renderGraphMermaid(nodes(), { headerComment: 'X', styling: 'inline' });
    expect(out).toMatch(/style a fill:#e3f2fd,stroke:#1976d2;/);
    expect(out).not.toMatch(/classDef/);
  });

  it('class styling emits class assignments + classDefs', () => {
    const classNodes: GraphNode[] = [
      { id: 'a', depends_on: [], labelLines: ['A'], bg: '', stroke: '', mermaidClass: 'st_done' },
    ];
    const out = renderGraphMermaid(classNodes, {
      headerComment: 'X',
      styling: 'class',
      classDefs: ['classDef st_done fill:#dcfce7;'],
    });
    expect(out).toMatch(/class a st_done;/);
    expect(out).toMatch(/classDef st_done/);
  });
});

describe('renderGraphDot', () => {
  it('emits a digraph with rankdir and edges', () => {
    const out = renderGraphDot(nodes(), { name: 'G' });
    expect(out).toMatch(/^digraph G/);
    expect(out).toMatch(/rankdir=LR/);
    expect(out).toMatch(/"a" -> "c"/);
    expect(out).toMatch(/fillcolor="#e3f2fd"/);
  });
});

describe('renderGraphExcalidraw', () => {
  it('renders rectangles + arrows with the given source', () => {
    const data = renderGraphExcalidraw(nodes(), { source: 'dare-reverse' });
    expect(data.source).toBe('dare-reverse');
    expect(data.elements.filter((e) => e.type === 'rectangle')).toHaveLength(3);
    expect(data.elements.filter((e) => e.type === 'arrow')).toHaveLength(2);
    const a = data.elements.find((e) => e.id === 'a');
    expect(a?.backgroundColor).toBe('#e3f2fd');
    expect(a?.y).toBe(20); // rank 0
    const c = data.elements.find((e) => e.id === 'c');
    expect(c?.y).toBe(180); // rank 1
  });
});

describe('sanitizeId', () => {
  it('replaces non-word characters with underscores', () => {
    expect(sanitizeId('packages-alpha')).toBe('packages_alpha');
    expect(sanitizeId('src/auth')).toBe('src_auth');
  });
});
