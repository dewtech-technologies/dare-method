import { describe, it, expect } from 'vitest';
import {
  ALL_EDGE_TYPES,
  ALL_NODE_TYPES,
  emptyEdgesByType,
  emptyNodesByType,
  type CodeSymbolNode,
  type RequirementNode,
  type TraverseOptions,
} from '../types.js';

describe('dual-graph types', () => {
  it('NodeType union includes code_symbol, requirement, pattern and formal-gate', () => {
    expect(ALL_NODE_TYPES).toContain('code_symbol');
    expect(ALL_NODE_TYPES).toContain('requirement');
    expect(ALL_NODE_TYPES).toContain('gate');
    expect(ALL_NODE_TYPES).toContain('pattern');
    expect(ALL_NODE_TYPES).toContain('formal-gate');
  });

  it('EdgeType union includes affects, derives_from, evidenced_by, exhibits and proven_by', () => {
    expect(ALL_EDGE_TYPES).toContain('affects');
    expect(ALL_EDGE_TYPES).toContain('derives_from');
    expect(ALL_EDGE_TYPES).toContain('verified_by');
    expect(ALL_EDGE_TYPES).toContain('evidenced_by');
    expect(ALL_EDGE_TYPES).toContain('exhibits');
    expect(ALL_EDGE_TYPES).toContain('proven_by');
  });

  it('emptyNodesByType initializes every NodeType to 0 without NaN', () => {
    const counts = emptyNodesByType();
    for (const t of ALL_NODE_TYPES) {
      expect(counts[t]).toBe(0);
      expect(Number.isNaN(counts[t])).toBe(false);
    }
  });

  it('emptyEdgesByType initializes every EdgeType to 0 without NaN', () => {
    const counts = emptyEdgesByType();
    for (const t of ALL_EDGE_TYPES) {
      expect(counts[t]).toBe(0);
      expect(Number.isNaN(counts[t])).toBe(false);
    }
  });

  it('CodeSymbolNode and RequirementNode satisfy extended GraphNode shapes', () => {
    const symbol: CodeSymbolNode = {
      id: 'code_symbol:src/math.ts::add',
      type: 'code_symbol',
      label: 'add',
      path: 'src/math.ts',
      symbol: 'add',
      kind: 'function',
      qualifiedName: 'src/math.ts::add',
      line: 1,
    };
    const req: RequirementNode = {
      id: 'requirement:RF-01',
      type: 'requirement',
      label: 'RF-01',
      reqId: 'RF-01',
      source: 'blueprint',
      title: 'Dual graph',
      priority: 'MUST',
    };
    const opts: TraverseOptions = { seedNodeIds: [symbol.id, req.id] };
    expect(opts.seedNodeIds).toHaveLength(2);
  });
});
