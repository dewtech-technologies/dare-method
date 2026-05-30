/**
 * Migration planning for `dare migrate` (Phase 2 brownfield).
 *
 * Consumes the reverse/dna artifacts and produces a migration plan skeleton +
 * one Gherkin parity feature stub per module. The CLI is deterministic (reads
 * facts, lists blocking gaps from the Phase-1 confidence markers, scaffolds
 * skeletons); the `/dare-migrate` skill writes the real strategy, risk
 * analysis, and parity scenarios.
 *
 * Concept inspired by the Reversa migration team + parity scenarios
 * (Macedo & da Costa, arXiv:2605.18684, 2026) — clean-room, deterministic.
 *
 * License: MIT (part of DARE CLI).
 */

import fs from 'fs-extra';
import path from 'path';

export interface KnownTarget {
  value: string;
  label: string;
}

/** Target stacks we give tailored hints for. `--to` also accepts free text. */
export const KNOWN_TARGETS: KnownTarget[] = [
  { value: 'go-gin', label: '🐹 Go (Gin / stdlib)' },
  { value: 'rust-axum', label: '🦀 Rust (Axum)' },
  { value: 'node-nestjs', label: '🟢 Node.js (NestJS)' },
  { value: 'python-fastapi', label: '🐍 Python (FastAPI)' },
  { value: 'php-laravel', label: '🐘 PHP (Laravel)' },
  { value: 'ruby-rails-8', label: '💎 Ruby (Rails 8)' },
  { value: 'react', label: '⚛️  React' },
  { value: 'vue', label: '💚 Vue' },
];

export interface MigrationModule {
  id: string;
  name: string;
  path: string;
  size: string;
}

export interface BlockingGap {
  spec: string;
  gaps: number;
}

export interface MigrationFacts {
  generatedAt: string;
  source: {
    name: string;
    structure: string;
    stack: string;
  };
  target: { stack: string };
  modules: MigrationModule[];
  blockingGaps: {
    total: number;
    perSpec: BlockingGap[];
  };
  conventions: {
    architecture?: string;
    testing?: string;
    libraries?: Record<string, string | undefined>;
  };
}

export interface ReverseArtifacts {
  reverseFacts: Record<string, any>;
  dnaFacts: Record<string, any> | null;
}

/** Path to the reverse-facts.json that `dare migrate` requires. */
export function reverseFactsPath(root: string): string {
  return path.join(root, 'DARE', 'REVERSE', 'reverse-facts.json');
}

export async function loadReverseArtifacts(root: string): Promise<ReverseArtifacts | null> {
  const rfPath = reverseFactsPath(root);
  if (!(await fs.pathExists(rfPath))) return null;
  const reverseFacts = await fs.readJSON(rfPath).catch(() => null);
  if (!reverseFacts) return null;
  const dnaPath = path.join(root, 'DARE', 'dna-facts.json');
  const dnaFacts = (await fs.pathExists(dnaPath))
    ? await fs.readJSON(dnaPath).catch(() => null)
    : null;
  return { reverseFacts, dnaFacts };
}

export function buildMigrationFacts(
  artifacts: ReverseArtifacts,
  target: string,
  generatedAt: string,
): MigrationFacts {
  const { reverseFacts, dnaFacts } = artifacts;
  const project = reverseFacts.project ?? {};
  const modules: MigrationModule[] = (reverseFacts.modules ?? []).map((m: any) => ({
    id: m.id,
    name: m.name,
    path: m.path,
    size: m.size,
  }));

  // Blocking gaps come from the Phase-1 confidence block (🔴 per spec).
  const perSpec: BlockingGap[] = [];
  let total = 0;
  const conf = reverseFacts.confidence;
  if (conf?.perSpec) {
    for (const s of conf.perSpec) {
      if (s.gap > 0) {
        perSpec.push({ spec: s.spec, gaps: s.gap });
        total += s.gap;
      }
    }
  }

  const sourceStack =
    dnaFacts?.libraries?.http ||
    project.backend ||
    project.frontend ||
    project.structure ||
    'desconhecida';

  return {
    generatedAt,
    source: {
      name: project.name ?? 'projeto',
      structure: project.structure ?? 'unknown',
      stack: sourceStack,
    },
    target: { stack: target },
    modules,
    blockingGaps: { total, perSpec },
    conventions: {
      architecture: dnaFacts?.architecture?.guess,
      testing: dnaFacts?.testing?.framework,
      libraries: dnaFacts?.libraries,
    },
  };
}

// ── Renderers ───────────────────────────────────────────────────────────────

/** A safe file slug for a per-module .feature filename. */
export function parityFeatureFilename(mod: MigrationModule): string {
  return `${mod.id}.feature`;
}

