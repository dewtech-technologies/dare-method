/**
 * dare-layered-design — Layered Design skill
 * Enforces Handler → Service → Repository → Model architecture.
 * License: MIT
 */

export { LayeredDesignLinter } from './linter.js';
export { LayeredDesignGenerator } from './generator.js';
export { LayeredDesignMetrics } from './metrics.js';
export type {
  Language,
  LinterViolation,
  LinterResult,
  ScaffoldOptions,
  ScaffoldResult,
  MetricResult,
} from './types.js';
