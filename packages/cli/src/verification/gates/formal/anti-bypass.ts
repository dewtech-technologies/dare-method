const ASSUME_FALSE = /\bassume\s*\(?\s*false\s*\)?/;
const ENSURES_TRUE = /\bensures\s+true\b/;
const REQUIRES_TRUE = /\brequires\s+true\b/;

const CLAUSE_EXPR =
  /\b(?:ensures|requires)\s+([^;]+);/g;

const MIN_LEAK_EXPR_LEN = 8;

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Collects non-trivial ensures/requires clause bodies from a Dafny spec. */
export function extractClauses(spec: string): string[] {
  const out: string[] = [];
  for (const match of spec.matchAll(CLAUSE_EXPR)) {
    const expr = normalizeWhitespace(match[1] ?? '');
    if (expr && expr !== 'true') out.push(expr);
  }
  return out;
}

/**
 * Detecta padrões de trapaça (Vericoding §detecção-de-trapaça) na spec + impl.
 * Determinístico (regex + AST-lite). REPROVA mesmo que o solver tenha aceitado (exit 0).
 *
 * RECOMENDAÇÃO ANTI-TRAPAÇA (CLEVER, RS-01): preferir specs NÃO-COMPUTÁVEIS
 * (Prop / quantificadores ∀∃) — a checagem dura de não-computabilidade fica na
 * auditoria (task-510). Aqui detectamos os padrões triviais/vazados conhecidos.
 */
export function detectBypass(args: {
  readonly specSource: string;
  readonly implSource: string;
}): { readonly bypassDetected: boolean; readonly pattern?: string } {
  const { specSource, implSource } = args;

  if (ASSUME_FALSE.test(specSource) || ASSUME_FALSE.test(implSource)) {
    return { bypassDetected: true, pattern: 'assume(false)' };
  }

  if (ENSURES_TRUE.test(specSource)) {
    return { bypassDetected: true, pattern: 'ensures true' };
  }

  if (REQUIRES_TRUE.test(specSource)) {
    return { bypassDetected: true, pattern: 'ensures true' };
  }

  const implNorm = normalizeWhitespace(implSource);
  for (const clause of extractClauses(specSource)) {
    const norm = normalizeWhitespace(clause);
    if (norm.replace(/\s/g, '').length < MIN_LEAK_EXPR_LEN) continue;
    if (implNorm.includes(norm)) {
      return { bypassDetected: true, pattern: 'spec leaked into impl' };
    }
  }

  return { bypassDetected: false };
}

/** Stable CLI error string (BLUEPRINT §5.2). */
export function formatBypassRejection(target: string, pattern: string): string {
  return `Error: formal proof rejected — bypass pattern '${pattern}' detected in spec/impl for '${target}'.`;
}
