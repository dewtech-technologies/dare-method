import type { AiCommandName } from './types.js';

/** Terminal ↔ chat parity contract for semantic enrichment commands. */
export interface ParityContract {
  readonly command: AiCommandName;
  readonly skillSlug: string;
  readonly terminal: string;
  readonly artifacts: ReadonlyArray<string>;
  readonly schemaFields: ReadonlyArray<string>;
}

export const PARITY_CONTRACTS: ReadonlyArray<ParityContract> = [
  {
    command: 'reverse',
    skillSlug: '/dare-reverse',
    terminal: 'dare reverse --ai',
    artifacts: ['DARE/REVERSE/semantic-enrichment.json', 'DARE/IDEIA.md'],
    schemaFields: [
      'purpose',
      'domainGlossary',
      'mainFlowMermaid',
      'openQuestions',
      'modulePurposes',
      'domainRules',
      'stateMachinesMermaid',
      'permissionsMarkdown',
      'c4ContextMermaid',
      'c4ContainerMermaid',
    ],
  },
  {
    command: 'dna',
    skillSlug: '/dare-dna',
    terminal: 'dare dna --ai',
    artifacts: ['DARE/dna-semantic.json', 'DARE/PROJECT-DNA.md'],
    schemaFields: [
      'namingNotes',
      'architecturePattern',
      'layerRules',
      'testingStyle',
      'errorHandling',
      'goldenRules',
      'ambiguities',
    ],
  },
  {
    command: 'migrate',
    skillSlug: '/dare-migrate',
    terminal: 'dare migrate --ai',
    artifacts: ['DARE/migrate-semantic.json', 'DARE/MIGRATION/MIGRATION.md'],
    schemaFields: ['strategySummary', 'riskAreas', 'parityNotes', 'blockingGaps'],
  },
  {
    command: 'design',
    skillSlug: '/dare-design',
    terminal: 'dare design "<description>" --ai',
    artifacts: ['DARE/design-semantic.json', 'DARE/DESIGN.md'],
    schemaFields: ['goals', 'constraints', 'successCriteria', 'userJourneys', 'openQuestions'],
  },
  {
    command: 'patterns',
    skillSlug: '/dare-patterns',
    terminal: 'dare patterns --ai',
    artifacts: ['DARE/patterns-semantic.json', 'DARE/PATTERNS.md'],
    schemaFields: ['summary', 'recommendations', 'antiPatterns', 'injectionNotes'],
  },
  {
    command: 'blueprint',
    skillSlug: '/dare-blueprint',
    terminal: 'dare blueprint --ai',
    artifacts: ['DARE/blueprint-semantic.json', 'DARE/BLUEPRINT.md'],
    schemaFields: ['architectureSummary', 'keyDecisions', 'risks', 'taskNotes'],
  },
  {
    command: 'review',
    skillSlug: '/dare-review',
    terminal: 'dare review <task-id> --ai',
    artifacts: ['DARE/review-semantic.json'],
    schemaFields: ['passed', 'unmetCriteria', 'notes'],
  },
  {
    command: 'refine',
    skillSlug: '/dare-refine',
    terminal: 'dare refine <task-id> --split --ai',
    artifacts: ['DARE/refine-semantic.json'],
    schemaFields: ['rationale', 'subtasks'],
  },
];

const BY_COMMAND = new Map<AiCommandName, ParityContract>(
  PARITY_CONTRACTS.map((c) => [c.command, c]),
);

export function parityFor(command: AiCommandName): ParityContract {
  const contract = BY_COMMAND.get(command);
  if (!contract) {
    throw new Error(`No parity contract for command: ${command}`);
  }
  return contract;
}

export const SEMANTIC_COMMANDS: ReadonlyArray<AiCommandName> = PARITY_CONTRACTS.map(
  (c) => c.command,
);
