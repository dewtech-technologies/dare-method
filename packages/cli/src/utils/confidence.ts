/**
 * Confidence & traceability for `dare reverse --report`.
 *
 * Parses the confidence markers the `/dare-reverse` skill writes into the
 * Phase-0 specs (🟢 CONFIRMED / 🟡 INFERRED / 🔴 GAP) and computes a
 * deterministic confidence index per spec plus a code↔spec traceability
 * matrix. Because the index is *computed from markers* (not self-reported by
 * an LLM), it is reproducible and auditable.
 *
 * Concept inspired by the Reversa framework (Macedo & da Costa,
 * arXiv:2605.18684, 2026) — clean-room reimplementation, deterministic.
 *
 * License: MIT (part of DARE CLI).
 */

export type Marker = 'confirmed' | 'inferred' | 'gap';

export interface ClaimCounts {
  confirmed: number;
  inferred: number;
  gap: number;
  total: number;
}

export interface SpecConfidence {
  /** Spec label (e.g. `IDEIA.md`, `module-01-auth.md`). */
  spec: string;
  counts: ClaimCounts;
  /** Confidence index 0–100 (one decimal): (🟢·1 + 🟡·0.5) / total. */
  index: number;
  /** Unique `path:line` evidence references cited in this spec. */
  evidence: string[];
}

// A claim line: list bullet + marker emoji + text.
const MARKER_RE = /^\s*[-*]\s+(🟢|🟡|🔴)\s+/u;
// Evidence reference inside backticks ending in `:<digits>` (e.g. `src/x.ts:42`).
const EVIDENCE_RE = /`([^`]+?:\d+)`/gu;

const MARKER_KIND: Record<string, Marker> = {
  '🟢': 'confirmed',
  '🟡': 'inferred',
  '🔴': 'gap',
};

export function emptyCounts(): ClaimCounts {
  return { confirmed: 0, inferred: 0, gap: 0, total: 0 };
}

export function computeIndex(c: ClaimCounts): number {
  if (c.total === 0) return 0;
  return Math.round(((c.confirmed + 0.5 * c.inferred) / c.total) * 1000) / 10;
}

/** Parse one spec's markdown into confidence counts + evidence refs. */
export function parseSpecConfidence(spec: string, content: string): SpecConfidence {
  const counts = emptyCounts();
  const evidence = new Set<string>();

  for (const line of content.split(/\r?\n/)) {
    const m = MARKER_RE.exec(line);
    if (!m) continue;
    counts[MARKER_KIND[m[1]]]++;
    counts.total++;
    EVIDENCE_RE.lastIndex = 0;
    let e: RegExpExecArray | null;
    while ((e = EVIDENCE_RE.exec(line)) !== null) evidence.add(e[1]);
  }

  return { spec, counts, index: computeIndex(counts), evidence: [...evidence].sort() };
}

export function aggregate(specs: SpecConfidence[]): { counts: ClaimCounts; index: number } {
  const counts = emptyCounts();
  for (const s of specs) {
    counts.confirmed += s.counts.confirmed;
    counts.inferred += s.counts.inferred;
    counts.gap += s.counts.gap;
    counts.total += s.counts.total;
  }
  return { counts, index: computeIndex(counts) };
}

export function renderConfidenceReport(specs: SpecConfidence[], generatedAt: string): string {
  const { counts, index } = aggregate(specs);
  const rows = specs.map(
    (s) => `| ${s.spec} | ${s.counts.confirmed} | ${s.counts.inferred} | ${s.counts.gap} | ${s.index}% |`,
  );
  return [
    '# Confidence Report — engenharia reversa',
    '',
    `*Gerado: ${generatedAt}*`,
    '',
    '> Marcação: 🟢 CONFIRMED (evidência direta no código) · 🟡 INFERRED (padrão/dedução) · 🔴 GAP (não determinável).',
    '> Índice = (🟢·1.0 + 🟡·0.5) / total. **É a classificação do pipeline, não auditoria factual externa.**',
    '',
    '| Spec | 🟢 | 🟡 | 🔴 | Índice |',
    '|---|---|---|---|---|',
    ...rows,
    `| **Total** | **${counts.confirmed}** | **${counts.inferred}** | **${counts.gap}** | **${index}%** |`,
    '',
    `**${counts.total} claims** · ${counts.gap} gap(s) para validação humana (ver \`gaps.md\`).`,
    '',
    '---',
    '*DARE Method — Fase 0 brownfield. Conceito de confiança inspirado em Reversa (arXiv:2605.18684), '
      + 'computado deterministicamente a partir dos marcadores. License: MIT.*',
  ].join('\n') + '\n';
}

export function renderCodeSpecMatrix(specs: SpecConfidence[], generatedAt: string): string {
  const rows = specs
    .filter((s) => s.evidence.length > 0)
    .map((s) => `| \`${s.spec}\` | ${s.evidence.map((e) => `\`${e}\``).join(', ')} |`);
  return [
    '# Code ↔ Spec Matrix (rastreabilidade)',
    '',
    `*Gerado: ${generatedAt}*`,
    '',
    'Cada spec e os arquivos de código citados como evidência nas suas afirmações.',
    '',
    '| Spec | Evidência (arquivo:linha) |',
    '|---|---|',
    ...(rows.length ? rows : ['| _(nenhuma evidência `arquivo:linha` citada ainda)_ | — |']),
    '',
    '---',
    '*DARE Method — rastreabilidade brownfield. License: MIT.*',
  ].join('\n') + '\n';
}
