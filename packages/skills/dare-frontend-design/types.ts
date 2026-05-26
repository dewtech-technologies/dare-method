/**
 * dare-frontend-design — shared types
 * License: MIT
 */

export type Framework = 'react' | 'vue';

export interface LinterViolation {
  file: string;
  line: number;
  rule: LinterRule;
  message: string;
  severity: 'error' | 'warning';
}

export type LinterRule =
  | 'component-too-large'   // Component > 300 lines
  | 'fetch-in-jsx';         // fetch() or axios. in JSX outside hooks/composables

export interface LinterResult {
  violations: LinterViolation[];
  filesChecked: number;
  pass: boolean;
}

export interface ScaffoldOptions {
  framework: Framework;
  /** Project root directory */
  outputDir: string;
  /** Project name (used in templates) */
  projectName?: string;
}

export interface ScaffoldResult {
  /** All files created */
  filesCreated: string[];
  /** Directories created */
  dirsCreated: string[];
  framework: Framework;
}

export interface MetricResult {
  id: string;
  pass: boolean;
  description: string;
  detail?: string;
}

export interface FrontendMetricsInput {
  /** M-01: number of components > 300 lines */
  largeComponentCount: number;
  /** M-01: total components checked */
  totalComponentsChecked: number;
  /** M-02: number of fetch() calls found inline in JSX/template */
  inlineFetchCount: number;
  /** M-03: number of pages with error boundaries */
  pagesWithErrorBoundary: number;
  /** M-03: total pages */
  totalPages: number;
  /** M-04: bundle config file exists */
  bundleConfigExists: boolean;
}
