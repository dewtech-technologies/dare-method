export type NodeType =
  | 'task'
  | 'file'
  | 'schema'
  | 'endpoint'
  | 'component'
  | 'entity'
  | 'concept'
  | 'gate'
  | 'code_symbol'
  | 'requirement'
  | 'pattern'
  | 'formal-gate';

export type EdgeType =
  | 'depends_on'
  | 'implements'
  | 'uses'
  | 'references'
  | 'related_to'
  | 'contains'
  | 'extends'
  | 'verified_by'
  | 'affects' // symbol → requirement/task (impacto inverso)
  | 'derives_from' // requirement-filho → requirement-pai
  | 'evidenced_by' // pattern → file
  | 'exhibits'
  | 'proven_by'; // module → pattern

/** All members of {@link NodeType} — use for zero-initialized statistics (RNF-05). */
export const ALL_NODE_TYPES = [
  'task',
  'file',
  'schema',
  'endpoint',
  'component',
  'entity',
  'concept',
  'gate',
  'code_symbol',
  'requirement',
  'pattern',
  'formal-gate',
] as const satisfies readonly NodeType[];

/** All members of {@link EdgeType} — use for zero-initialized statistics (RNF-05). */
export const ALL_EDGE_TYPES = [
  'depends_on',
  'implements',
  'uses',
  'references',
  'related_to',
  'contains',
  'extends',
  'verified_by',
  'affects',
  'derives_from',
  'evidenced_by',
  'exhibits',
  'proven_by',
] as const satisfies readonly EdgeType[];

/** Zero-filled `nodesByType` — absent types stay `0`, never `NaN` (RNF-05). */
export function emptyNodesByType(): Record<NodeType, number> {
  return Object.fromEntries(ALL_NODE_TYPES.map((t) => [t, 0])) as Record<NodeType, number>;
}

/** Zero-filled `edgesByType` — absent types stay `0`, never `NaN` (RNF-05). */
export function emptyEdgesByType(): Record<EdgeType, number> {
  return Object.fromEntries(ALL_EDGE_TYPES.map((t) => [t, 0])) as Record<EdgeType, number>;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: EdgeType;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskNode extends GraphNode {
  type: 'task';
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'SKIPPED';
  complexity: 'LOW' | 'MED' | 'HIGH';
  prompt?: string;
}

export interface FileNode extends GraphNode {
  type: 'file';
  path: string;
  language?: string;
  size?: number;
}

export interface SchemaNode extends GraphNode {
  type: 'schema';
  tableName?: string;
  columns?: string[];
}

export interface EndpointNode extends GraphNode {
  type: 'endpoint';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  module?: string;
}

export interface ComponentNode extends GraphNode {
  type: 'component';
  framework?: string;
  props?: string[];
}

export type CodeSymbolKind = 'function' | 'class' | 'method';

/**
 * Canonical id: `code_symbol:{qualifiedName}` — e.g. `code_symbol:src/math.ts::add`
 */
export interface CodeSymbolNode extends GraphNode {
  type: 'code_symbol';
  path: string; // posix, relativo ao project root
  symbol: string; // nome curto, ex. 'add'
  kind: CodeSymbolKind;
  qualifiedName: string; // 'src/math.ts::add'
  line?: number; // 1-based
}

/**
 * Canonical id: `requirement:{reqId}` — e.g. `requirement:RF-01`
 * (`task:{taskId}` e `file:{posixPath}` permanecem inalterados.)
 */
export interface RequirementNode extends GraphNode {
  type: 'requirement';
  reqId: string; // 'RF-01', 'O-03', 'task-101'
  source: 'design' | 'blueprint' | 'tasks' | 'dag';
  title: string;
  priority?: 'MUST' | 'SHOULD' | 'COULD';
}

/**
 * Canonical id: `pattern:{DiscoveredPattern.id}` — e.g. `pattern:naming-idiom:service-suffix`
 * Arestas: `evidenced_by:{patternId}->{file}` (pattern→file),
 *          `exhibits:{moduleId}->{patternId}` (module→pattern).
 */
export interface PatternNode extends GraphNode {
  type: 'pattern';
  kind: string;
  frequency: number;
  coverage: number;
}

export interface TraverseOptions {
  readonly seedNodeIds: readonly string[];
  readonly maxHops?: number; // default 3
  readonly maxFanout?: number; // default 50
  readonly nodeTypes?: readonly NodeType[];
  readonly edgeTypes?: readonly EdgeType[];
  readonly direction?: 'out' | 'in' | 'both'; // default 'both'
}

export interface TraverseResult {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly hops: number;
}

export interface LocateOptions {
  readonly hops?: number; // default 3
  readonly nodeTypes?: readonly NodeType[];
  readonly edgeTypes?: readonly EdgeType[];
  readonly limit?: number; // default 10
}

export interface LocateCandidate {
  readonly node: GraphNode;
  readonly score: number;
  readonly path: readonly string[];
}

export interface LocateResult {
  readonly candidates: ReadonlyArray<LocateCandidate>;
}

export interface SearchResult {
  node: GraphNode;
  score: number;
  snippet?: string;
}

export interface GraphStatistics {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<NodeType, number>;
  edgesByType: Record<EdgeType, number>;
}
