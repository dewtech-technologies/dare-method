import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonGraph } from '../json-graph.js';
import {
  ingestRequirements,
  parseRequirementsFromMarkdown,
} from '../requirement-ingest.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'requirement-ingest');

describe('requirement-ingest', () => {
  it('should_parse_rf_from_blueprint_table', () => {
    const content = fs.readFileSync(path.join(fixturesDir, 'sample-blueprint.md'), 'utf8');
    const reqs = parseRequirementsFromMarkdown(content, 'blueprint');
    expect(reqs.some((r) => r.reqId === 'RF-01' && r.title.includes('Auth'))).toBe(true);
    expect(reqs.find((r) => r.reqId === 'RF-01')?.priority).toBe('MUST');
  });

  it('should_parse_o_from_design', () => {
    const content = fs.readFileSync(path.join(fixturesDir, 'sample-design.md'), 'utf8');
    const reqs = parseRequirementsFromMarkdown(content, 'design');
    expect(reqs.some((r) => r.reqId === 'O-01')).toBe(true);
  });

  it('should_parse_task_id_from_tasks_md', () => {
    const content = fs.readFileSync(path.join(fixturesDir, 'sample-tasks.md'), 'utf8');
    const reqs = parseRequirementsFromMarkdown(content, 'tasks');
    expect(reqs.some((r) => r.reqId === 'task-101')).toBe(true);
    expect(reqs.some((r) => r.reqId === 'task-102')).toBe(true);
  });

  it('should_create_derives_from_hierarchy', () => {
    const content = fs.readFileSync(path.join(fixturesDir, 'sample-blueprint.md'), 'utf8');
    const reqs = parseRequirementsFromMarkdown(content, 'blueprint');
    const rf = reqs.find((r) => r.reqId === 'RF-01');
    expect(rf?.parentId).toBe('phase-1');
  });

  describe('ingest', () => {
    let projectRoot: string;
    let graphPath: string;
    let graph: JsonGraph;

    beforeEach(async () => {
      projectRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'req-ingest-'));
      const dareDir = path.join(projectRoot, 'DARE');
      await fs.promises.mkdir(dareDir);
      await fs.promises.copyFile(
        path.join(fixturesDir, 'sample-blueprint.md'),
        path.join(dareDir, 'BLUEPRINT-sample.md'),
      );
      graphPath = path.join(projectRoot, '.dare', 'graph.json');
      graph = new JsonGraph(graphPath);
      await graph.init();
    });

    afterEach(async () => {
      graph.close();
      await fs.promises.rm(projectRoot, { recursive: true, force: true });
    });

    it('should_ingest_into_graph_idempotently', () => {
      const first = ingestRequirements(graph, projectRoot);
      expect(first.nodes).toBeGreaterThan(0);
      const second = ingestRequirements(graph, projectRoot);
      expect(second.nodes).toBeGreaterThan(0);
      const stats = graph.getStatistics();
      expect(stats.nodesByType.requirement).toBeGreaterThanOrEqual(first.nodes);
    });
  });

  it('should_not_call_llm', () => {
    const source = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../requirement-ingest.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/\bopenai\b/i);
    expect(source).not.toMatch(/\banthropic\b/i);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
