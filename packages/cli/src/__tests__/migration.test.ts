import { describe, it, expect } from 'vitest';
import {
  buildMigrationFacts,
  renderMigrationDoc,
  renderParityFeature,
  parityFeatureFilename,
  type ReverseArtifacts,
} from '../utils/migration.js';

const artifacts: ReverseArtifacts = {
  reverseFacts: {
    project: { name: 'atm', structure: 'backend', backend: 'php-laravel' },
    modules: [
      { id: 'src-auth', name: 'auth', path: 'src/auth', size: 'LOW' },
      { id: 'src-account', name: 'account', path: 'src/account', size: 'MED' },
    ],
    confidence: {
      counts: { confirmed: 10, inferred: 2, gap: 3, total: 15 },
      perSpec: [
        { spec: 'module-01-src-auth.md', gap: 1 },
        { spec: 'module-02-src-account.md', gap: 2 },
        { spec: 'IDEIA.md', gap: 0 },
      ],
    },
  },
  dnaFacts: {
    architecture: { guess: 'MVC' },
    testing: { framework: 'PHPUnit' },
    libraries: { orm: 'Eloquent', http: 'Laravel' },
  },
};

const facts = () => buildMigrationFacts(artifacts, 'go-gin', '2026-01-01T00:00:00.000Z');

describe('buildMigrationFacts', () => {
  it('maps source stack from dna libs, target, modules and conventions', () => {
    const f = facts();
    expect(f.source.stack).toBe('Laravel'); // dnaFacts.libraries.http wins
    expect(f.target.stack).toBe('go-gin');
    expect(f.modules.map((m) => m.id)).toEqual(['src-auth', 'src-account']);
    expect(f.conventions.architecture).toBe('MVC');
    expect(f.conventions.testing).toBe('PHPUnit');
  });

  it('derives blocking gaps from the Phase-1 confidence block (🔴 only)', () => {
    const f = facts();
    expect(f.blockingGaps.total).toBe(3);
    expect(f.blockingGaps.perSpec).toEqual([
      { spec: 'module-01-src-auth.md', gaps: 1 },
      { spec: 'module-02-src-account.md', gaps: 2 },
    ]); // IDEIA.md (gap 0) excluded
  });

  it('falls back to project.backend when dna libs absent', () => {
    const f = buildMigrationFacts(
      { reverseFacts: { project: { name: 'x', structure: 'backend', backend: 'rust-axum' }, modules: [] }, dnaFacts: null },
      'go-gin',
      '2026-01-01T00:00:00.000Z',
    );
    expect(f.source.stack).toBe('rust-axum');
    expect(f.blockingGaps.total).toBe(0);
  });
});

describe('parityFeatureFilename', () => {
  it('uses the module id with .feature extension', () => {
    expect(parityFeatureFilename(facts().modules[0])).toBe('src-auth.feature');
  });
});

describe('renderParityFeature', () => {
  it('renders a Gherkin Feature stub with AGENT placeholders', () => {
    const feat = renderParityFeature(facts().modules[0]);
    expect(feat).toContain('Feature: auth — paridade legado ↔ alvo');
    expect(feat).toContain('Scenario:');
    expect(feat).toContain('Given');
    expect(feat).toContain('# AGENT');
  });
});

describe('renderMigrationDoc', () => {
  it('renders briefing, target, blocking-gap rows and a per-module parity table', () => {
    const md = renderMigrationDoc(facts());
    expect(md).toContain('# MIGRATION — atm: Laravel → go-gin');
    expect(md).toContain('**Blocking gaps (🔴 da Fase 1):** 3');
    expect(md).toContain('| `module-02-src-account.md` | 2 |');
    expect(md).toContain('[src-auth.feature](./parity/src-auth.feature)');
    expect(md).toContain('<!-- AGENT'); // semantic sections left for the skill
  });

  it('handles zero blocking gaps gracefully', () => {
    const md = renderMigrationDoc(
      buildMigrationFacts({ reverseFacts: { project: {}, modules: [] }, dnaFacts: null }, 'rust-axum', 'now'),
    );
    expect(md).toContain('_(nenhum 🔴 registrado)_');
  });
});
