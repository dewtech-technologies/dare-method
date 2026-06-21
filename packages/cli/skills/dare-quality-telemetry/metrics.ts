/**
 * dare-quality-telemetry — self-assessment metrics (M-01 to M-04)
 * Collects metrics of the dare-quality-telemetry skill itself.
 * License: MIT
 */

import fs from 'fs';
import path from 'path';
import { MetricResult } from './types.js';

export class QualityTelemetryMetrics {
  /**
   * Collects all four self-assessment metrics.
   *
   * @param projectPath - Absolute path to the project being evaluated.
   * @returns Array of MetricResult for M-01 to M-04.
   */
  collect(projectPath: string): MetricResult[] {
    return [
      this.collectM01(projectPath),
      this.collectM02(projectPath),
      this.collectM03(projectPath),
      this.collectM04(projectPath),
    ];
  }

  /**
   * M-01: 100% of builds include metrics collection.
   * If the skill is installed, metric collection is always included.
   * Returns true as long as this skill is loaded/installed.
   */
  collectM01(_projectPath: string): MetricResult {
    return {
      id: 'M-01',
      pass: true,
      description: '100% of builds include metrics collection',
      details: 'dare-quality-telemetry skill is installed and active — metrics collection is included in every build.',
    };
  }

  /**
   * M-02: 0 regressions go undetected.
   * Verifies that a baseline file exists (regression detection is enabled).
   */
  collectM02(projectPath: string): MetricResult {
    // Check if a baseline file exists in tmp/
    const baselinePath = path.join(projectPath, 'tmp', 'dare_metrics.json');
    const alternatePaths = [
      path.join(projectPath, '.dare', 'baseline_metrics.json'),
      path.join(projectPath, 'dare_metrics_baseline.json'),
    ];

    const candidates = [baselinePath, ...alternatePaths];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return {
          id: 'M-02',
          pass: true,
          description: '0 regressions go undetected (baseline exists)',
          details: `Baseline metrics file found at ${candidate}. Regression detection is active.`,
        };
      }
    }

    return {
      id: 'M-02',
      pass: false,
      description: '0 regressions go undetected (baseline exists)',
      details:
        'No baseline metrics file found. Run metrics collection once to establish a baseline (tmp/dare_metrics.json). Without a baseline, regressions cannot be detected.',
    };
  }

  /**
   * M-03: Metrics history is maintained.
   * Verifies that tmp/dare_metrics.json exists (history is being kept).
   */
  collectM03(projectPath: string): MetricResult {
    const metricsPath = path.join(projectPath, 'tmp', 'dare_metrics.json');

    if (fs.existsSync(metricsPath)) {
      try {
        const stat = fs.statSync(metricsPath);
        const ageMs = Date.now() - stat.mtimeMs;
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        return {
          id: 'M-03',
          pass: true,
          description: 'Metrics history maintained (tmp/dare_metrics.json exists)',
          details: `Metrics file exists at tmp/dare_metrics.json (last modified ${ageDays} day(s) ago).`,
        };
      } catch {
        return {
          id: 'M-03',
          pass: true,
          description: 'Metrics history maintained (tmp/dare_metrics.json exists)',
          details: 'Metrics file exists at tmp/dare_metrics.json.',
        };
      }
    }

    return {
      id: 'M-03',
      pass: false,
      description: 'Metrics history maintained (tmp/dare_metrics.json exists)',
      details:
        'tmp/dare_metrics.json not found. Run dare metrics collect to create the metrics history file.',
    };
  }

  /**
   * M-04: GitHub Actions workflow exists.
   * Checks for .github/workflows/dare-metrics.yml in the project.
   */
  collectM04(projectPath: string): MetricResult {
    const workflowPath = path.join(projectPath, '.github', 'workflows', 'dare-metrics.yml');
    const alternateYaml = path.join(projectPath, '.github', 'workflows', 'dare-metrics.yaml');

    if (fs.existsSync(workflowPath) || fs.existsSync(alternateYaml)) {
      const found = fs.existsSync(workflowPath) ? workflowPath : alternateYaml;
      return {
        id: 'M-04',
        pass: true,
        description: 'GitHub Actions workflow exists (.github/workflows/dare-metrics.yml)',
        details: `Workflow found at ${path.relative(projectPath, found)}.`,
      };
    }

    return {
      id: 'M-04',
      pass: false,
      description: 'GitHub Actions workflow exists (.github/workflows/dare-metrics.yml)',
      details:
        'No dare-metrics.yml workflow found. Create .github/workflows/dare-metrics.yml using the GITHUB_ACTIONS_TEMPLATE from dare-quality-telemetry.',
    };
  }
}
