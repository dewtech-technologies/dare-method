/**
 * dare-quality-telemetry — shared types
 * License: MIT
 */

export interface MetricResult {
  id: string;          // "M-01"
  pass: boolean;
  description: string;
  details: string;
}

export interface SkillMetricReport {
  skillName: string;
  timestamp: string;   // ISO 8601
  commit: string;      // git SHA or "unknown"
  metrics: MetricResult[];
  summary: { passed: number; total: number; score: string; allPass: boolean };
}

export interface ProjectMetricReport {
  timestamp: string;
  commit: string;
  projectPath: string;
  skills: SkillMetricReport[];
  overall: { passed: number; total: number; score: string; allPass: boolean };
}

export interface CollectorConfig {
  projectPath: string;
  skills: string[];    // which skills to validate
  baselineFile?: string; // path to previous baseline (regression detection)
}

export interface RegressionResult {
  skill: string;
  metricId: string;
  baseline: boolean;
  current: boolean;
  regressed: boolean;
}
