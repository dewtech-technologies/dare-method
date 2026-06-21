export type ProjectStructure = 'monorepo' | 'backend' | 'frontend';
export type BackendStack = 'rust-axum' | 'node-nestjs' | 'python-fastapi' | 'php-laravel';
export type FrontendStack = 'react' | 'vue' | 'rust-leptos' | 'rust-leptos-csr';
export type IdeChoice = 'cursor' | 'antigravity' | 'hybrid' | 'claude-code' | 'claude-hybrid' | 'codex';
export type GraphRagBackend = 'sqlite' | 'json' | 'neo4j';
/** single: crates/server + crates/web | multi: {name}-core + {name}-server + {name}-web + {name}-cli */
export type RustWorkspaceLayout = 'single' | 'multi';

export interface ProjectConfig {
  name: string;
  structure: ProjectStructure;
  backend?: BackendStack;
  frontend?: FrontendStack;
  ide: IdeChoice;
  graphrag: GraphRagBackend;
  rustWorkspaceLayout?: RustWorkspaceLayout;
  /** Short prefix for multi-crate names, e.g. "ars" → ars-core/ars-server/ars-web/ars-cli */
  cratePrefix?: string;
}
