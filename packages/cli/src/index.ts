/**
 * @dewtech/dare-cli — pacote único do framework DARE.
 *
 * Inclui CLI (`dare`), servidor MCP (`dare-mcp-server`), engine GraphRAG e
 * o DAG Task Runner. Instalar este pacote dá acesso a todas as funcionalidades
 * do método — não há subpacotes para gerenciar separadamente.
 */

// Commands
export { initCommand } from './commands/init.js';
export { designCommand } from './commands/design.js';
export { blueprintCommand } from './commands/blueprint.js';
export { executeCommand } from './commands/execute.js';

// DAG Runner
export { runDag, computeRanks, DEFAULT_DAG_LIMITS } from './dag-runner/run_dag.js';
export type {
  Dag,
  DagTask,
  DagLimits,
  DagModelMap,
  DagModels,
  RunDagOptions,
  RunnerName,
  Complexity,
  TaskStatus as DagTaskStatus,
} from './dag-runner/run_dag.js';
export { convertYamlToDag, convertDagToYaml } from './utils/dag-converter.js';
export {
  getAdapter,
  MissingApiKeyError,
  AdapterCallError,
} from './dag-runner/adapters/index.js';
export type { RunnerAdapter } from './dag-runner/adapters/index.js';

// Project generation
export { generateProjectStructure } from './utils/project-generator.js';
export type { ProjectConfig } from './utils/project-generator.js';

// Knowledge graph engine
export { GraphRAG } from './graphrag/index.js';
export type {
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  TaskNode,
  FileNode,
  SchemaNode,
  EndpointNode,
  ComponentNode,
  SearchResult,
  GraphStatistics,
} from './graphrag/index.js';

// MCP server
export { createMcpServer } from './mcp-server/index.js';
export type { ContextQuery, ContextResult, TaskStatus } from './mcp-server/index.js';
