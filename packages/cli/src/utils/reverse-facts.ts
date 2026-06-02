/**
 * Reverse-engineering fact assembly + artifact skeletons for `dare reverse`.
 *
 * The CLI half of `dare reverse`: it composes deterministic facts (stack +
 * module graph) into `reverse-facts.json`, an `IDEIA.md` index (Phase 0
 * pre-architecture) with an embedded Mermaid module map, one
 * `REVERSE/module-*.md` per module, and an editable `architecture.excalidraw`.
 *
 * Everything semantic — inferred purpose, responsibilities, flow diagrams — is
 * left as `<!-- AGENT: … -->` placeholders for the `/dare-reverse` skill to
 * fill in the IDE. The CLI never calls an LLM.
 *
 * License: MIT (part of DARE CLI).
 */

import type { DetectedProject } from './project-detector.js';
import type { ModuleGraph, ModuleInfo, SizeBucket } from './module-detector.js';
import type { DataModel, Entity, Endpoint } from './datamodel.js';
import {
  renderGraphMermaid,
  renderGraphExcalidraw,
  serializeExcalidraw,
  type GraphNode,
} from './graph-renderer.js';

export interface ReverseFacts {
  generatedAt: string;
  project: {
    name: string;
    structure: string;
    backend?: string;
    frontend?: string;
    confidence: string;
    evidence: string[];
  };
  strategy: string;
  summary: {
    moduleCount: number;
    totalFiles: number;
    totalTestFiles: number;
    totalLoc: number;
  };
  modules: ModuleInfo[];
}

/** Same palette as the DAG complexity legend, repurposed for module size. */
const SIZE_COLORS: Record<SizeBucket, { bg: string; stroke: string }> = {
  LOW: { bg: '#e3f2fd', stroke: '#1976d2' }, // small — azure
  MED: { bg: '#fff3e0', stroke: '#e65100' }, // medium — orange
  HIGH: { bg: '#fce4ec', stroke: '#c2185b' }, // large/hotspot — pink
};

export function buildFacts(
  detected: DetectedProject,
  graph: ModuleGraph,
  generatedAt: string,
): ReverseFacts {
  const totalFiles = graph.modules.reduce((s, m) => s + m.fileCount, 0);
  const totalTestFiles = graph.modules.reduce((s, m) => s + m.testFileCount, 0);
  const totalLoc = graph.modules.reduce((s, m) => s + m.loc, 0);
  return {
    generatedAt,
    project: {
      name: detected.name,
      structure: detected.structure,
      backend: detected.backend,
      frontend: detected.frontend,
      confidence: detected.confidence,
      evidence: detected.evidence,
    },
    strategy: graph.strategy,
    summary: {
      moduleCount: graph.modules.length,
      totalFiles,
      totalTestFiles,
      totalLoc,
    },
    modules: graph.modules,
  };
}

// ── Diagram helpers ────────────────────────────────────────────────────────────

function moduleToGraphNode(m: ModuleInfo): GraphNode {
  const colors = SIZE_COLORS[m.size];
  return {
    id: m.id,
    depends_on: m.depends_on,
    labelLines: [m.name, `${m.loc} LOC · ${m.fileCount} files`, `[${m.size}]`],
    bg: colors.bg,
    stroke: colors.stroke,
  };
}

export function renderModuleMapMermaid(facts: ReverseFacts): string {
  if (facts.modules.length === 0) return '%% (no modules detected)';
  return renderGraphMermaid(facts.modules.map(moduleToGraphNode), {
    headerComment: `DARE reverse — ${facts.project.name} module map`,
    direction: 'LR',
    styling: 'inline',
  });
}

export function renderArchitectureExcalidraw(facts: ReverseFacts): string {
  const data = renderGraphExcalidraw(facts.modules.map(moduleToGraphNode), {
    source: 'dare-reverse',
  });
  return serializeExcalidraw(data);
}

// ── Markdown skeletons ──────────────────────────────────────────────────────────

/** Kebab id → numbered module spec filename, e.g. `module-01-auth.md`. */
export function moduleSpecFilename(index: number, mod: ModuleInfo): string {
  const num = String(index + 1).padStart(2, '0');
  return `module-${num}-${mod.id}.md`;
}

