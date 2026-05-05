// Commands
export { initCommand } from './commands/init.js';
export { designCommand } from './commands/design.js';
export { blueprintCommand } from './commands/blueprint.js';
export { executeCommand } from './commands/execute.js';

// DAG Runner
export { runDag } from './dag-runner/run_dag.js';
export type { Dag, DagTask, RunDagOptions } from './dag-runner/run_dag.js';
export { convertYamlToDag, convertDagToYaml } from './utils/dag-converter.js';

// Project generation
export { generateProjectStructure } from './utils/project-generator.js';
export type { ProjectConfig } from './utils/project-generator.js';

// Sub-modules (re-exports for convenience; canonical paths are sub-path exports)
export * as core from './core/index.js';
export * as graphrag from './graphrag/index.js';
export * as mcpServer from './mcp-server/index.js';
