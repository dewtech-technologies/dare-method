/**
 * dare-ax — shared types
 * License: MIT
 */

export interface RateLimit {
  scope: string;
  limit: number;
}

export interface Endpoint {
  method: string;
  path: string;
  description?: string;
}

export interface ProjectConfig {
  /** Project name */
  name: string;
  /** One-paragraph description of what the project does */
  projectOverview: string;
  /** Primary language (Rust, TypeScript, Python, Ruby, Go, PHP, etc.) */
  language: string;
  /** Framework (Axum, NestJS, FastAPI, Rails, Gin, Laravel, etc.) */
  framework: string;
  /** Database (Postgres, MongoDB, Redis, None, etc.) */
  database: string;
  /** List of 5-10 key dependencies */
  keyDependencies: string[];
  /** 3-5 sentence architecture description */
  architectureDescription: string;
  /** ASCII directory tree (optional) */
  directoryStructure?: string;
  /** HTTP endpoints (optional) */
  endpoints?: Endpoint[];
  /** Config file name (default: "config.json") */
  configFile?: string;
  /** Whether project has docker-compose.yml */
  hasDocker?: boolean;
  /** Whether project has a Makefile */
  hasMakefile?: boolean;
  /** Whether project has tasks.json / Taskfile */
  hasTaskfile?: boolean;
  /** Getting started command (default: "make dev") */
  gettingStartedCommand?: string;
  /** Rate limit definitions (default: public 100/min, auth 10/min) */
  rateLimits?: RateLimit[];
  /** Additional security notes */
  extraSecurityNotes?: string[];
  /** CLI binary name (default: project name) */
  cliBinary?: string;
  /** Additional notes for AI agents */
  agentNotes?: string[];
  /** If true, skip AX validation in CI */
  axNotApplicable?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
}

export interface MetricResult {
  id: string;
  pass: boolean;
  description: string;
  detail?: string;
}
