import { describe, it, expect } from 'vitest';
import { renderPatternsSkeleton } from '../pattern-facts.js';
import type { PatternsFacts } from '../pattern-detector.js';

const FIXTURE: PatternsFacts = {
  generatedAt: '2026-06-07T12:00:00.000Z',
  fileInventorySource: 'module-detector',
  patterns: [
    {
      id: 'naming-idiom:service-suffix',
      kind: 'naming-idiom',
      description: '3 arquivos usam sufixo .service.ts',
      frequency: 3,
      coverage: 0.75,
      evidence: [{ file: 'src/auth/auth.service.ts' }, { file: 'src/users/users.service.ts', line: 1 }],
      modules: ['auth', 'users'],
      marker: 'confirmed',
    },
    {
      id: 'call-idiom:schema-validation',
      kind: 'call-idiom',
      description: '2 arquivos usam validação z./schema.parse',
      frequency: 2,
      coverage: 0.25,
      evidence: [{ file: 'src/validate.ts', line: 2 }],
      modules: ['src'],
      marker: 'confirmed',
    },
  ],
};

describe('renderPatternsSkeleton', () => {
  it('is deterministic for fixed input', () => {
    const a = renderPatternsSkeleton(FIXTURE);
    const b = renderPatternsSkeleton(FIXTURE);
    expect(a).toBe(b);
    expect(a).toMatchSnapshot();
  });

  it('includes all PatternKind sections even when empty', () => {
    const md = renderPatternsSkeleton(FIXTURE);
    expect(md).toContain('## Camadas inferidas');
    expect(md).toContain('## Idiomas estruturais');
    expect(md).toContain('_(nenhum detectado)_');
  });

  it('lists low-coverage patterns in Incertezas', () => {
    const md = renderPatternsSkeleton(FIXTURE);
    expect(md).toContain('## ⚠️ Incertezas');
    expect(md).toContain('call-idiom:schema-validation');
    expect(md).toContain('cobertura baixa');
  });

  it('uses factual claims and AGENT placeholders only', () => {
    const md = renderPatternsSkeleton(FIXTURE);
    expect(md).toContain('🟢 3 arquivos usam sufixo');
    expect(md).toContain('<!-- AGENT:');
    expect(md).not.toMatch(/\b(probably|likely|seems)\b/i);
  });
});
