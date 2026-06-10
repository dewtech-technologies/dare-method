import type { KnowledgeGraph, GraphEdge, GraphNode } from './knowledge-graph.js';

export type DriftKind = 'orphan-requirement' | 'orphan-code' | 'stale';

export interface DriftFinding {
  readonly kind: DriftKind;
  readonly nodeId: string;
  readonly label: string;
  readonly detail: string;
}

export interface DriftReport {
  readonly findings: ReadonlyArray<DriftFinding>;
  readonly counts: Record<DriftKind, number>;
  readonly staleIndeterminate: number;
}

export interface DriftConfig {
  readonly enabled: boolean;
  readonly maxOrphanReqs: number;
  readonly maxOrphanCode: number;
  readonly failOnStale: boolean;
  readonly ignore: ReadonlyArray<string>;
}

interface CodeLink {
  readonly edge: GraphEdge;
  readonly codeNode: GraphNode;
}

const QUERY_LIMIT = 1_000_000;

export function detectDrift(graph: KnowledgeGraph, cfg: DriftConfig): DriftReport {
  if (!cfg.enabled) {
    return {
      findings: [],
      counts: createCounts(),
      staleIndeterminate: 0,
    };
  }

  const findings: DriftFinding[] = [];
  const counts = createCounts();
  let staleIndeterminate = 0;

  const requirements = sortNodes(graph.queryNodes('requirement', QUERY_LIMIT));
  const codeSymbols = sortNodes(graph.queryNodes('code_symbol', QUERY_LIMIT));
  const ignoreGlobs = [...cfg.ignore].sort();

  for (const requirement of requirements) {
    const links = linkedCodeToRequirement(graph, requirement.id);
    if (links.length === 0) {
      pushFinding(findings, counts, {
        kind: 'orphan-requirement',
        nodeId: requirement.id,
        label: requirement.label,
        detail: `requirement ${requirement.id} has no incoming implements/affects edge from code_symbol`,
      });
      continue;
    }

    const reqHash = readString(requirement.metadata, 'contentHash');
    if (!reqHash) {
      staleIndeterminate += 1;
      continue;
    }

    const reqTimestamp = firstValidTimestamp([
      readString(requirement.metadata, 'ingestedAt'),
      readString(requirement.metadata, 'updatedAt'),
      requirement.updatedAt,
      requirement.createdAt,
    ]);

    const staleCause = findStaleCause(reqHash, reqTimestamp, links);
    if (staleCause) {
      pushFinding(findings, counts, {
        kind: 'stale',
        nodeId: requirement.id,
        label: requirement.label,
        detail: staleCause,
      });
    }
  }

  for (const symbol of codeSymbols) {
    if (isIgnored(symbol, ignoreGlobs)) continue;
    if (hasRequirementImplementsEdge(graph, symbol.id)) continue;
    pushFinding(findings, counts, {
      kind: 'orphan-code',
      nodeId: symbol.id,
      label: symbol.label,
      detail: `code_symbol ${symbol.id} has no outgoing implements edge to requirement`,
    });
  }

  const sortedFindings = [...findings].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    if (a.nodeId !== b.nodeId) return a.nodeId.localeCompare(b.nodeId);
    return a.detail.localeCompare(b.detail);
  });

  return {
    findings: sortedFindings,
    counts,
    staleIndeterminate,
  };
}

function createCounts(): Record<DriftKind, number> {
  return {
    'orphan-requirement': 0,
    'orphan-code': 0,
    stale: 0,
  };
}

function pushFinding(
  findings: DriftFinding[],
  counts: Record<DriftKind, number>,
  finding: DriftFinding,
): void {
  findings.push(finding);
  counts[finding.kind] += 1;
}

function sortNodes(nodes: readonly GraphNode[]): GraphNode[] {
  return [...nodes].sort((a, b) => {
    if (a.id !== b.id) return a.id.localeCompare(b.id);
    return a.label.localeCompare(b.label);
  });
}

function linkedCodeToRequirement(graph: KnowledgeGraph, requirementId: string): CodeLink[] {
  const incoming = graph.getEdges(requirementId, 'in');
  const links: CodeLink[] = [];
  for (const edge of incoming) {
    if (edge.type !== 'implements' && edge.type !== 'affects') continue;
    const source = graph.getNode(edge.sourceId);
    if (!source || source.type !== 'code_symbol') continue;
    links.push({ edge, codeNode: source });
  }
  return links.sort((a, b) => {
    if (a.codeNode.id !== b.codeNode.id) return a.codeNode.id.localeCompare(b.codeNode.id);
    return a.edge.id.localeCompare(b.edge.id);
  });
}

function hasRequirementImplementsEdge(graph: KnowledgeGraph, codeSymbolId: string): boolean {
  const outgoing = graph.getEdges(codeSymbolId, 'out');
  for (const edge of outgoing) {
    if (edge.type !== 'implements') continue;
    const target = graph.getNode(edge.targetId);
    if (target?.type === 'requirement') return true;
  }
  return false;
}

function isIgnored(codeNode: GraphNode, globs: readonly string[]): boolean {
  if (globs.length === 0) return false;
  const candidates = normalizeCandidates([
    codeNode.id,
    codeNode.label,
    readString(codeNode.metadata, 'path'),
    readString(codeNode.metadata, 'qualifiedName'),
  ]);
  for (const glob of globs) {
    const regex = globToRegExp(glob);
    if (candidates.some((candidate) => regex.test(candidate))) return true;
  }
  return false;
}

function normalizeCandidates(candidates: Array<string | undefined>): string[] {
  return candidates
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => value.replace(/\\/g, '/'));
}

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/');
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped
    .replace(/\*\*\/?/g, '§§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§§/g, '.*');
  return new RegExp(`^${pattern}$`);
}

function findStaleCause(
  requirementHash: string,
  requirementTimestamp: number | undefined,
  links: readonly CodeLink[],
): string | null {
  for (const link of links) {
    const codeSymbol = codeSymbolLabel(link.codeNode);
    const recordedRequirementHash = firstPresentString([
      readString(link.edge.metadata, 'requirementContentHash'),
      readString(link.codeNode.metadata, 'requirementContentHash'),
      readString(link.codeNode.metadata, 'reqContentHash'),
    ]);

    if (recordedRequirementHash && recordedRequirementHash !== requirementHash) {
      return `requirement hash differs from code snapshot on ${codeSymbol}`;
    }

    if (requirementTimestamp === undefined) continue;
    const codeTimestamp = firstValidTimestamp([
      readString(link.codeNode.metadata, 'ingestedAt'),
      readString(link.codeNode.metadata, 'indexedAt'),
      readString(link.codeNode.metadata, 'updatedAt'),
      readString(link.codeNode.metadata, 'mtime'),
      readString(link.codeNode.metadata, 'modifiedAt'),
      link.codeNode.updatedAt,
      link.codeNode.createdAt,
    ]);
    if (codeTimestamp !== undefined && requirementTimestamp > codeTimestamp) {
      return `requirement changed after code snapshot on ${codeSymbol}`;
    }
  }
  return null;
}

function codeSymbolLabel(node: GraphNode): string {
  return (
    readString(node.metadata, 'qualifiedName') ??
    readString(node.metadata, 'path') ??
    node.label ??
    node.id
  );
}

function firstPresentString(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function readString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function firstValidTimestamp(values: Array<string | undefined>): number | undefined {
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}
