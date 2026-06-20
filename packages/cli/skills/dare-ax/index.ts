/**
 * dare-ax — Agent Experience (AX) skill
 * Codifies best practices for AI-assisted development.
 * License: MIT
 */

export { DareAxGenerator } from './generator.js';
export { DareAxValidator } from './validator.js';
export { DareAxMetrics } from './metrics.js';
export { containsSecrets, findAllSecrets } from './secret-detector.js';
export type {
  ProjectConfig,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  MetricResult,
  RateLimit,
  Endpoint,
} from './types.js';
