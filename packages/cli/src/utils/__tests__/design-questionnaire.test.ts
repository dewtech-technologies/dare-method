import { describe, it, expect } from 'vitest';
import {
  buildDesignQuestionnaire,
  buildBlueprintQuestionnaire,
} from '../design-questionnaire.js';
import type { PatternsFacts } from '../pattern-detector.js';
import type { DnaFacts } from '../dna-detector.js';

const DNA: DnaFacts = {
  generatedAt: '2026-06-07T12:00:00.000Z',
  fileInventorySource: 'module-detector',
  tooling: { linters: [], formatters: [] },
  naming: [],
  architecture: { detectedLayers: ['a', 'b', 'c', 'd'], guess: 'unknown layered' },
  testing: { testFiles: 1, prodFiles: 5, ratio: 0.2 },
  libraries: { orm: 'prisma', http: 'express' },
  commits: null,
};

const PATTERNS: PatternsFacts = {
  generatedAt: '2026-06-07T12:00:00.000Z',
  fileInventorySource: 'module-detector',
  patterns: [
    {
      id: 'naming-idiom:service-suffix',
      kind: 'naming-idiom',
      description: '3 arquivos usam sufixo .service.ts',
      frequency: 3,
      coverage: 0.75,
      evidence: [{ file: 'src/x.service.ts' }],
      modules: ['src'],
      marker: 'confirmed',
    },
    {
      id: 'call-idiom:schema-validation',
      kind: 'call-idiom',
      description: '2 arquivos usam validação',
      frequency: 2,
      coverage: 0.2,
      evidence: [{ file: 'src/validate.ts', line: 2 }],
      modules: ['src'],
      marker: 'confirmed',
    },
    {
      id: 'implicit-decision:orm-prisma',
      kind: 'implicit-decision',
      description: 'ORM prisma em 2 arquivos',
      frequency: 2,
      coverage: 0.4,
      evidence: [{ file: 'src/db.ts' }],
      modules: ['src'],
      marker: 'confirmed',
    },
  ],
};

describe('design-questionnaire', () => {
  it('buildDesignQuestionnaire produces gap questions for low coverage', () => {
    const art = buildDesignQuestionnaire(DNA, PATTERNS);
    const gaps = art.questions.filter((q) => q.kind === 'gap');
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some((q) => q.anchoredOn.includes('call-idiom:schema-validation'))).toBe(true);
  });

  it('is deterministic (ignoring generatedAt)', () => {
    const a = buildDesignQuestionnaire(DNA, PATTERNS);
    const b = buildDesignQuestionnaire(DNA, PATTERNS);
    expect(a.questions.map((q) => q.id)).toEqual(b.questions.map((q) => q.id));
  });

  it('returns empty when both inputs null', () => {
    const art = buildDesignQuestionnaire(null, null);
    expect(art.questions).toEqual([]);
  });

  it('buildBlueprintQuestionnaire anchors architect tradeoffs', () => {
    const art = buildBlueprintQuestionnaire(PATTERNS);
    expect(art.phase).toBe('blueprint');
    expect(art.questions.some((q) => q.persona === 'architect' && q.kind === 'tradeoff')).toBe(
      true,
    );
    expect(art.questions.every((q) => q.anchoredOn.length >= 1)).toBe(true);
  });
});
