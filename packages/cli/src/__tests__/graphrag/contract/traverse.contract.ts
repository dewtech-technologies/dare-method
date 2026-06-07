import type { KnowledgeGraph } from '../../../graphrag/knowledge-graph.js';

export interface TraverseContractResult {
  traverseNodeIds: string[];
  locateIds: string[];
  locateScores: number[];
}

export function populateContractFixture(graph: KnowledgeGraph): void {
  graph.addNode({ id: 'requirement:RF-01', type: 'requirement', label: 'Root req' });
  graph.addNode({ id: 'requirement:RF-02', type: 'requirement', label: 'Child req' });
  graph.addNode({ id: 'task:task-101', type: 'task', label: 'Implement' });
  graph.addNode({ id: 'file:src/a.ts', type: 'file', label: 'a.ts', metadata: { path: 'src/a.ts' } });
  graph.addNode({
    id: 'code_symbol:src/a.ts::fn',
    type: 'code_symbol',
    label: 'fn',
    metadata: { qualifiedName: 'src/a.ts::fn', path: 'src/a.ts', symbol: 'fn', kind: 'function' },
  });

  graph.addEdge({
    id: 'e-derives',
    sourceId: 'requirement:RF-02',
    targetId: 'requirement:RF-01',
    type: 'derives_from',
  });
  graph.addEdge({
    id: 'e-depends',
    sourceId: 'task:task-101',
    targetId: 'requirement:RF-02',
    type: 'depends_on',
  });
  graph.addEdge({
    id: 'e-impl',
    sourceId: 'task:task-101',
    targetId: 'code_symbol:src/a.ts::fn',
    type: 'implements',
  });
  graph.addEdge({
    id: 'e-contains',
    sourceId: 'file:src/a.ts',
    targetId: 'code_symbol:src/a.ts::fn',
    type: 'contains',
  });
}

export async function runTraverseContract(
  makeGraph: () => Promise<KnowledgeGraph>,
): Promise<TraverseContractResult> {
  const graph = await makeGraph();
  try {
    populateContractFixture(graph);
    const walked = graph.traverse({
      seedNodeIds: ['requirement:RF-02'],
      maxHops: 3,
      edgeTypes: ['derives_from', 'depends_on', 'implements'],
      direction: 'both',
    });
    const located = graph.locate('src/a.ts::fn', { hops: 2, limit: 5 });
    return {
      traverseNodeIds: walked.nodes.map((n) => n.id).sort(),
      locateIds: located.candidates.map((c) => c.node.id),
      locateScores: located.candidates.map((c) => c.score),
    };
  } finally {
    await Promise.resolve(graph.close());
  }
}
