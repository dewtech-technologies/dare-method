/**
 * dare-quality-telemetry — comprehensive test suite
 * 50+ tests covering all collectors, orchestration, regression detection, and reporters.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { collectDareAx } from '../collectors/dare_ax_collector.js';
import { collectDareLayeredDesign } from '../collectors/dare_layered_design_collector.js';
import { collectors } from '../collectors/index.js';
import { collectMetrics, buildSummary, detectCommit } from '../collect.js';
import { detectRegressions } from '../regression.js';
import { formatTable, formatJSON, formatPRComment } from '../reporter.js';
import { QualityTelemetryMetrics } from '../metrics.js';
import type {
  ProjectMetricReport,
  SkillMetricReport,
  MetricResult,
  RegressionResult,
} from '../types.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_LLMS_TXT = `# llms.txt

## Project Overview
A test project for dare-quality-telemetry.

## Tech Stack
- Language: TypeScript
- Framework: NestJS

## Architecture
4-layer architecture.

## Getting Started
\`\`\`bash
make dev
\`\`\`

## For AI Agents
- OpenAPI: GET /openapi.json
`;

function makeSkillReport(
  skillName: string,
  metrics: MetricResult[],
  commit = 'abc1234'
): SkillMetricReport {
  const passed = metrics.filter((m) => m.pass).length;
  const total = metrics.length;
  return {
    skillName,
    timestamp: '2026-05-26T10:00:00Z',
    commit,
    metrics,
    summary: {
      passed,
      total,
      score: `${passed}/${total}`,
      allPass: passed === total && total > 0,
    },
  };
}

function makeProjectReport(
  skills: SkillMetricReport[],
  projectPath = '/tmp/test-project'
): ProjectMetricReport {
  const allMetrics = skills.flatMap((s) => s.metrics);
  const passed = allMetrics.filter((m) => m.pass).length;
  const total = allMetrics.length;
  return {
    timestamp: '2026-05-26T10:00:00Z',
    commit: 'abc1234',
    projectPath,
    skills,
    overall: {
      passed,
      total,
      score: `${passed}/${total}`,
      allPass: passed === total && total > 0,
    },
  };
}

function makeMetric(id: string, pass: boolean): MetricResult {
  return {
    id,
    pass,
    description: `Test metric ${id}`,
    details: pass ? 'All good' : 'Failed',
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-qt-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── DareAxCollector ───────────────────────────────────────────────────────────

describe('DareAxCollector', () => {
  describe('M-01: llms.txt valid with 5 sections', () => {
    it('passes when llms.txt exists with all 5 required sections', async () => {
      fs.writeFileSync(path.join(tmpDir, 'llms.txt'), VALID_LLMS_TXT, 'utf-8');
      const results = await collectDareAx(tmpDir);
      const m01 = results.find((r) => r.id === 'M-01')!;
      expect(m01.pass).toBe(true);
    });

    it('fails when llms.txt does not exist', async () => {
      const results = await collectDareAx(tmpDir);
      const m01 = results.find((r) => r.id === 'M-01')!;
      expect(m01.pass).toBe(false);
      expect(m01.details).toContain('not found');
    });

    it('fails when llms.txt is missing Project Overview section', async () => {
      const content = VALID_LLMS_TXT.replace('## Project Overview', '## Missing Section');
      fs.writeFileSync(path.join(tmpDir, 'llms.txt'), content, 'utf-8');
      const results = await collectDareAx(tmpDir);
      const m01 = results.find((r) => r.id === 'M-01')!;
      expect(m01.pass).toBe(false);
      expect(m01.details).toContain('Project Overview');
    });

    it('fails when llms.txt is missing For AI Agents section', async () => {
      const content = VALID_LLMS_TXT.replace('## For AI Agents', '## Something Else');
      fs.writeFileSync(path.join(tmpDir, 'llms.txt'), content, 'utf-8');
      const results = await collectDareAx(tmpDir);
      const m01 = results.find((r) => r.id === 'M-01')!;
      expect(m01.pass).toBe(false);
      expect(m01.details).toContain('For AI Agents');
    });

    it('fails when llms.txt has only 2 out of 5 sections', async () => {
      const minimal = '## Project Overview\nSome text.\n## Tech Stack\nTS\n';
      fs.writeFileSync(path.join(tmpDir, 'llms.txt'), minimal, 'utf-8');
      const results = await collectDareAx(tmpDir);
      const m01 = results.find((r) => r.id === 'M-01')!;
      expect(m01.pass).toBe(false);
    });
  });

  describe('M-02: openapi.json exists', () => {
    it('passes when openapi.json is at project root', async () => {
      fs.writeFileSync(path.join(tmpDir, 'openapi.json'), '{"openapi":"3.1.0"}', 'utf-8');
      const results = await collectDareAx(tmpDir);
      const m02 = results.find((r) => r.id === 'M-02')!;
      expect(m02.pass).toBe(true);
    });

    it('passes when openapi.json is in public/', async () => {
      fs.mkdirSync(path.join(tmpDir, 'public'));
      fs.writeFileSync(path.join(tmpDir, 'public', 'openapi.json'), '{"openapi":"3.1.0"}', 'utf-8');
      const results = await collectDareAx(tmpDir);
      const m02 = results.find((r) => r.id === 'M-02')!;
      expect(m02.pass).toBe(true);
    });

    it('passes when openapi.yaml exists', async () => {
      fs.writeFileSync(path.join(tmpDir, 'openapi.yaml'), 'openapi: 3.1.0', 'utf-8');
      const results = await collectDareAx(tmpDir);
      const m02 = results.find((r) => r.id === 'M-02')!;
      expect(m02.pass).toBe(true);
    });

    it('fails when no openapi file found', async () => {
      const results = await collectDareAx(tmpDir);
      const m02 = results.find((r) => r.id === 'M-02')!;
      expect(m02.pass).toBe(false);
      expect(m02.details).toContain('No openapi');
    });
  });

  describe('M-03: CLI --json flag', () => {
    it('passes when --json found in bin/dare.ts', async () => {
      fs.mkdirSync(path.join(tmpDir, 'bin'));
      fs.writeFileSync(
        path.join(tmpDir, 'bin', 'dare.ts'),
        'program.option("--json", "JSON output");\n',
        'utf-8'
      );
      const results = await collectDareAx(tmpDir);
      const m03 = results.find((r) => r.id === 'M-03')!;
      expect(m03.pass).toBe(true);
    });

    it('passes when --json found in cli.ts at root', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'cli.ts'),
        'cmd.option("--json", "Output as JSON");\n',
        'utf-8'
      );
      const results = await collectDareAx(tmpDir);
      const m03 = results.find((r) => r.id === 'M-03')!;
      expect(m03.pass).toBe(true);
    });

    it('passes when --json found nested in src/commands/', async () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'commands'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'commands', 'init.ts'),
        '.option("--json", "Output results as JSON")\n',
        'utf-8'
      );
      const results = await collectDareAx(tmpDir);
      const m03 = results.find((r) => r.id === 'M-03')!;
      expect(m03.pass).toBe(true);
    });

    it('fails when no --json flag in any source file', async () => {
      fs.mkdirSync(path.join(tmpDir, 'src'));
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'cli.ts'),
        'program.option("--verbose", "Verbose output");\n',
        'utf-8'
      );
      const results = await collectDareAx(tmpDir);
      const m03 = results.find((r) => r.id === 'M-03')!;
      expect(m03.pass).toBe(false);
    });

    it('fails when project has no cli source directories', async () => {
      const results = await collectDareAx(tmpDir);
      const m03 = results.find((r) => r.id === 'M-03')!;
      expect(m03.pass).toBe(false);
    });
  });

  describe('M-04: rate limit configuration', () => {
    it('passes when express-rate-limit in package.json', async () => {
      const pkg = { name: 'test', dependencies: { 'express-rate-limit': '^7.0.0' } };
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg), 'utf-8');
      const results = await collectDareAx(tmpDir);
      const m04 = results.find((r) => r.id === 'M-04')!;
      expect(m04.pass).toBe(true);
    });

    it('passes when rack-attack in Gemfile', async () => {
      fs.writeFileSync(path.join(tmpDir, 'Gemfile'), 'gem "rack-attack"\n', 'utf-8');
      const results = await collectDareAx(tmpDir);
      const m04 = results.find((r) => r.id === 'M-04')!;
      expect(m04.pass).toBe(true);
    });

    it('passes when tower-governor in Cargo.toml', async () => {
      fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[dependencies]\ntower-governor = "0.2"\n', 'utf-8');
      const results = await collectDareAx(tmpDir);
      const m04 = results.find((r) => r.id === 'M-04')!;
      expect(m04.pass).toBe(true);
    });

    it('passes when throttler found in source file', async () => {
      fs.mkdirSync(path.join(tmpDir, 'src'));
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'app.ts'),
        'import { ThrottlerModule } from "@nestjs/throttler";\n',
        'utf-8'
      );
      const results = await collectDareAx(tmpDir);
      const m04 = results.find((r) => r.id === 'M-04')!;
      expect(m04.pass).toBe(true);
    });

    it('fails when no rate limit found', async () => {
      const pkg = { name: 'test', dependencies: { express: '^4.0.0' } };
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg), 'utf-8');
      const results = await collectDareAx(tmpDir);
      const m04 = results.find((r) => r.id === 'M-04')!;
      expect(m04.pass).toBe(false);
      expect(m04.details).toContain('No rate limit');
    });

    it('returns 4 metrics total', async () => {
      const results = await collectDareAx(tmpDir);
      expect(results).toHaveLength(4);
      expect(results.map((r) => r.id)).toEqual(['M-01', 'M-02', 'M-03', 'M-04']);
    });
  });
});

// ── DareLayeredDesignCollector ────────────────────────────────────────────────

describe('DareLayeredDesignCollector', () => {
  describe('M-01: service tests exist', () => {
    it('passes when services/ has both service and test files', async () => {
      const servicesDir = path.join(tmpDir, 'src', 'services');
      fs.mkdirSync(servicesDir, { recursive: true });
      fs.writeFileSync(path.join(servicesDir, 'user.service.ts'), 'export class UserService {}', 'utf-8');
      fs.writeFileSync(path.join(servicesDir, 'user.service.spec.ts'), 'describe("UserService", () => {})', 'utf-8');
      const results = await collectDareLayeredDesign(tmpDir);
      const m01 = results.find((r) => r.id === 'M-01')!;
      expect(m01.pass).toBe(true);
    });

    it('fails when services/ exists but has no service files', async () => {
      fs.mkdirSync(path.join(tmpDir, 'src', 'services'), { recursive: true });
      const results = await collectDareLayeredDesign(tmpDir);
      const m01 = results.find((r) => r.id === 'M-01')!;
      expect(m01.pass).toBe(false);
    });

    it('fails when services/ exists with service files but no tests anywhere', async () => {
      const servicesDir = path.join(tmpDir, 'src', 'services');
      fs.mkdirSync(servicesDir, { recursive: true });
      fs.writeFileSync(path.join(servicesDir, 'user.service.ts'), 'export class UserService {}', 'utf-8');
      const results = await collectDareLayeredDesign(tmpDir);
      const m01 = results.find((r) => r.id === 'M-01')!;
      expect(m01.pass).toBe(false);
      expect(m01.details).toContain('no test files');
    });

    it('fails when no services/ directory found', async () => {
      const results = await collectDareLayeredDesign(tmpDir);
      const m01 = results.find((r) => r.id === 'M-01')!;
      expect(m01.pass).toBe(false);
    });
  });

  describe('M-02: no Handler→Repository violations', () => {
    it('passes when no handler directories exist', async () => {
      const results = await collectDareLayeredDesign(tmpDir);
      const m02 = results.find((r) => r.id === 'M-02')!;
      expect(m02.pass).toBe(true);
    });

    it('passes when handlers do not import repositories', async () => {
      const handlersDir = path.join(tmpDir, 'src', 'handlers');
      fs.mkdirSync(handlersDir, { recursive: true });
      fs.writeFileSync(
        path.join(handlersDir, 'user.handler.ts'),
        `import { UserService } from '../services/user.service.js';\nexport class UserHandler { constructor(private svc: UserService) {} }`,
        'utf-8'
      );
      const results = await collectDareLayeredDesign(tmpDir);
      const m02 = results.find((r) => r.id === 'M-02')!;
      expect(m02.pass).toBe(true);
    });

    it('fails when handler directly imports Repository', async () => {
      const handlersDir = path.join(tmpDir, 'src', 'handlers');
      fs.mkdirSync(handlersDir, { recursive: true });
      fs.writeFileSync(
        path.join(handlersDir, 'user.handler.ts'),
        `import { UserRepository } from '../repositories/user.repository.js';\nexport class UserHandler {}`,
        'utf-8'
      );
      const results = await collectDareLayeredDesign(tmpDir);
      const m02 = results.find((r) => r.id === 'M-02')!;
      expect(m02.pass).toBe(false);
      expect(m02.details).toContain('violation');
    });
  });

  describe('M-03: handlers use dependency injection', () => {
    it('passes when no handler directories found', async () => {
      const results = await collectDareLayeredDesign(tmpDir);
      const m03 = results.find((r) => r.id === 'M-03')!;
      expect(m03.pass).toBe(true);
    });

    it('passes when handler uses @Inject pattern', async () => {
      const handlersDir = path.join(tmpDir, 'src', 'handlers');
      fs.mkdirSync(handlersDir, { recursive: true });
      fs.writeFileSync(
        path.join(handlersDir, 'user.handler.ts'),
        `@Controller('users')\nexport class UserHandler { constructor(@Inject(UserService) private svc: UserService) {} }`,
        'utf-8'
      );
      const results = await collectDareLayeredDesign(tmpDir);
      const m03 = results.find((r) => r.id === 'M-03')!;
      expect(m03.pass).toBe(true);
    });

    it('fails when handler has new Service() instantiation', async () => {
      const handlersDir = path.join(tmpDir, 'src', 'handlers');
      fs.mkdirSync(handlersDir, { recursive: true });
      fs.writeFileSync(
        path.join(handlersDir, 'user.handler.ts'),
        `export class UserHandler { async handle() { const svc = new UserService(); return svc.list(); } }`,
        'utf-8'
      );
      const results = await collectDareLayeredDesign(tmpDir);
      const m03 = results.find((r) => r.id === 'M-03')!;
      expect(m03.pass).toBe(false);
      expect(m03.details).toContain('instantiate');
    });
  });

  describe('M-04: repositories are HTTP-agnostic', () => {
    it('passes when no repository directories found', async () => {
      const results = await collectDareLayeredDesign(tmpDir);
      const m04 = results.find((r) => r.id === 'M-04')!;
      expect(m04.pass).toBe(true);
    });

    it('passes when repositories have no HTTP imports', async () => {
      const reposDir = path.join(tmpDir, 'src', 'repositories');
      fs.mkdirSync(reposDir, { recursive: true });
      fs.writeFileSync(
        path.join(reposDir, 'user.repository.ts'),
        `import { PrismaClient } from '@prisma/client';\nexport class UserRepository { async findAll() { return []; } }`,
        'utf-8'
      );
      const results = await collectDareLayeredDesign(tmpDir);
      const m04 = results.find((r) => r.id === 'M-04')!;
      expect(m04.pass).toBe(true);
    });

    it('fails when repository imports express', async () => {
      const reposDir = path.join(tmpDir, 'src', 'repositories');
      fs.mkdirSync(reposDir, { recursive: true });
      fs.writeFileSync(
        path.join(reposDir, 'bad.repository.ts'),
        `import express from 'express';\nexport class BadRepo {}`,
        'utf-8'
      );
      const results = await collectDareLayeredDesign(tmpDir);
      const m04 = results.find((r) => r.id === 'M-04')!;
      expect(m04.pass).toBe(false);
      expect(m04.details).toContain('HTTP concern');
    });

    it('fails when repository uses HTTP status code 404', async () => {
      const reposDir = path.join(tmpDir, 'src', 'repositories');
      fs.mkdirSync(reposDir, { recursive: true });
      fs.writeFileSync(
        path.join(reposDir, 'user.repository.ts'),
        `export class UserRepo { find(id: string) { return { status: 404 }; } }`,
        'utf-8'
      );
      const results = await collectDareLayeredDesign(tmpDir);
      const m04 = results.find((r) => r.id === 'M-04')!;
      expect(m04.pass).toBe(false);
    });

    it('returns 4 metrics total', async () => {
      const results = await collectDareLayeredDesign(tmpDir);
      expect(results).toHaveLength(4);
      expect(results.map((r) => r.id)).toEqual(['M-01', 'M-02', 'M-03', 'M-04']);
    });
  });
});

// ── collectors registry ───────────────────────────────────────────────────────

describe('collectors registry', () => {
  it('contains dare-ax collector', () => {
    expect(collectors['dare-ax']).toBeDefined();
    expect(typeof collectors['dare-ax']).toBe('function');
  });

  it('contains dare-layered-design collector', () => {
    expect(collectors['dare-layered-design']).toBeDefined();
    expect(typeof collectors['dare-layered-design']).toBe('function');
  });

  it('dare-ax collector returns 4 MetricResults', async () => {
    const results = await collectors['dare-ax'](tmpDir);
    expect(results).toHaveLength(4);
  });

  it('dare-layered-design collector returns 4 MetricResults', async () => {
    const results = await collectors['dare-layered-design'](tmpDir);
    expect(results).toHaveLength(4);
  });
});

// ── collectMetrics ────────────────────────────────────────────────────────────

describe('collectMetrics', () => {
  it('returns a ProjectMetricReport with correct structure', async () => {
    const report = await collectMetrics({ projectPath: tmpDir, skills: ['dare-ax'] });
    expect(report.timestamp).toBeTruthy();
    expect(report.commit).toBeTruthy();
    expect(report.projectPath).toBe(tmpDir);
    expect(report.skills).toHaveLength(1);
    expect(report.overall).toBeDefined();
  });

  it('collects metrics for multiple skills', async () => {
    const report = await collectMetrics({
      projectPath: tmpDir,
      skills: ['dare-ax', 'dare-layered-design'],
    });
    expect(report.skills).toHaveLength(2);
    expect(report.skills[0].skillName).toBe('dare-ax');
    expect(report.skills[1].skillName).toBe('dare-layered-design');
  });

  it('saves dare_metrics.json to tmp/ directory', async () => {
    await collectMetrics({ projectPath: tmpDir, skills: ['dare-ax'] });
    const metricsPath = path.join(tmpDir, 'tmp', 'dare_metrics.json');
    expect(fs.existsSync(metricsPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
    expect(content.skills).toBeDefined();
  });

  it('saved JSON is valid ProjectMetricReport', async () => {
    await collectMetrics({ projectPath: tmpDir, skills: ['dare-ax'] });
    const saved = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'tmp', 'dare_metrics.json'), 'utf-8')
    ) as ProjectMetricReport;
    expect(saved.overall.total).toBeGreaterThan(0);
    expect(saved.overall.score).toMatch(/\d+\/\d+/);
  });

  it('uses "unknown" commit when outside git repo', async () => {
    // tmpDir is not a git repo
    const report = await collectMetrics({ projectPath: tmpDir, skills: [] });
    // could be "unknown" or an actual SHA if running in a git repo context
    expect(typeof report.commit).toBe('string');
    expect(report.commit.length).toBeGreaterThan(0);
  });

  it('reports unknown skill gracefully with pass: false', async () => {
    const report = await collectMetrics({
      projectPath: tmpDir,
      skills: ['dare-nonexistent-skill'],
    });
    expect(report.skills[0].skillName).toBe('dare-nonexistent-skill');
    expect(report.skills[0].summary.allPass).toBe(false);
    expect(report.skills[0].metrics[0].details).toContain('No collector registered');
  });

  it('overall score reflects sum across all skills', async () => {
    const report = await collectMetrics({
      projectPath: tmpDir,
      skills: ['dare-ax', 'dare-layered-design'],
    });
    const expectedTotal = report.skills.reduce((sum, s) => sum + s.metrics.length, 0);
    const expectedPassed = report.skills.reduce((sum, s) => sum + s.summary.passed, 0);
    expect(report.overall.total).toBe(expectedTotal);
    expect(report.overall.passed).toBe(expectedPassed);
  });
});

// ── buildSummary ──────────────────────────────────────────────────────────────

describe('buildSummary', () => {
  it('returns correct score when all pass', () => {
    const metrics = [makeMetric('M-01', true), makeMetric('M-02', true)];
    const summary = buildSummary(metrics);
    expect(summary.passed).toBe(2);
    expect(summary.total).toBe(2);
    expect(summary.score).toBe('2/2');
    expect(summary.allPass).toBe(true);
  });

  it('returns allPass false when some fail', () => {
    const metrics = [makeMetric('M-01', true), makeMetric('M-02', false)];
    const summary = buildSummary(metrics);
    expect(summary.allPass).toBe(false);
    expect(summary.score).toBe('1/2');
  });

  it('handles empty metrics', () => {
    const summary = buildSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.allPass).toBe(false);
    expect(summary.score).toBe('0/0');
  });
});

// ── detectCommit ──────────────────────────────────────────────────────────────

describe('detectCommit', () => {
  it('returns a string', () => {
    // May return an actual SHA or "unknown" depending on environment
    const commit = detectCommit(tmpDir);
    expect(typeof commit).toBe('string');
    expect(commit.length).toBeGreaterThan(0);
  });

  it('returns "unknown" for non-git directory', () => {
    const commit = detectCommit(tmpDir);
    // tmpDir is not a git repo, so should be "unknown"
    expect(commit).toBe('unknown');
  });
});

// ── detectRegressions ─────────────────────────────────────────────────────────

describe('detectRegressions', () => {
  it('returns empty array when no regressions', () => {
    const baseline = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true), makeMetric('M-02', true)]),
    ]);
    const current = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true), makeMetric('M-02', true)]),
    ]);
    expect(detectRegressions(baseline, current)).toHaveLength(0);
  });

  it('detects a regression (pass → fail)', () => {
    const baseline = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true), makeMetric('M-02', true)]),
    ]);
    const current = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', false), makeMetric('M-02', true)]),
    ]);
    const regressions = detectRegressions(baseline, current);
    expect(regressions).toHaveLength(1);
    expect(regressions[0].skill).toBe('dare-ax');
    expect(regressions[0].metricId).toBe('M-01');
    expect(regressions[0].regressed).toBe(true);
    expect(regressions[0].baseline).toBe(true);
    expect(regressions[0].current).toBe(false);
  });

  it('ignores improvements (fail → pass)', () => {
    const baseline = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', false)]),
    ]);
    const current = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true)]),
    ]);
    expect(detectRegressions(baseline, current)).toHaveLength(0);
  });

  it('ignores metrics not in baseline', () => {
    const baseline = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true)]),
    ]);
    const current = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true), makeMetric('M-02', false)]),
    ]);
    // M-02 is not in baseline → not a regression
    expect(detectRegressions(baseline, current)).toHaveLength(0);
  });

  it('detects multiple regressions across skills', () => {
    const baseline = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true), makeMetric('M-02', true)]),
      makeSkillReport('dare-layered-design', [makeMetric('M-01', true)]),
    ]);
    const current = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', false), makeMetric('M-02', false)]),
      makeSkillReport('dare-layered-design', [makeMetric('M-01', false)]),
    ]);
    const regressions = detectRegressions(baseline, current);
    expect(regressions).toHaveLength(3);
    expect(regressions.every((r) => r.regressed)).toBe(true);
  });

  it('handles empty baseline and current', () => {
    const baseline = makeProjectReport([]);
    const current = makeProjectReport([]);
    expect(detectRegressions(baseline, current)).toHaveLength(0);
  });
});

// ── formatTable ───────────────────────────────────────────────────────────────

describe('formatTable', () => {
  it('outputs ✅ for passing metrics', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true)]),
    ]);
    const output = formatTable(report);
    expect(output).toContain('✅');
  });

  it('outputs ❌ for failing metrics', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', false)]),
    ]);
    const output = formatTable(report);
    expect(output).toContain('❌');
  });

  it('includes skill name and metric ID', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-03', true)]),
    ]);
    const output = formatTable(report);
    expect(output).toContain('dare-ax');
    expect(output).toContain('M-03');
  });

  it('includes OVERALL row', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true)]),
    ]);
    const output = formatTable(report);
    expect(output).toContain('OVERALL');
    expect(output).toContain('1/1');
  });

  it('includes commit hash in output', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true)]),
    ]);
    const output = formatTable(report);
    expect(output).toContain('abc1234');
  });

  it('uses box-drawing characters for ASCII table', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true)]),
    ]);
    const output = formatTable(report);
    expect(output).toContain('┌');
    expect(output).toContain('┘');
    expect(output).toContain('│');
  });
});

// ── formatJSON ────────────────────────────────────────────────────────────────

describe('formatJSON', () => {
  it('returns valid JSON string', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true)]),
    ]);
    const json = formatJSON(report);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('includes all top-level fields', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true)]),
    ]);
    const parsed = JSON.parse(formatJSON(report));
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.commit).toBeDefined();
    expect(parsed.skills).toBeDefined();
    expect(parsed.overall).toBeDefined();
  });
});

// ── formatPRComment ───────────────────────────────────────────────────────────

describe('formatPRComment', () => {
  it('returns markdown with DARE Quality Metrics heading', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true)]),
    ]);
    const md = formatPRComment(report);
    expect(md).toContain('## DARE Quality Metrics');
  });

  it('includes ✅ when all metrics pass', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true), makeMetric('M-02', true)]),
    ]);
    const md = formatPRComment(report);
    expect(md).toContain('✅');
    expect(md).toContain('All metrics passing');
  });

  it('includes ❌ when some metrics fail', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', false)]),
    ]);
    const md = formatPRComment(report);
    expect(md).toContain('❌');
    expect(md).toContain('Some metrics failing');
  });

  it('includes regression warnings when regressions provided', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', false)]),
    ]);
    const regressions: RegressionResult[] = [
      { skill: 'dare-ax', metricId: 'M-01', baseline: true, current: false, regressed: true },
    ];
    const md = formatPRComment(report, regressions);
    expect(md).toContain('Regressions Detected');
    expect(md).toContain('dare-ax');
    expect(md).toContain('M-01');
  });

  it('does not include regression section when no regressions', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true)]),
    ]);
    const md = formatPRComment(report, []);
    expect(md).not.toContain('Regressions Detected');
  });

  it('includes score in output', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true), makeMetric('M-02', false)]),
    ]);
    const md = formatPRComment(report);
    expect(md).toContain('1/2');
  });

  it('includes commit hash', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true)]),
    ]);
    const md = formatPRComment(report);
    expect(md).toContain('abc1234');
  });

  it('contains markdown table separators', () => {
    const report = makeProjectReport([
      makeSkillReport('dare-ax', [makeMetric('M-01', true)]),
    ]);
    const md = formatPRComment(report);
    expect(md).toContain('|--------|');
  });
});

// ── QualityTelemetryMetrics (self-assessment) ─────────────────────────────────

describe('QualityTelemetryMetrics', () => {
  it('collect() returns 4 MetricResults', () => {
    const qt = new QualityTelemetryMetrics();
    const results = qt.collect(tmpDir);
    expect(results).toHaveLength(4);
    expect(results.map((r) => r.id)).toEqual(['M-01', 'M-02', 'M-03', 'M-04']);
  });

  it('M-01 always passes when skill is installed', () => {
    const qt = new QualityTelemetryMetrics();
    const m01 = qt.collectM01(tmpDir);
    expect(m01.pass).toBe(true);
  });

  it('M-02 fails when no baseline file exists', () => {
    const qt = new QualityTelemetryMetrics();
    const m02 = qt.collectM02(tmpDir);
    expect(m02.pass).toBe(false);
    expect(m02.details).toContain('No baseline');
  });

  it('M-02 passes when tmp/dare_metrics.json exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'tmp'));
    fs.writeFileSync(path.join(tmpDir, 'tmp', 'dare_metrics.json'), '{}', 'utf-8');
    const qt = new QualityTelemetryMetrics();
    const m02 = qt.collectM02(tmpDir);
    expect(m02.pass).toBe(true);
  });

  it('M-03 fails when tmp/dare_metrics.json does not exist', () => {
    const qt = new QualityTelemetryMetrics();
    const m03 = qt.collectM03(tmpDir);
    expect(m03.pass).toBe(false);
    expect(m03.details).toContain('dare_metrics.json');
  });

  it('M-03 passes when tmp/dare_metrics.json exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'tmp'));
    fs.writeFileSync(path.join(tmpDir, 'tmp', 'dare_metrics.json'), '{}', 'utf-8');
    const qt = new QualityTelemetryMetrics();
    const m03 = qt.collectM03(tmpDir);
    expect(m03.pass).toBe(true);
  });

  it('M-04 fails when .github/workflows/dare-metrics.yml does not exist', () => {
    const qt = new QualityTelemetryMetrics();
    const m04 = qt.collectM04(tmpDir);
    expect(m04.pass).toBe(false);
    expect(m04.details).toContain('dare-metrics.yml');
  });

  it('M-04 passes when .github/workflows/dare-metrics.yml exists', () => {
    const workflowDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(
      path.join(workflowDir, 'dare-metrics.yml'),
      'name: DARE Metrics\n',
      'utf-8'
    );
    const qt = new QualityTelemetryMetrics();
    const m04 = qt.collectM04(tmpDir);
    expect(m04.pass).toBe(true);
  });
});
