/**
 * dare-quality-telemetry — main collect function
 * Orchestrates metric collection for all configured skills and saves results.
 * License: MIT
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  CollectorConfig,
  ProjectMetricReport,
  SkillMetricReport,
  MetricResult,
} from './types.js';
import { collectors } from './collectors/index.js';

/**
 * Detects the current git commit SHA.
 * Returns "unknown" if git is not available or the directory is not a repo.
 */
export function detectCommit(projectPath: string): string {
  try {
    const result = execSync('git rev-parse --short HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Builds a summary object from a list of MetricResults.
 */
export function buildSummary(metrics: MetricResult[]): {
  passed: number;
  total: number;
  score: string;
  allPass: boolean;
} {
  const total = metrics.length;
  const passed = metrics.filter((m) => m.pass).length;
  const score = total === 0 ? '0/0' : `${passed}/${total}`;
  const allPass = total > 0 && passed === total;
  return { passed, total, score, allPass };
}

/**
 * Main function: collects metrics for all configured skills in the project.
 *
 * @param config - CollectorConfig specifying project path and skills to validate.
 * @returns ProjectMetricReport with all results.
 *
 * Side effect: writes result to <projectPath>/tmp/dare_metrics.json
 */
export async function collectMetrics(config: CollectorConfig): Promise<ProjectMetricReport> {
  const { projectPath, skills } = config;
  const timestamp = new Date().toISOString();
  const commit = detectCommit(projectPath);

  const skillReports: SkillMetricReport[] = [];

  for (const skillName of skills) {
    const collector = collectors[skillName];

    if (!collector) {
      // Unknown skill — report it as a failed collector with a placeholder metric
      skillReports.push({
        skillName,
        timestamp,
        commit,
        metrics: [
          {
            id: 'M-00',
            pass: false,
            description: 'Collector available',
            details: `No collector registered for skill "${skillName}". Available: ${Object.keys(collectors).join(', ')}`,
          },
        ],
        summary: { passed: 0, total: 1, score: '0/1', allPass: false },
      });
      continue;
    }

    let metrics: MetricResult[];
    try {
      metrics = await collector(projectPath);
    } catch (err) {
      metrics = [
        {
          id: 'M-00',
          pass: false,
          description: 'Collector executed without error',
          details: `Collector for "${skillName}" threw: ${(err as Error).message}`,
        },
      ];
    }

    const summary = buildSummary(metrics);
    skillReports.push({ skillName, timestamp, commit, metrics, summary });
  }

  // Calculate overall summary
  const allMetrics = skillReports.flatMap((s) => s.metrics);
  const overall = buildSummary(allMetrics);

  const report: ProjectMetricReport = {
    timestamp,
    commit,
    projectPath,
    skills: skillReports,
    overall,
  };

  // Save to tmp/dare_metrics.json
  const tmpDir = path.join(projectPath, 'tmp');
  try {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(tmpDir, 'dare_metrics.json'),
      JSON.stringify(report, null, 2),
      'utf-8'
    );
  } catch {
    // Non-fatal: log failure but return the report regardless
  }

  return report;
}
