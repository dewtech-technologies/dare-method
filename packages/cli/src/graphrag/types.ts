export type NodeType =
  | 'task'
  | 'file'
  | 'schema'
  | 'endpoint'
  | 'component'
  | 'entity'
  | 'concept'
  | 'gate';
export type EdgeType =
  | 'depends_on'
  | 'implements'
  | 'uses'
  | 'references'
  | 'related_to'
  | 'contains'
  | 'extends'
  | 'verified_by';

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