export function renderParityFeature(mod: MigrationFacts['modules'][number]): string {
  return [
    `# Parity feature — módulo: ${mod.name} (\`${mod.path}\`)`,
    `# AGENT: escreva os Scenarios reais de paridade extraídos do comportamento legado`,
    `# (um Scenario por fluxo observável; Given/When/Then; resultado idêntico ao legado).`,
    '',
    `Feature: ${mod.name} — paridade legado ↔ alvo`,
    '',
    '  # AGENT: substitua pelo cenário real',
    '  Scenario: <comportamento a preservar>',
    '    Given <estado inicial do legado>',
    '    When <ação do usuário/sistema>',
    '    Then <resultado idêntico ao legado>',
    '',
  ].join('\n');
}

export function renderMigrationDoc(facts: MigrationFacts): string {
  const libs = facts.conventions.libraries
    ? Object.entries(facts.conventions.libraries)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')
    : '—';

  const gapRows = facts.blockingGaps.perSpec.length
    ? facts.blockingGaps.perSpec.map((g) => `| \`${g.spec}\` | ${g.gaps} | <!-- AGENT: tratamento --> |`)
    : ['| _(nenhum 🔴 registrado)_ | 0 | — |'];

  const moduleRows = facts.modules.length
    ? facts.modules.map((m) => `| ${m.name} | \`${m.path}\` | ${m.size} | [${parityFeatureFilename(m)}](./parity/${parityFeatureFilename(m)}) |`)
    : ['| _(nenhum módulo)_ | — | — | — |'];

  return [
    `# MIGRATION — ${facts.source.name}: ${facts.source.stack} → ${facts.target.stack}`,
    '',
    '> ⚠️ Plano de migração inferido. Seções `<!-- AGENT -->` são preenchidas por `/dare-migrate`.',
    '> Consome `reverse` (o quê) + `dna` (como) e produz contratos de **paridade** para uma',
    '> reimplementação segura. Revise antes de executar.',
    '',
    `*Gerado: ${facts.generatedAt}*`,
    '',
    '## Briefing (determinístico)',
    '',
    `- **Origem:** ${facts.source.stack} (estrutura: ${facts.source.structure})`,
    `- **Alvo:** ${facts.target.stack}`,
    `- **Módulos:** ${facts.modules.length}`,
    `- **Arquitetura (DNA):** ${facts.conventions.architecture ?? '—'}`,
    `- **Testes (DNA):** ${facts.conventions.testing ?? '—'}`,
    `- **Libs (DNA):** ${libs}`,
    `- **Blocking gaps (🔴 da Fase 1):** ${facts.blockingGaps.total}`,
    '',
    '## Decisão de Paradigma',
    '<!-- AGENT: origem e alvo mudam de paradigma (procedural→OO, monólito→serviços, etc.)? '
      + 'Registre a decisão e a justificativa. Se for o mesmo paradigma, diga "preservado". -->',
    '',
    '## Estratégia de Migração',
    '<!-- AGENT: big-bang vs. strangler/parallel-run. Critérios, ordem dos módulos, feature flags. -->',
    '',
    '## Registro de Risco',
    '',
    'Blocking gaps herdados da Fase 1 (🔴 = não determinável pelo código → risco de reimplementação):',
    '',
    '| Spec | 🔴 | Tratamento |',
    '|---|---|---|',
    ...gapRows,
    '',
    '<!-- AGENT: adicione riscos de regressão, dados, performance e mitigações. -->',
    '',
    '## Arquitetura-alvo',
    '<!-- AGENT: desenhe a arquitetura na stack-alvo, alinhada ao DNA (camadas/convenções) quando o '
      + 'paradigma for preservado, ou justifique a nova organização. -->',
    '',
    '## Plano de Cutover & Rollback',
    '<!-- AGENT: passos de corte, validação de paridade (rodar os .feature), critério de go/no-go e rollback. -->',
    '',
    '## Cenários de Paridade',
    '',
    'Um arquivo Gherkin por módulo (contrato comportamental legado ↔ alvo):',
    '',
    '| Módulo | Caminho | Tamanho | Feature |',
    '|---|---|---|---|',
    ...moduleRows,
    '',
    '## Próximos Passos',
    '',
    '1. Revisar este plano e preencher os `.feature` de paridade.',
    '2. Resolver/registrar os blocking gaps com o humano.',
    '3. Reimplementar na stack-alvo com `dare design`/`blueprint`/`execute`, usando os `.feature` como aceite.',
    '',
    '---',
    '*DARE Method — Fase 2 brownfield. Migração + paridade inspirada em Reversa (arXiv:2605.18684). License: MIT.*',
  ].join('\n') + '\n';
}
