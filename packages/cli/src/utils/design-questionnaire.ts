import type { PatternsFacts, PatternKind, DiscoveredPattern } from './pattern-detector.js';
import type { DnaFacts } from './dna-detector.js';

/** Persona que origina a pergunta. NÃO executa nada — rótulo p/ a skill conduzir (A-8/A-9). */
export type PlannerPersona = 'analyst' | 'pm' | 'architect';

export interface PlanningQuestion {
  readonly id: string;
  readonly persona: PlannerPersona;
  readonly phase: 'design' | 'blueprint';
  readonly prompt: string;
  readonly anchoredOn: readonly string[];
  readonly kind: 'gap' | 'ambiguity' | 'tradeoff' | 'scope';
}

export interface PlanningArtifact {
  readonly generatedAt: string;
  readonly phase: 'design' | 'blueprint';
  readonly questions: readonly PlanningQuestion[];
}

const KIND_ORDER: readonly PatternKind[] = [
  'inferred-layer',
  'naming-idiom',
  'structural-idiom',
  'call-idiom',
  'implicit-decision',
];

function sortQuestions(questions: PlanningQuestion[]): PlanningQuestion[] {
  return [...questions].sort((a, b) => a.id.localeCompare(b.id));
}

function counterKey(persona: PlannerPersona, kind: PlanningQuestion['kind']): string {
  return `${persona}-${kind}`;
}

function nextId(
  counters: Map<string, number>,
  persona: PlannerPersona,
  kind: PlanningQuestion['kind'],
): string {
  const key = counterKey(persona, kind);
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);
  return `${persona}-${kind}-${String(n).padStart(2, '0')}`;
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
  return map;
}

export function buildDesignQuestionnaire(
  dna: DnaFacts | null,
  patterns: PatternsFacts | null,
): PlanningArtifact {
  if (!dna && !patterns) {
    return { generatedAt: '1970-01-01T00:00:00.000Z', phase: 'design', questions: [] };
  }

  const counters = new Map<string, number>();
  const questions: PlanningQuestion[] = [];
  const generatedAt =
    patterns?.generatedAt ?? dna?.generatedAt ?? '1970-01-01T00:00:00.000Z';

  if (dna) {
    const layers = dna.architecture.detectedLayers;
    if (layers.length > 3 || dna.architecture.guess.toLowerCase().includes('unknown')) {
      questions.push({
        id: nextId(counters, 'analyst', 'ambiguity'),
        persona: 'analyst',
        phase: 'design',
        prompt: `Arquitetura detectada: "${dna.architecture.guess}" com camadas [${layers.join(', ')}]. Confirmar o padrão dominante?`,
        anchoredOn: ['dna:architecture'],
        kind: 'ambiguity',
      });
    }

    if (!dna.libraries.validation && (dna.libraries.http || dna.libraries.orm)) {
      questions.push({
        id: nextId(counters, 'analyst', 'scope'),
        persona: 'analyst',
        phase: 'design',
        prompt: 'Biblioteca de validação não detectada no DNA, mas há HTTP/ORM. Qual estratégia de validação o projeto usa?',
        anchoredOn: ['dna:libraries'],
        kind: 'scope',
      });
    }
  }

  if (patterns) {
    const byKind = patternsByKind(patterns.patterns);

    for (const kind of KIND_ORDER) {
      const list = byKind.get(kind) ?? [];
      if (list.length === 0) {
        questions.push({
          id: nextId(counters, 'analyst', 'gap'),
          persona: 'analyst',
          phase: 'design',
          prompt: `Nenhum padrão detectado na categoria "${kind}". Confirmar se esta categoria se aplica ao projeto?`,
          anchoredOn: [`patterns:kind:${kind}`],
          kind: 'gap',
        });
      }
    }

    for (const p of patterns.patterns) {
      if (p.marker === 'gap' || p.coverage < 0.5) {
        questions.push({
          id: nextId(counters, 'analyst', 'gap'),
          persona: 'analyst',
          phase: 'design',
          prompt: `${p.description} (cobertura ${(p.coverage * 100).toFixed(0)}%). Confirmar relevância deste padrão?`,
          anchoredOn: [p.id],
          kind: 'gap',
        });
      }

      if (
        (p.kind === 'naming-idiom' || p.kind === 'call-idiom') &&
        p.frequency >= 2
      ) {
        questions.push({
          id: nextId(counters, 'pm', 'scope'),
          persona: 'pm',
          phase: 'design',
          prompt: `Padrão "${p.id}" (${p.frequency} ocorrências): quais critérios de aceite devem preservar este idioma?`,
          anchoredOn: [p.id],
          kind: 'scope',
        });
      }
    }
  }

  return {
    generatedAt,
    phase: 'design',
    questions: sortQuestions(questions),
  };
}

export function buildBlueprintQuestionnaire(
  patterns: PatternsFacts | null,
): PlanningArtifact {
  if (!patterns || patterns.patterns.length === 0) {
    return { generatedAt: '1970-01-01T00:00:00.000Z', phase: 'blueprint', questions: [] };
  }

  const counters = new Map<string, number>();
  const questions: PlanningQuestion[] = [];

  for (const p of patterns.patterns) {
    if (p.kind !== 'implicit-decision' && p.kind !== 'structural-idiom') continue;
    questions.push({
      id: nextId(counters, 'architect', 'tradeoff'),
      persona: 'architect',
      phase: 'blueprint',
      prompt: `${p.description} — manter como padrão ou abstrair para nova feature?`,
      anchoredOn: [p.id],
      kind: 'tradeoff',
    });
  }

  return {
    generatedAt: patterns.generatedAt,
    phase: 'blueprint',
    questions: sortQuestions(questions),
  };
}

/** Markdown block for DESIGN.md (deterministic; CLI does not answer — skill conducts 1 passagem). */
export function renderDesignQuestionnaireBlock(artifact: PlanningArtifact): string {
  const lines: string[] = [
    '## Perguntas de Planejamento (Analyst/PM)',
    '',
    '> Questionário determinístico (fatos+gaps). O CLI não responde — a skill `/dare-design` conduz **1 passagem sequencial**.',
    '',
  ];

  if (artifact.questions.length === 0) {
    lines.push('_Nenhuma pergunta gerada — execute `dare dna` e `dare patterns` primeiro._', '');
    return lines.join('\n');
  }

  for (const q of artifact.questions) {
    const anchor = q.anchoredOn.map((a) => `\`${a}\``).join(', ');
    lines.push(`### ${q.id} (${q.persona} · ${q.kind})`);
    lines.push(`- **Ancorado em:** ${anchor}`);
    lines.push(`- **Pergunta:** ${q.prompt}`);
    lines.push('');
  }

  return lines.join('\n');
}
