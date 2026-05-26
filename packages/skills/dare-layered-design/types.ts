/**
 * dare-layered-design — shared types
 * License: MIT
 */

export type Language = 'typescript' | 'javascript' | 'ruby' | 'rust' | 'python' | 'go' | 'php' | 'unknown';

export interface LinterViolation {
  /** File where violation was found */
  file: string;
  /** 1-based line number */
  line: number;
  /** The violating line content */
  content: string;
  /** Violation rule ID */
  rule: string;
  /** Human-readable message */
  message: string;
}

export interface LinterResult {
  violations: LinterViolation[];
  filesScanned: number;
  pass: boolean;
}

export interface ScaffoldOptions {
  /** Root source directory (default: 'src') */
  srcDir?: string;
  /** Language (affects file extensions and naming conventions) */
  language?: Language;
  /** Whether to create example files (default: false — only .gitkeep) */
  withExamples?: boolean;
  /** Entity name for example files (default: 'example') */
  exampleEntity?: string;
}

export interface ScaffoldResult {
  createdDirs: string[];
  createdFiles: string[];
}

export interface MetricResult {
  id: string;
  pass: boolean;
  description: string;
  detail?: string;
}
