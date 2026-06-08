/**
 * @dewtech/dare-cli — pacote único do framework DARE.
 *
 * Inclui CLI (`dare`), servidor MCP (`dare-mcp-server`), engine GraphRAG e
 * o DAG Task Runner (orquestrador). Instalar este pacote dá acesso a todas
 * as funcionalidades do método — não há subpacotes para gerenciar.
 *
 * O CLI **não** chama nenhuma API de LLM diretamente: a execução de tasks
 * acontece dentro da IDE em que você já está autenticado (Cursor, Antigravity
 * ou Claude Code). O DAG runner é orquestrador puro — coordena estado,
 * canvas e ingestão no GraphRAG.
 */

// Commands
export { initCommand } from './commands/init.js';
export { designCommand } from './commands/design.js';
export { blueprintCommand } from './commands/blueprint.js';
export { executeCommand } from './commands/execute.js';
export { graphCommand } from './commands/graph.js';
export { steeringCommand } from './commands/steering.js';
export { hooksCommand } from './commands/hooks.js';
export { dagCommand, renderDagMermaid, renderDagDot } from './commands/dag.js';
export { validateCommand } from './commands/validate.js';
export { infoCommand } from './commands/info.js';
export { bootstrapCommand } from './commands/bootstrap.js';

// Stack bootstrap + Ralph Loop
export {
  bootstrapBackend,
  bootstrapFrontend,
  bootstrapMcp,
} from './utils/stack-bootstrap.js';
export type {
  BackendStack,
  FrontendStack,
  McpLanguage,
} from './utils/stack-bootstrap.js';
export {
  gatesFor,
  resolveStackFromConfig,
  runRalphLoop,
} from './dag-runner/ralph-loop.js';
export type {
  GateName,
  RalphLoopGate,
  RalphLoopResult,
  RunRalphLoopOptions,
} from './dag-runner/ralph-loop.js';

// DAG Runner (orchestration)
export {
  computeRanks,
  nextExecutableTasks,
  applyCascadingSkip,
  buildTaskPrompt,
  markRunning,
  markDone,
  markFailed,
  renderCanvas,
  DEFAULT_DAG_LIMITS,
} from './dag-runner/run_dag.js';
export type {
  Dag,
  DagTask,
  DagLimits,
  DagModelMap,
  DagModels,
  RunnerName,
  Complexity,
  TaskStatus as DagTaskStatus,
  MarkOptions,
} from './dag-runner/run_dag.js';
export { ingestTask, ingestDag, extractFilePaths } from './dag-runner/graph-ingest.js';
export { convertYamlToDag, convertDagToYaml } from './utils/dag-converter.js';

// Project generation
export { generateProjectStructure } from './utils/project-generator.js';
export type { ProjectConfig } from './utils/project-generator.js';

// Knowledge graph engine
export { GraphRAG, JsonGraph, createGraph, loadGraphConfig } from './graphrag/index.js';
export type {
  KnowledgeGraph,
  GraphConfig,
  GraphBackend,
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
