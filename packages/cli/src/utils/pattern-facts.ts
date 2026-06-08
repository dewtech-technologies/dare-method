/**
 * PATTERNS.md skeleton generator for `dare patterns`.
 * Facts only — semantic naming/explanation via <!-- AGENT --> for /dare-dna skill.
 */
import type {
  PatternsFacts,
  DiscoveredPattern,
  PatternKind,
} from './pattern-detector.js';

const KIND_ORDER: readonly PatternKind[] = [
  'inferred-layer',
  'naming-idiom',
  'structural-idiom',
  'call-idiom',
  'implicit-decision',
];

const KIND_TITLES: Record<PatternKind, string> = {
  'inferred-layer': 'Camadas inferidas (co-ocorrência)',
  'naming-idiom': 'Idiomas de nomenclatura',
  'structural-idiom': 'Idiomas estruturais',
  'call-idiom': 'Idiomas de chamada',
  'implicit-decision': 'Decisões implícitas',
};

function fmtEvidence(pattern: DiscoveredPattern): string {
  return pattern.evidence
    .map((e) => (e.line != null ? `\`${e.file}:${e.line}\`` : `\`${e.file}\``))
    .join(', ');
}

function patternsByKind(
  patterns: readonly DiscoveredPattern[],
): Map<PatternKind, DiscoveredPattern[]> {
  const map = new Map<PatternKind, DiscoveredPattern[]>();
  for (const kind of KIND_ORDER) map.set(kind, []);
  for (const p of patterns) {
    const list = map.get(p.kind) ?? [];
    list.push(p);
    map.set(p.kind, list);
  }
  for (const kind of KIND_ORDER) {
    map.get(kind)!.sort((a, b) => a.id.localeCompare(b.id));
  }
  return map;
}

function collectGaps(
  byKind: Map<PatternKind, DiscoveredPattern[]>,
  patterns: readonly DiscoveredPattern[],
): string[] {
  const gaps: string[] = [];
  for (const kind of KIND_ORDER) {
    const list = byKind.get(kind) ?? [];
    if (list.length === 0) {
      gaps.push(`🔴 Categoria \`${kind}\`: nenhum padrão acima do limiar de frequência.`);
    }
  }
  for (const p of patterns) {
    if (p.coverage < 0.5) {
      gaps.push(
        `🔴 \`${p.id}\`: cobertura baixa (${(p.coverage * 100).toFixed(0)}%) — requer decisão humana.`,
      );
    }
  }
  return gaps;
}

export function renderPatternsSkeleton(facts: PatternsFacts): string {
  const byKind = patternsByKind(facts.patterns);
  const gaps = collectGaps(byKind, facts.patterns);

  const lines: string[] = [
    '# PATTERNS — Padrões descobertos (brownfield)',
    '',
    '> ⚠️ **Fatos gerados por `dare patterns`.** O CLI lista frequência e evidência;',
    '> seções `<!-- AGENT -->` são preenchidas por `/dare-dna` (nomear/explicar/rebaixar confiança).',
    '',
    `*Gerado: ${facts.generatedAt} · inventário via ${facts.fileInventorySource}*`,
    '',
  ];

  for (const kind of KIND_ORDER) {
    const list = byKind.get(kind) ?? [];
    lines.push(`## ${KIND_TITLES[kind]}`, '');
    if (list.length === 0) {
      lines.push('- _(nenhum detectado)_', '');
    } else {
      for (const p of list) {
        lines.push(
          `- 🟢 ${p.description} (frequência ${p.frequency}, cobertura ${(p.coverage * 100).toFixed(0)}%) — evidência: ${fmtEvidence(p)}`,
        );
        lines.push(
          '<!-- AGENT: nomeie/explique este padrão; rebaixe para 🟡 se for inferência ou 🔴 se for gap. -->',
          '',
        );
      }
    }
  }

  lines.push('## ⚠️ Incertezas', '');
  if (gaps.length === 0) {
    lines.push(
      '- _(nenhum gap determinístico — revise com a skill)_',
      '<!-- AGENT: liste gaps adicionais ou rebaixe padrões inferidos. -->',
      '',
    );
  } else {
    for (const g of gaps) lines.push(`- ${g}`);
    lines.push(
      '<!-- AGENT: complemente gaps e rebaixe confiança onde necessário. -->',
      '',
    );
  }

  lines.push(
    '---',
    '*DARE Method — padrões do projeto (brownfield). Gerado por `dare patterns`. License: MIT.*',
  );

  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
