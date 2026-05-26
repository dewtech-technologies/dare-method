/**
 * dare-frontend-design — public API
 * License: MIT
 */

// Types
export type {
  Framework,
  LinterViolation,
  LinterRule,
  LinterResult,
  ScaffoldOptions,
  ScaffoldResult,
  MetricResult,
  FrontendMetricsInput,
} from './types.js';

// Linter
export { FrontendLinter } from './linter.js';

// Generator
export { FrontendGenerator } from './generator.js';

// Metrics
export { collectFrontendMetrics } from './metrics.js';
