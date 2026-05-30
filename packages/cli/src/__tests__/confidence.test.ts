import { describe, it, expect } from 'vitest';
import {
  parseSpecConfidence,
  computeIndex,
  aggregate,
  renderConfidenceReport,
  renderCodeSpecMatrix,
} from '../utils/confidence.js';

const SPEC = `# Módulo: auth

## Fatos
- 🟢 **Caminho:** \`src/auth\`
- 🟢 **Linguagens:** .ts

## Claims
- 🟢 Login delega a findUser. \`src/auth/login.ts:2\`
- 🟡 Provável validação ausente. \`src/auth/login.ts:5\`
- 🔴 Política de senha não determinável. → ver gaps.md

Texto normal não é claim. \`não-conta.ts:9\`
- item de lista sem marcador, ignorado
`;

describe('parseSpecConfidence', () => {
  it('counts markers and extracts file:line evidence', () => {
    const r = parseSpecConfidence('module-01-auth.md', SPEC);
    expect(r.counts.confirmed).toBe(3); // 2 fatos + 1 claim
    expect(r.counts.inferred).toBe(1);
    expect(r.counts.gap).toBe(1);
    expect(r.counts.total).toBe(5);
    // Only evidence on marked claim lines is captured (not the plain text line).
    expect(r.evidence).toEqual(['src/auth/login.ts:2', 'src/auth/login.ts:5']);
  });

  it('ignores non-claim lines (no marker)', () => {
    const r = parseSpecConfidence('x.md', 'just prose\n- bullet\n## heading\n');
    expect(r.counts.total).toBe(0);
    expect(r.index).toBe(0);
  });
});

describe('computeIndex', () => {
  it('weights confirmed=1.0 and inferred=0.5', () => {
    expect(computeIndex({ confirmed: 9, inferred: 1, gap: 1, total: 11 })).toBe(86.4);
    expect(computeIndex({ confirmed: 4, inferred: 0, gap: 0, total: 4 })).toBe(100);
    expect(computeIndex({ confirmed: 0, inferred: 0, gap: 0, total: 0 })).toBe(0);
  });
});

describe('aggregate', () => {
  it('sums counts across specs and recomputes the index', () => {
    const specs = [
      parseSpecConfidence('a.md', '- 🟢 x\n- 🟡 y'),
      parseSpecConfidence('b.md', '- 🔴 z'),
    ];
    const { counts, index } = aggregate(specs);
    expect(counts).toEqual({ confirmed: 1, inferred: 1, gap: 1, total: 3 });
    expect(index).toBe(50); // (1 + 0.5) / 3
  });
});

describe('renderConfidenceReport', () => {
  it('renders a per-spec table with totals and the auditability caveat', () => {
    const specs = [parseSpecConfidence('module-01-auth.md', SPEC)];
    const md = renderConfidenceReport(specs, '2026-01-01T00:00:00.000Z');
    expect(md).toContain('| module-01-auth.md | 3 | 1 | 1 | 70% |');
    expect(md).toMatch(/\*\*Total\*\* \| \*\*3\*\* \| \*\*1\*\* \| \*\*1\*\*/);
    expect(md).toContain('não auditoria factual externa');
  });
});

describe('renderCodeSpecMatrix', () => {
  it('lists evidence refs per spec', () => {
    const specs = [parseSpecConfidence('module-01-auth.md', SPEC)];
    const md = renderCodeSpecMatrix(specs, '2026-01-01T00:00:00.000Z');
    expect(md).toContain('`module-01-auth.md`');
    expect(md).toContain('`src/auth/login.ts:2`');
  });

  it('handles specs with no evidence gracefully', () => {
    const specs = [parseSpecConfidence('empty.md', '- 🔴 sem evidência')];
    const md = renderCodeSpecMatrix(specs, '2026-01-01T00:00:00.000Z');
    expect(md).toContain('nenhuma evidência');
  });
});
