import { describe, it, expect } from 'vitest';
import type { DnaFacts } from '../../../utils/dna-detector.js';
import type { PatternsFacts } from '../../../utils/pattern-detector.js';
import { mergeDnaFacts, mergePatternsFacts } from '../merge-facts.js';

describe('ast/conventions/merge-facts', () => {
  it('mergeDnaFacts unions layers and library hints', () => {
    const regex: DnaFacts = {
      generatedAt: 't',
      fileInventorySource: 'module-detector',
      tooling: { linters: [], formatters: [] },
      naming: [],
      architecture: { detectedLayers: ['controllers'], guess: 'MVC' },
      testing: { testFiles: 0, prodFiles: 1, ratio: 0 },
      libraries: {},
      commits: null,
    };
    const merged = mergeDnaFacts(regex, {
      extraLayers: ['nestjs-module', 'service'],
      libraryHints: { orm: 'TypeORM' },
      diPatterns: ['nestjs-constructor-injection'],
    });
    expect(merged.architecture.detectedLayers).toContain('nestjs-module');
    expect(merged.libraries.orm).toBe('TypeORM');
    expect(merged.architecture.guess).toContain('NestJS');
  });

  it('mergePatternsFacts dedupes by id and unions evidence', () => {
    const regex: PatternsFacts = {
      generatedAt: 't',
      fileInventorySource: 'module-detector',
      patterns: [
        {
          id: 'call-idiom:controller-service',
          kind: 'call-idiom',
          description: 'regex',
          frequency: 2,
          coverage: 0.2,
          evidence: [{ file: 'a.ts', line: 1 }],
          modules: ['a'],
          marker: 'confirmed',
        },
      ],
    };
    const merged = mergePatternsFacts(regex, {
      patterns: [
        {
          id: 'call-idiom:controller-service',
          kind: 'call-idiom',
          description: 'ast',
          frequency: 3,
          coverage: 0.3,
          evidence: [{ file: 'b.ts', line: 5 }],
          modules: ['b'],
          marker: 'confirmed',
        },
        {
          id: 'structural-idiom:nest-module',
          kind: 'structural-idiom',
          description: 'nest',
          frequency: 1,
          coverage: 0.1,
          evidence: [{ file: 'm.ts', line: 2 }],
          modules: [],
          marker: 'confirmed',
        },
      ],
    });
    expect(merged.patterns).toHaveLength(2);
    const ctrl = merged.patterns.find((p) => p.id === 'call-idiom:controller-service')!;
    expect(ctrl.frequency).toBe(3);
    expect(ctrl.evidence).toHaveLength(2);
  });
});