/** Renders the "Modelo de Dados" section: real entities table when extracted. */
function renderDataModelSection(model?: DataModel): string[] {
  if (!model || model.entities.length === 0) {
    return [
      '## Modelo de Dados (reconstruído)',
      '<!-- AGENT: liste as entidades, campos-chave e relacionamentos inferidos de migrations/models. -->',
    ];
  }
  const CAP = 60;
  const shown = model.entities.slice(0, CAP);
  const rows = shown.map((e: Entity) => {
    const fields = e.fields.slice(0, 8).map((f) => f.name).join(', ') || '—';
    const rels = e.relations.map((r) => `${r.kind} ${r.to}`).join('; ') || '—';
    return `| \`${e.name}\` | ${fields} | ${rels} | \`${e.source}\` |`;
  });
  const more = model.entities.length > CAP ? [`\n_+${model.entities.length - CAP} entidades — ver \`REVERSE/erd.md\` (rode \`--deep\`)._`] : [];
  return [
    `## Modelo de Dados (reconstruído) — ${model.entities.length} entidades 🟢`,
    '',
    '> Extraído deterministicamente (Prisma/SQL/ORM/`*.entity.*`). `<!-- AGENT -->` deve adicionar significado de negócio + relacionamentos faltantes.',
    '',
    '| Entidade | Campos-chave | Relações | Origem |',
    '|---|---|---|---|',
    ...rows,
    ...more,
  ];
}

/** Renders the "Superfície de API" section: real endpoints table when extracted. */
function renderApiSection(model?: DataModel): string[] {
  if (!model || model.endpoints.length === 0) {
    return [
      '## Superfície de API',
      '<!-- AGENT: liste os endpoints/contratos inferidos de rotas/controllers (método, rota, propósito). -->',
    ];
  }
  const CAP = 80;
  const sorted = [...model.endpoints].sort((a, b) =>
    a.route === b.route ? a.method.localeCompare(b.method) : a.route.localeCompare(b.route),
  );
  const shown = sorted.slice(0, CAP);
  const rows = shown.map((e: Endpoint) => `| ${e.method} | \`${e.route}\` | \`${e.source}\` |`);
  const more = model.endpoints.length > CAP ? [`\n_+${model.endpoints.length - CAP} endpoints — ver \`REVERSE/api-surface.md\` (rode \`--deep\`)._`] : [];
  return [
    `## Superfície de API — ${model.endpoints.length} endpoints 🟢`,
    '',
    '> Extraído deterministicamente de rotas/controllers (Nest/Express/Laravel/FastAPI/Gin/Axum), com evidência `arquivo:linha`. `<!-- AGENT -->` deve adicionar o propósito de cada endpoint.',
    '',
    '| Método | Rota | Origem |',
    '|---|---|---|',
    ...rows,
    ...more,
  ];
}

