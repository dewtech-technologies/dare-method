/**
 * dare-quality-telemetry — public API
 * License: MIT
 */

export { collectMetrics, detectCommit, buildSummary } from './collect.js';
export { detectRegressions } from './regression.js';
export { formatTable, formatJSON, formatPRComment } from './reporter.js';
export { QualityTelemetryMetrics } from './metrics.js';
export { GITHUB_ACTIONS_TEMPLATE } from './github_actions_template.js';
export { collectors, collectDareAx, collectDareLayeredDesign } from './collectors/index.js';
export type {
  MetricResult,
  SkillMetricReport,
  ProjectMetricReport,
  CollectorConfig,
  RegressionResult,
} from './types.js';
