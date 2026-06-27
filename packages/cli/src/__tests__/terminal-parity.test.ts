import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PARITY_CONTRACTS } from '../ai/parity.js';
import { schemaForCommand } from '../ai/schemas.js';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const IMPL = path.join(REPO, 'implementations');
const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

const SEMANTIC_COMMAND_FILES = [
  'reverse.ts',
  'dna.ts',
  'migrate.ts',
  'design.ts',
  'patterns.ts',
  'blueprint.ts',
  'review.ts',
  'refine.ts',
] as const;

function zodTopLevelKeys(schema: z.ZodTypeAny): string[] {
  if (schema instanceof z.ZodObject) return Object.keys(schema.shape);
  return [];
}

function skillPaths(slug: string): string[] {
  const cmd = slug.replace(/^\/dare-/, '');
  return [
    path.join(IMPL, 'claude/.claude/commands', `dare-${cmd}.md`),
    path.join(IMPL, 'cursor/.cursor/commands', `dare-${cmd}.md`),
    path.join(IMPL, 'antigravity/.agents/skills', `dare-${cmd}`, 'SKILL.md'),
  ];
}

const CORE_RUNNER_BY_FILE: Record<(typeof SEMANTIC_COMMAND_FILES)[number], string> = {
  'reverse.ts': 'runReverse',
  'dna.ts': 'runDna',
  'migrate.ts': 'runMigrate',
  'design.ts': 'runDesign',
  'patterns.ts': 'runPatterns',
  'blueprint.ts': 'runBlueprint',
  'review.ts': 'runReview',
  'refine.ts': 'runRefine',
};

describe('terminal parity contract', () => {
  it('each_contract_has_skill_in_three_ides', () => {
    for (const contract of PARITY_CONTRACTS) {
      for (const file of skillPaths(contract.skillSlug)) {
        expect(fs.pathExistsSync(file), file).toBe(true);
        const text = fs.readFileSync(file, 'utf8');
        expect(text).toContain('Equivalente no terminal:');
        expect(text).toContain('--ai');
        expect(text).toContain(contract.terminal.split(' ')[0]!);
      }
    }
  });

  it('each_command_exposes_ai_and_provider_flags', () => {
    const optionsSource = readFileSync(path.join(__dirname, '..', 'ai', 'command-options.ts'), 'utf8');
    expect(optionsSource).toContain("'--ai'");
    expect(optionsSource).toContain("'--provider");
    expect(optionsSource).toContain("'--json'");

    for (const file of SEMANTIC_COMMAND_FILES) {
      const source = readFileSync(path.join(COMMANDS_DIR, file), 'utf8');
      expect(source, file).toContain('addAiOptions');
      expect(source, file).toContain('../core/commands/');
      expect(source, file).toContain(CORE_RUNNER_BY_FILE[file]);
      if (file === 'review.ts' || file === 'refine.ts') {
        expect(source, file).toMatch(/format === 'json'|--format.*json/);
      } else {
        expect(source, file).toMatch(/aiOpts\.json|options\.json|\-\-json/);
      }
    }
  });

  it('schema_fields_exist', () => {
    for (const contract of PARITY_CONTRACTS) {
      const keys = new Set(zodTopLevelKeys(schemaForCommand(contract.command)));
      for (const field of contract.schemaFields) {
        expect(keys.has(field), `${contract.command}.${field}`).toBe(true);
      }
    }
  });

  it('apply_covers_declared_artifacts', () => {
    const pipelineSource = readFileSync(path.join(__dirname, '..', 'ai', 'pipeline.ts'), 'utf8');
    for (const contract of PARITY_CONTRACTS) {
      expect(pipelineSource).toContain(`case '${contract.command}':`);
      if (contract.command === 'review') {
        expect(pipelineSource).toContain('applyReviewEnrichment');
      }
      if (contract.command === 'migrate') {
        expect(pipelineSource).toContain('applyMigrateEnrichment');
      }
    }
  });
});
