/**
 * PROJECT-DNA.md skeleton generator for `dare dna`.
 *
 * Turns the deterministic `DnaFacts` into a `DARE/PROJECT-DNA.md` skeleton:
 * facts are pre-filled; the judgment calls (architecture name, golden rules,
 * error/validation patterns) are `<!-- AGENT -->` placeholders for the
 * `/dare-dna` skill to complete. The CLI never calls an LLM.
 *
 * License: MIT (part of DARE CLI).
 */

import type { DnaFacts, ToolingConfig, NamingByExt } from './dna-detector.js';

function fmtTooling(items: ToolingConfig[]): string[] {
  if (items.length === 0) return ['- _(nenhum detectado)_'];
  return items.map((t) => {
    const rules = t.rules && Object.keys(t.rules).length
      ? ` — ${Object.entries(t.rules).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')}`
      : '';
    return `- **${t.name}** (\`${t.configPath}\`)${rules}`;
  });
}

function fmtNaming(items: NamingByExt[]): string[] {
  if (items.length === 0) return ['| _(sem arquivos)_ | — | — |'];
  return items.map((n) => {
    const samples = n.samples.map((s) => `\`${s}\``).join(', ');
    return `| \`${n.extension}\` | ${n.dominant} | ${samples} |`;
  });
}

export function renderDnaSkeleton(facts: DnaFacts): string {
  const t = facts.testing;
  const libs = facts.libraries;
  const libRows = [
    ['ORM / Dados', libs.orm],
    ['HTTP / Framework', libs.http],
    ['Auth', libs.auth],
    ['Validação', libs.validation],
  ].map(([k, v]) => `| ${k} | ${v ?? '—'} |`);

  const commitLine = facts.commits
    ? `Amostra de ${facts.commits.sampled} commits — **${facts.commits.conventional ? 'segue' : 'não segue'} Conventional Commits**`
      + (Object.keys(facts.commits.prefixes).length
        ? ` (prefixos: ${Object.entries(facts.commits.prefixes).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p}:${n}`).join(', ')})`
        : '')
    : '_(repositório git indisponível — convenção de commits não detectada)_';

  const lines: string[] = [
    `# PROJECT-DNA — Convenções do Projeto`,
    '',
    '> ⚠️ **DNA inferido por `dare dna`.** Descreve COMO este codebase faz as coisas, para o agente',
    '> seguir o padrão da casa (não o default genérico). Seções `<!-- AGENT -->` são preenchidas por',
    '> `/dare-dna`. Revise: convenções de legado costumam ser inconsistentes.',
    '',
    `*Gerado: ${facts.generatedAt} · inventário via ${facts.fileInventorySource}*`,
    '',
    '## Stack & Tooling',
    '',
    '**Linters:**',
    ...fmtTooling(facts.tooling.linters),
    '',
    '**Formatters:**',
    ...fmtTooling(facts.tooling.formatters),
    '',
    '## Convenções de Nomenclatura',
    '',
    '| Extensão | Estilo dominante | Amostras |',
    '|---|---|---|',
    ...fmtNaming(facts.naming),
    '',
    '<!-- AGENT: confirme o estilo e descreva exceções relevantes (ex.: componentes em PascalCase, utils em kebab). -->',
    '',
    '## Arquitetura & Camadas',
    '',
    `- **Camadas detectadas:** ${facts.architecture.detectedLayers.length ? facts.architecture.detectedLayers.join(', ') : '—'}`,
    `- **Palpite do CLI:** ${facts.architecture.guess}`,
    '',
    '<!-- AGENT: nomeie o padrão arquitetural com confiança e escreva as regras de onde cada coisa mora '
      + '(ex.: "controllers só orquestram; regra de negócio vai em services"). -->',
    '',
    '## Padrões de Teste',
    '',
    `- **Framework:** ${t.framework ?? '—'}`,
    `- **Cobertura aproximada:** ${t.testFiles} arquivos de teste / ${t.prodFiles} de produção (razão ${t.ratio})`,
    '',
    '<!-- AGENT: descreva o estilo de teste (onde ficam, naming, assertions reais, uso de mocks/fixtures). -->',
    '',
    '## Bibliotecas-chave',
    '',
    '| Categoria | Biblioteca |',
    '|---|---|',
    ...libRows,
    '',
    '## Convenção de Commits',
    '',
    commitLine,
    '',
    '## Tratamento de Erros & Validação',
    '<!-- AGENT: inferido do código — como erros são tratados (exceptions, Result/Either, try/catch) e '
      + 'como inputs são validados. Dê exemplos concretos do projeto. -->',
    '',
    '## Regras de Ouro do Projeto',
    '<!-- AGENT: liste o que SEMPRE e o que NUNCA fazer neste codebase, para uma nova feature respeitar o legado. -->',
    '',
    '## ⚠️ Incertezas / Inconsistências',
    '<!-- AGENT: convenções ambíguas ou misturadas que o humano precisa decidir. -->',
    '',
    '---',
    '*DARE Method — DNA do projeto (brownfield). Gerado por `dare dna`. License: MIT.*',
  ];

  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
