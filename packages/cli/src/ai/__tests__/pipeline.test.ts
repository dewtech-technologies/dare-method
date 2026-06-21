import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { MockAiProvider } from '../providers.js';
import { setMockProviderFactoryForTests } from '../registry.js';
import { runCommandEnrichment } from '../pipeline.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-ai-pipeline-'));
  setMockProviderFactoryForTests(
    () =>
      new MockAiProvider(() => ({
        ok: true,
        provider: 'mock',
        raw: '{}',
        data: {
          purpose: 'Test system',
          domainGlossary: 'Foo, Bar',
        },
      })),
  );
});

afterEach(async () => {
  setMockProviderFactoryForTests(null);
  await fs.remove(tmpDir).catch(() => undefined);
});

describe('ai pipeline', () => {
  it('enriches_reverse_and_writes_semantic_file', async () => {
    await fs.ensureDir(path.join(tmpDir, 'DARE', 'REVERSE'));
    await fs.writeFile(
      path.join(tmpDir, 'DARE', 'IDEIA.md'),
      '<!-- AGENT: purpose -->\n',
    );

    const result = await runCommandEnrichment({
      command: 'reverse',
      cwd: tmpDir,
      facts: { modules: [] },
      provider: 'mock',
    });

    expect(result.ok).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, 'DARE', 'REVERSE', 'semantic-enrichment.json'))).toBe(
      true,
    );
    const ideia = await fs.readFile(path.join(tmpDir, 'DARE', 'IDEIA.md'), 'utf-8');
    expect(ideia).toContain('Test system');
  });

  it('enriches_blueprint_and_writes_blueprint_md', async () => {
    setMockProviderFactoryForTests(
      () =>
        new MockAiProvider(() => ({
          ok: true,
          provider: 'mock',
          raw: '{}',
          data: {
            architectureSummary: 'Modular monolith with API layer',
            keyDecisions: ['Use PostgreSQL', 'Expose REST first'],
          },
        })),
    );
    await fs.ensureDir(path.join(tmpDir, 'DARE'));

    const result = await runCommandEnrichment({
      command: 'blueprint',
      cwd: tmpDir,
      facts: { design: '# DESIGN' },
      provider: 'mock',
    });

    expect(result.ok).toBe(true);
    const blueprint = await fs.readFile(path.join(tmpDir, 'DARE', 'BLUEPRINT.md'), 'utf-8');
    expect(blueprint).toContain('Modular monolith');
  });

  it('migrate_rewrites_migration_md', async () => {
    setMockProviderFactoryForTests(
      () =>
        new MockAiProvider(() => ({
          ok: true,
          provider: 'mock',
          raw: '{}',
          data: {
            strategySummary: 'Strangler fig over 3 modules',
            riskAreas: ['Data migration', 'Auth parity'],
            parityNotes: 'Run Gherkin before cutover',
            blockingGaps: ['Legacy billing API undocumented'],
          },
        })),
    );
    await fs.ensureDir(path.join(tmpDir, 'DARE', 'MIGRATION'));
    await fs.writeFile(
      path.join(tmpDir, 'DARE', 'MIGRATION', 'MIGRATION.md'),
      [
        '# MIGRATION',
        '',
        '## Estratégia de Migração',
        '<!-- AGENT: big-bang vs. strangler/parallel-run. Critérios, ordem dos módulos, feature flags. -->',
        '',
        '<!-- AGENT: adicione riscos de regressão, dados, performance e mitigações. -->',
        '',
        '## Plano de Cutover & Rollback',
        '<!-- AGENT: passos de corte, validação de paridade (rodar os .feature), critério de go/no-go e rollback. -->',
        '',
        '| Spec | 🔴 | Tratamento |',
        '|---|---|---|',
        '| `legacy` | 1 | <!-- AGENT: tratamento --> |',
      ].join('\n'),
    );

    const result = await runCommandEnrichment({
      command: 'migrate',
      cwd: tmpDir,
      facts: { modules: [] },
      provider: 'mock',
    });

    expect(result.ok).toBe(true);
    const migration = await fs.readFile(
      path.join(tmpDir, 'DARE', 'MIGRATION', 'MIGRATION.md'),
      'utf-8',
    );
    expect(migration).toContain('Strangler fig over 3 modules');
    expect(migration).toContain('Data migration');
    expect(migration).toContain('Run Gherkin before cutover');
    expect(migration).toContain('Legacy billing API undocumented');
  });

  it('review_injects_verdict_without_from_agent', async () => {
    setMockProviderFactoryForTests(
      () =>
        new MockAiProvider(() => ({
          ok: true,
          provider: 'mock',
          raw: '{}',
          data: {
            passed: false,
            unmetCriteria: ['Missing edge-case tests'],
            notes: 'Add tests for null input',
          },
        })),
    );
    await fs.ensureDir(path.join(tmpDir, 'DARE'));

    const result = await runCommandEnrichment({
      command: 'review',
      cwd: tmpDir,
      facts: { taskId: 'task-001', spec: '# spec' },
      provider: 'mock',
    });

    expect(result.ok).toBe(true);
    const verdict = await fs.readJSON(path.join(tmpDir, 'DARE', 'review-semantic.json'));
    expect(verdict.passed).toBe(false);
    expect(verdict.unmetCriteria).toContain('Missing edge-case tests');
    expect(verdict.notes).toContain('null input');
  });

  it('invalid_schema_does_not_touch_artifact', async () => {
    setMockProviderFactoryForTests(
      () =>
        new MockAiProvider(() => ({
          ok: true,
          provider: 'mock',
          raw: '{}',
          data: { passed: 'not-a-boolean', unmetCriteria: [] },
        })),
    );
    await fs.ensureDir(path.join(tmpDir, 'DARE'));
    const reviewPath = path.join(tmpDir, 'DARE', 'review-semantic.json');
    await fs.writeJSON(reviewPath, { passed: true, unmetCriteria: [] });

    const result = await runCommandEnrichment({
      command: 'review',
      cwd: tmpDir,
      facts: { taskId: 'task-001' },
      provider: 'mock',
    });

    expect(result.ok).toBe(false);
    const unchanged = await fs.readJSON(reviewPath);
    expect(unchanged.passed).toBe(true);
  });
});
