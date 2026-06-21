import { z } from 'zod';
import type { AiCommandName } from './types.js';

export const ReverseSemanticSchema = z.object({
  purpose: z.string().min(1),
  domainGlossary: z.string().min(1),
  mainFlowMermaid: z.string().optional(),
  openQuestions: z.array(z.string()).optional(),
  modulePurposes: z.record(z.string()).optional(),
  domainRules: z.array(z.string()).optional(),
  stateMachinesMermaid: z.string().optional(),
  permissionsMarkdown: z.string().optional(),
  c4ContextMermaid: z.string().optional(),
  c4ContainerMermaid: z.string().optional(),
});

export const DnaSemanticSchema = z.object({
  namingNotes: z.string().min(1),
  architecturePattern: z.string().min(1),
  layerRules: z.string().min(1),
  testingStyle: z.string().min(1),
  errorHandling: z.string().min(1),
  goldenRules: z.array(z.string()).min(1),
  ambiguities: z.array(z.string()).optional(),
});

export const MigrateSemanticSchema = z.object({
  strategySummary: z.string().min(1),
  riskAreas: z.array(z.string()).min(1),
  parityNotes: z.string().min(1),
  blockingGaps: z.array(z.string()).optional(),
});

export const DesignSemanticSchema = z.object({
  goals: z.array(z.string()).min(1),
  constraints: z.array(z.string()).min(1),
  successCriteria: z.array(z.string()).min(1),
  userJourneys: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
});

export const PatternsSemanticSchema = z.object({
  summary: z.string().min(1),
  recommendations: z.array(z.string()).min(1),
  antiPatterns: z.array(z.string()).optional(),
  injectionNotes: z.string().optional(),
});

export const BlueprintSemanticSchema = z.object({
  architectureSummary: z.string().min(1),
  keyDecisions: z.array(z.string()).min(1),
  risks: z.array(z.string()).optional(),
  taskNotes: z.string().optional(),
});

export const ReviewSemanticSchema = z.object({
  passed: z.boolean(),
  unmetCriteria: z.array(z.string()),
  notes: z.string().optional(),
});

export const RefineSemanticSchema = z.object({
  rationale: z.string().min(1),
  subtasks: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        files: z.array(z.string()).optional(),
      }),
    )
    .min(1),
});

const SCHEMAS: Record<AiCommandName, z.ZodTypeAny> = {
  reverse: ReverseSemanticSchema,
  dna: DnaSemanticSchema,
  migrate: MigrateSemanticSchema,
  design: DesignSemanticSchema,
  patterns: PatternsSemanticSchema,
  blueprint: BlueprintSemanticSchema,
  review: ReviewSemanticSchema,
  refine: RefineSemanticSchema,
};

export function schemaForCommand(command: AiCommandName): z.ZodTypeAny {
  return SCHEMAS[command];
}

export function validateCommandOutput(command: AiCommandName, data: unknown): unknown {
  return schemaForCommand(command).parse(data);
}

export function jsonSchemaForCommand(command: AiCommandName): Record<string, unknown> {
  const base = { type: 'object', additionalProperties: false };
  switch (command) {
    case 'reverse':
      return {
        ...base,
        required: ['purpose', 'domainGlossary'],
        properties: {
          purpose: { type: 'string' },
          domainGlossary: { type: 'string' },
          mainFlowMermaid: { type: 'string' },
          openQuestions: { type: 'array', items: { type: 'string' } },
          modulePurposes: { type: 'object' },
          domainRules: { type: 'array', items: { type: 'string' } },
          stateMachinesMermaid: { type: 'string' },
          permissionsMarkdown: { type: 'string' },
          c4ContextMermaid: { type: 'string' },
          c4ContainerMermaid: { type: 'string' },
        },
      };
    case 'dna':
      return {
        ...base,
        required: [
          'namingNotes',
          'architecturePattern',
          'layerRules',
          'testingStyle',
          'errorHandling',
          'goldenRules',
        ],
        properties: {
          namingNotes: { type: 'string' },
          architecturePattern: { type: 'string' },
          layerRules: { type: 'string' },
          testingStyle: { type: 'string' },
          errorHandling: { type: 'string' },
          goldenRules: { type: 'array', items: { type: 'string' } },
          ambiguities: { type: 'array', items: { type: 'string' } },
        },
      };
    case 'migrate':
      return {
        ...base,
        required: ['strategySummary', 'riskAreas', 'parityNotes'],
        properties: {
          strategySummary: { type: 'string' },
          riskAreas: { type: 'array', items: { type: 'string' } },
          parityNotes: { type: 'string' },
          blockingGaps: { type: 'array', items: { type: 'string' } },
        },
      };
    case 'design':
      return {
        ...base,
        required: ['goals', 'constraints', 'successCriteria'],
        properties: {
          goals: { type: 'array', items: { type: 'string' } },
          constraints: { type: 'array', items: { type: 'string' } },
          successCriteria: { type: 'array', items: { type: 'string' } },
          userJourneys: { type: 'array', items: { type: 'string' } },
          openQuestions: { type: 'array', items: { type: 'string' } },
        },
      };
    case 'patterns':
      return {
        ...base,
        required: ['summary', 'recommendations'],
        properties: {
          summary: { type: 'string' },
          recommendations: { type: 'array', items: { type: 'string' } },
          antiPatterns: { type: 'array', items: { type: 'string' } },
          injectionNotes: { type: 'string' },
        },
      };
    case 'blueprint':
      return {
        ...base,
        required: ['architectureSummary', 'keyDecisions'],
        properties: {
          architectureSummary: { type: 'string' },
          keyDecisions: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          taskNotes: { type: 'string' },
        },
      };
    case 'review':
      return {
        ...base,
        required: ['passed', 'unmetCriteria'],
        properties: {
          passed: { type: 'boolean' },
          unmetCriteria: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
        },
      };
    case 'refine':
      return {
        ...base,
        required: ['rationale', 'subtasks'],
        properties: {
          rationale: { type: 'string' },
          subtasks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'title'],
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                files: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      };
    default:
      return { type: 'object' };
  }
}