export function renderIdeiaSkeleton(
  facts: ReverseFacts,
  withExcalidraw: boolean,
  model?: DataModel,
): string {
  const { project, summary } = facts;
  const lines: string[] = [
    `# IDEIA — ${project.name}`,
    '',
    '> ⚠️ **Rascunho INFERIDO por engenharia reversa (`dare reverse`).**',
    '> Esta é a Fase 0 / pré-arquitetura. Revise e corrija antes de promover a `DESIGN.md`.',
    '> Seções marcadas `<!-- AGENT -->` devem ser preenchidas por `/dare-reverse` na sua IDE.',
    '> Confiança por claim: 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP. Após marcar, rode `dare reverse --report`.',
    '',
    `*Gerado: ${facts.generatedAt}*`,
    '',
    '## Propósito Inferido',
    '<!-- AGENT: descreva, em 2-4 frases, o que este software faz e por quê, com base nos módulos abaixo. -->',
    '',
    '## Domínio & Conceitos',
    '<!-- AGENT: liste as entidades de negócio e o glossário do domínio inferidos do modelo de dados e dos nomes. -->',
    '',
    '## Stack Detectada',
    '',
    `- **Estrutura:** ${project.structure} (confiança: ${project.confidence})`,
    project.backend ? `- **Backend:** ${project.backend}` : '',
    project.frontend ? `- **Frontend:** ${project.frontend}` : '',
    '',
    '<details><summary>Evidências da detecção</summary>',
    '',
    ...project.evidence.map((e) => `- ${e}`),
    '',
    '</details>',
    '',
    '## Mapa de Módulos',
    '',
    `Estratégia de fronteira: \`${facts.strategy}\` · `
      + `${summary.moduleCount} módulos · ${summary.totalFiles} arquivos · `
      + `${summary.totalLoc} LOC · ${summary.totalTestFiles} arquivos de teste`,
    '',
    '> Cor = tamanho do módulo: 🔵 LOW · 🟠 MED · 🔴 HIGH.',
    '',
    '```mermaid',
    renderModuleMapMermaid(facts),
    '```',
    '',
    '| Módulo | Caminho | Tamanho | Arquivos | LOC | Depende de | Spec |',
    '|---|---|---|---|---|---|---|',
    ...facts.modules.map((m, i) => {
      const deps = m.depends_on.length ? m.depends_on.join(', ') : '—';
      const spec = moduleSpecFilename(i, m);
      return `| ${m.name} | \`${m.path}\` | ${m.size} | ${m.fileCount} | ${m.loc} | ${deps} | [${spec}](./REVERSE/${spec}) |`;
    }),
    '',
    '## Fluxo do Sistema',
    '<!-- AGENT: desenhe um flowchart Mermaid (flowchart TD) do fluxo principal de request/dados ' +
      'atravessando os módulos — ex.: request → auth → domínio → persistência. -->',
    '',
    '```mermaid',
    'flowchart TD',
    '  %% AGENT: substitua pelo fluxo real do sistema',
    '```',
    '',
    ...renderDataModelSection(model),
    '',
    ...renderApiSection(model),
    '',
    '## ⚠️ Incertezas / Gaps',
    '<!-- AGENT: liste o que NÃO foi possível inferir com segurança e perguntas que o humano precisa responder. -->',
    '',
    '## Próximos Passos',
    '',
    '1. Revisar este `IDEIA.md` e os specs em `REVERSE/` (marcar 🟢/🟡/🔴) e rodar `dare reverse --report`.',
    withExcalidraw
      ? '2. Abrir `REVERSE/architecture.excalidraw` em https://excalidraw.com para editar o mapa.'
      : '2. (Diagrama Excalidraw não gerado — rode sem `--no-excalidraw` para criá-lo.)',
    '3. Promover a `DESIGN.md` com `dare design` e seguir o fluxo DARE normal.',
    '',
    '---',
    '*Fase 0 (brownfield) — DARE Method. Gerado por `dare reverse`. License: MIT.*',
  ];
  // Conditional lines above push '' when absent; collapse the resulting gaps.
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

// ── Deep (Fase 3) skeletons ─────────────────────────────────────────────────

/** C4 component view — deterministic from the module map. */
export function renderC4Component(facts: ReverseFacts): string {
  return [
    '# C4 — Nível 3: Componentes',
    '',
    `*Gerado: ${facts.generatedAt}*`,
    '',
    '> 🟢 Derivado deterministicamente do mapa de módulos do `dare reverse`.',
    '',
    '```mermaid',
    renderModuleMapMermaid(facts),
    '```',
    '',
    '| Componente (módulo) | Caminho | Tamanho | Depende de |',
    '|---|---|---|---|',
    ...facts.modules.map(
      (m) => `| ${m.name} | \`${m.path}\` | ${m.size} | ${m.depends_on.join(', ') || '—'} |`,
    ),
    '',
    '---',
    '*DARE Method — C4 componentes (determinístico). License: MIT.*',
  ].join('\n') + '\n';
}

function deepSkeleton(title: string, generatedAt: string, body: string[]): string {
  return [
    `# ${title}`,
    '',
    `*Gerado: ${generatedAt}*`,
    '',
    '> ⚠️ Esqueleto inferido — preenchido por `/dare-reverse` (Fase 3). Marque 🟢/🟡/🔴 com evidência.',
    '',
    ...body,
    '',
    '---',
    '*DARE Method — Fase 3 brownfield. License: MIT.*',
  ].join('\n') + '\n';
}

export function renderDomainRulesSkeleton(generatedAt: string): string {
  return deepSkeleton('Regras de Negócio', generatedAt, [
    '<!-- AGENT: liste as regras de negócio inferidas do código — validações, invariantes, cálculos, '
      + 'políticas. Uma por linha, marcada 🟢/🟡/🔴 com `arquivo:linha`. -->',
  ]);
}

export function renderStateMachinesSkeleton(generatedAt: string): string {
  return deepSkeleton('State Machines', generatedAt, [
    '<!-- AGENT: para cada entidade/fluxo com estados, desenhe um stateDiagram com os estados e '
      + 'transições observados no código. -->',
    '',
    '```mermaid',
    'stateDiagram-v2',
    '  %% AGENT: substitua pelos estados/transições reais',
    '  [*] --> Estado1',
    '```',
  ]);
}

export function renderPermissionsSkeleton(generatedAt: string): string {
  return deepSkeleton('Permissões & Autorização', generatedAt, [
    '<!-- AGENT: mapeie papéis, recursos e regras de autorização (quem pode o quê), inferidos do código. -->',
    '',
    '| Papel | Recurso | Ação permitida | Evidência |',
    '|---|---|---|---|',
    '| <!-- AGENT --> | | | |',
  ]);
}

export function renderC4ContextSkeleton(generatedAt: string): string {
  return deepSkeleton('C4 — Nível 1: Contexto', generatedAt, [
    '<!-- AGENT: atores (usuários/sistemas) e sistemas externos que interagem com este software. -->',
    '',
    '```mermaid',
    'flowchart TD',
    '  %% AGENT: ator --> Sistema --> sistemas externos',
    '```',
  ]);
}

export function renderC4ContainerSkeleton(generatedAt: string): string {
  return deepSkeleton('C4 — Nível 2: Containers', generatedAt, [
    '<!-- AGENT: containers executáveis/deploys (app, API, worker, DB, cache...) e protocolos entre eles. -->',
    '',
    '```mermaid',
    'flowchart TD',
    '  %% AGENT: containers e comunicações',
    '```',
  ]);
}

export function renderModuleSpecSkeleton(
  mod: ModuleInfo,
  index: number,
  total: number,
  generatedAt: string,
  model?: DataModel,
): string {
  const sampleFiles = mod.files.slice(0, 30);
  const more = mod.files.length - sampleFiles.length;

  // Endpoints + entities whose source file lives under this module's path.
  const inModule = (source: string): boolean =>
    source.replace(/\\/g, '/').startsWith(mod.path.replace(/\\/g, '/'));
  const modEndpoints = (model?.endpoints ?? []).filter((e) => inModule(e.source));
  const modEntities = (model?.entities ?? []).filter((e) => inModule(e.source));

  const publicSurface: string[] =
    modEndpoints.length || modEntities.length
      ? [
          '## Superfície Pública 🟢',
          '',
          '> Extraído deterministicamente deste módulo. `<!-- AGENT -->` adiciona o propósito.',
          '',
          ...(modEndpoints.length
            ? [
                `**Endpoints (${modEndpoints.length}):**`,
                '',
                ...modEndpoints.slice(0, 30).map((e) => `- \`${e.method} ${e.route}\` — \`${e.source}\``),
                modEndpoints.length > 30 ? `- … +${modEndpoints.length - 30}` : '',
                '',
              ]
            : []),
          ...(modEntities.length
            ? [
                `**Entidades (${modEntities.length}):**`,
                '',
                ...modEntities.slice(0, 30).map((e) => `- \`${e.name}\` — \`${e.source}\``),
                modEntities.length > 30 ? `- … +${modEntities.length - 30}` : '',
                '',
              ]
            : []),
        ]
      : [
          '## Superfície Pública',
          '<!-- AGENT: liste o que este módulo expõe para os outros (funções/classes/endpoints/tipos exportados). -->',
        ];
  const lines: string[] = [
    `# Módulo: ${mod.name}`,
    '',
    `> Spec de engenharia reversa (${index + 1}/${total}). Parte de [\`../IDEIA.md\`](../IDEIA.md).`,
    `> ⚠️ Inferido por máquina — revise. Seções \`<!-- AGENT -->\` são preenchidas por \`/dare-reverse\`.`,
    '',
    `*Gerado: ${generatedAt}*`,
    '',
    '## Fatos (determinísticos)',
    '',
    '> 🟢 CONFIRMED (extraído pelo scan) · 🟡 INFERRED · 🔴 GAP — marque os claims semânticos abaixo.',
    '',
    `- 🟢 **Caminho:** \`${mod.path}\``,
    `- 🟢 **Tamanho:** ${mod.size} (${mod.loc} LOC, ${mod.fileCount} arquivos, ${mod.testFileCount} de teste)`,
    `- 🟢 **Linguagens:** ${mod.languages.join(', ') || '—'}`,
    `- 🟢 **Depende de:** ${mod.depends_on.length ? mod.depends_on.join(', ') : '—'}`,
    '',
    '## Responsabilidade',
    '<!-- AGENT: em 1-3 frases, qual a responsabilidade deste módulo no sistema? -->',
    '',
    ...publicSurface,
    '',
    '## Como Funciona (fluxo)',
    '<!-- AGENT: desenhe um sequenceDiagram do fluxo de execução típico do módulo ' +
      '(entrypoint → service → repository → DB/externo). -->',
    '',
    '```mermaid',
    'sequenceDiagram',
    '  %% AGENT: substitua pelo fluxo real do módulo',
    '```',
    '',
    '## Dependências & Acoplamento',
    '<!-- AGENT: comente o acoplamento com os módulos listados em "Depende de" e possíveis riscos. -->',
    '',
    '## Arquivos',
    '',
    ...sampleFiles.map((f) => `- \`${f}\``),
    more > 0 ? `- … e mais ${more} arquivo(s) (lista completa em \`reverse-facts.json\`).` : '',
    '',
    '---',
    '*DARE Method — engenharia reversa. License: MIT.*',
  ];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
