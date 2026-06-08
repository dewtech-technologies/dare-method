import path from 'node:path';
import type { KnowledgeGraph } from './knowledge-graph.js';
import type { PatternsFacts } from '../utils/pattern-detector.js';

function patternNodeId(patternId: string): string {
  return `pattern:${patternId}`;
}

function fileNodeId(file: string): string {
  return `file:${file.replace(/\\/g, '/')}`;
}

function evidencedByEdgeId(patternId: string, file: string): string {
  return `evidenced_by:${patternId}->${file.replace(/\\/g, '/')}`;
}

function exhibitsEdgeId(moduleId: string, patternId: string): string {
  return `exhibits:${moduleId}->${patternId}`;
}

/**
 * Injeta padrões no grafo (RF-03). Determinístico, idempotente (upsert por id).
 */
export function ingestPatterns(
  graph: KnowledgeGraph,
  facts: PatternsFacts,
  _projectRoot: string,
): { nodes: number; edges: number } {
  let nodes = 0;
  let edges = 0;
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();

  for (const p of facts.patterns) {
    const pid = patternNodeId(p.id);
    if (!seenNodes.has(pid)) {
      seenNodes.add(pid);
      nodes += 1;
    }
    graph.addNode({
      id: pid,
      type: 'pattern',
      label: p.description,
      metadata: {
        kind: p.kind,
        frequency: p.frequency,
        coverage: p.coverage,
        marker: p.marker,
      },
    });

    for (const ev of p.evidence) {
      const file = ev.file.replace(/\\/g, '/');
      const fid = fileNodeId(file);
      graph.addNode({
        id: fid,
        type: 'file',
        label: path.posix.basename(file),
        metadata: { path: file },
      });

      const eid = evidencedByEdgeId(p.id, file);
      if (!seenEdges.has(eid)) {
        seenEdges.add(eid);
        edges += 1;
      }
      graph.addEdge({
        id: eid,
        sourceId: pid,
        targetId: fid,
        type: 'evidenced_by',
        metadata: ev.line != null ? { line: ev.line } : undefined,
      });
    }

    for (const moduleId of p.modules) {
      const eid = exhibitsEdgeId(moduleId, p.id);
      if (!seenEdges.has(eid)) {
        seenEdges.add(eid);
        edges += 1;
      }
      graph.addEdge({
        id: eid,
        sourceId: moduleId,
        targetId: pid,
        type: 'exhibits',
      });
    }
  }

  return { nodes, edges };
}
