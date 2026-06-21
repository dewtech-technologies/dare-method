/**
 * dare-quality-telemetry — regression detection
 * Compares two ProjectMetricReports and returns a list of regressions.
 * License: MIT
 */

import { ProjectMetricReport, RegressionResult } from './types.js';

/**
 * Detects regressions between a baseline and current report.
 *
 * A regression is defined as: a metric that was `pass: true` in the baseline
 * but is now `pass: false` in the current report.
 *
 * Improvements (fail → pass) are not reported as regressions.
 *
 * @param baseline - The reference report (e.g., from the main branch).
 * @param current  - The report from the current branch/build.
 * @returns Array of RegressionResult for each regressed metric.
 */
export function detectRegressions(
  baseline: ProjectMetricReport,
  current: ProjectMetricReport
): RegressionResult[] {
  const regressions: RegressionResult[] = [];

  // Build a lookup map for baseline metrics: skillName -> metricId -> pass
  const baselineMap = new Map<string, boolean>();

  for (const skillReport of baseline.skills) {
    for (const metric of skillReport.metrics) {
      const key = `${skillReport.skillName}::${metric.id}`;
      baselineMap.set(key, metric.pass);
    }
  }

  // Compare each current metric against the baseline
  for (const skillReport of current.skills) {
    for (const metric of skillReport.metrics) {
      const key = `${skillReport.skillName}::${metric.id}`;
      const baselinePass = baselineMap.get(key);

      // Only report if we have a baseline value for this metric
      if (baselinePass === undefined) continue;

      const regressed = baselinePass === true && metric.pass === false;

      regressions.push({
        skill: skillReport.skillName,
        metricId: metric.id,
        baseline: baselinePass,
        current: metric.pass,
        regressed,
      });
    }
  }

  // Filter: only return actual regressions (pass → fail)
  return regressions.filter((r) => r.regressed);
}
