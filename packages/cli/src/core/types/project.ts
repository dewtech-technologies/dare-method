export type ProjectStructure = 'monorepo' | 'backend' | 'frontend';
export type BackendStack = 'rust-axum' | 'node-nestjs' | 'python-fastapi' | 'php-laravel';
export type FrontendStack = 'react' | 'vue' | 'rust-leptos' | 'rust-leptos-csr';
export type IdeChoice = 'cursor' | 'antigravity' | 'hybrid';
export type GraphRagBackend = 'sqlite' | 'json' | 'neo4j';

export interface ProjectConfig {
  name: string;
  structure: ProjectStructure;
  backend?: BackendStack;
  frontend?: FrontendStack;
  ide: IdeChoice;
  graphrag: GraphRagBackend;
}
