import { describe, it, expect } from 'vitest';
import type { DnaFacts } from '../utils/dna-detector.js';
import { renderDnaSkeleton } from '../utils/dna-facts.js';

const facts = (over: Partial<DnaFacts> = {}): DnaFacts => ({
  generatedAt: '2026-01-01T00:00:00.000Z',
  fileInventorySource: 'module-detector',
  tooling: {
    linters: [{ name: 'ESLint', configPath: '.eslintrc.json' }],
    formatters: [{ name: 'Prettier', configPath: '.prettierrc', rules: { semi: false, singleQuote: true } }],
  },
  naming: [{ extension: '.ts', dominant: 'kebab-case', counts: { 'kebab-case': 3 }, samples: ['a-b.ts'] }],
  architecture: { detectedLayers: ['controllers', 'services'], guess: 'Layered (Controller → Service)' },
  testing: { framework: 'Vitest', testFiles: 10, prodFiles: 40, ratio: 0.25 },
  libraries: { orm: 'Prisma', http: 'NestJS', validation: 'Zod' },
  commits: { sampled: 50, conventional: true, prefixes: { feat: 20, fix: 15 } },
  ...over,
});

describe('renderDnaSkeleton', () => {
  it('embeds deterministic facts and AGENT placeholders', () => {
    const md = renderDnaSkeleton(facts());
    expect(md).toContain('# PROJECT-DNA');
    expect(md).toContain('**Prettier** (`.prettierrc`)');
    expect(md).toContain('semi: false');
    expect(md).toContain('| `.ts` | kebab-case |');
    expect(md).toContain('Layered (Controller → Service)');
    expect(md).toContain('| ORM / Dados | Prisma |');
    expect(md).toContain('Vitest');
    expect(md).toContain('<!-- AGENT'); // semantic sections left for the skill
    expect(md).toContain('Regras de Ouro do Projeto');
  });

  it('renders the conventional-commits summary with prefixes', () => {
    const md = renderDnaSkeleton(facts());
    expect(md).toMatch(/\*\*segue Conventional Commits\*\*/);
    expect(md).toContain('feat:20');
  });

  it('notes when git is unavailable', () => {
    const md = renderDnaSkeleton(facts({ commits: null }));
    expect(md).toContain('repositório git indisponível');
  });

  it('handles empty tooling gracefully', () => {
    const md = renderDnaSkeleton(facts({ tooling: { linters: [], formatters: [] } }));
    expect(md).toContain('_(nenhum detectado)_');
  });
});
