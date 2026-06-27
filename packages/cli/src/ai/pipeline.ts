import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import type { z } from 'zod';
import { loadAiConfig } from './config.js';
import { buildEnrichmentPrompt } from './prompts.js';
import { resolveProvider } from './registry.js';
import {
  jsonSchemaForCommand,
  validateCommandOutput,
  ReverseSemanticSchema,
  DnaSemanticSchema,
  MigrateSemanticSchema,
  DesignSemanticSchema,
  PatternsSemanticSchema,
  BlueprintSemanticSchema,
  ReviewSemanticSchema,
  RefineSemanticSchema,
} from './schemas.js';
import type { AiCommandName, EnrichmentResult } from './types.js';

function replaceAgentComment(content: string, needle: string, value: string): string {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((line) => line.includes('<!-- AGENT') && line.includes(needle));
  if (idx >= 0) {
    lines[idx] = value;
    return lines.join('\n');
  }
  const genericIdx = lines.findIndex((line) => line.includes('<!-- AGENT'));
  if (genericIdx >= 0) {
    lines[genericIdx] = value;
    return lines.join('\n');
  }
  return content;
}

function replaceFirstAgentBlock(content: string, value: string): string {
  return content.replace(/<!-- AGENT[^>]* -->/, value);
}

export async function runCommandEnrichment(args: {
  command: AiCommandName;
  cwd: string;
  facts: unknown;
  provider?: string;
  deep?: boolean;
  extra?: string;
  timeoutSeconds?: number;
  signal?: AbortSignal;
}): Promise<EnrichmentResult> {
  const config = await loadAiConfig(args.cwd);
  const { name, provider } = resolveProvider(config, args.provider);
  const schema = jsonSchemaForCommand(args.command);
  const prompt = buildEnrichmentPrompt(args.command, args.facts, {
    deep: args.deep,
    extra: args.extra,
  });

  const result = await provider.run({
    prompt,
    cwd: args.cwd,
    schema,
    timeoutSeconds: args.timeoutSeconds,
    signal: args.signal,
  });

  if (!result.ok || result.data === undefined) {
    return {
      ok: false,
      command: args.command,
      provider: name,
      error: result.error ?? 'provider returned no data',
    };
  }

  try {
    const validated = validateCommandOutput(args.command, result.data);
    const artifactPath = await applyEnrichment(args.command, args.cwd, validated, {
      deep: args.deep,
    });
    return {
      ok: true,
      command: args.command,
      provider: name,
      data: validated,
      artifactPath,
    };
  } catch (err) {
    return {
      ok: false,
      command: args.command,
      provider: name,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function applyEnrichment(
  command: AiCommandName,
  cwd: string,
  data: unknown,
  opts: { deep?: boolean },
): Promise<string> {
  switch (command) {
    case 'reverse':
      return applyReverseEnrichment(cwd, data as z.infer<typeof ReverseSemanticSchema>, opts.deep);
    case 'dna':
      return applyDnaEnrichment(cwd, data as z.infer<typeof DnaSemanticSchema>);
    case 'migrate':
      return applyMigrateEnrichment(cwd, data as z.infer<typeof MigrateSemanticSchema>);
    case 'design':
      return applyDesignEnrichment(cwd, data as z.infer<typeof DesignSemanticSchema>);
    case 'patterns':
      return applyPatternsEnrichment(cwd, data as z.infer<typeof PatternsSemanticSchema>);
    case 'blueprint':
      return applyBlueprintEnrichment(cwd, data as z.infer<typeof BlueprintSemanticSchema>);
    case 'review':
      return applyReviewEnrichment(cwd, data as z.infer<typeof ReviewSemanticSchema>);
    case 'refine':
      return applyRefineEnrichment(cwd, data as z.infer<typeof RefineSemanticSchema>);
    default:
      return writeGenericEnrichment(cwd, command, data);
  }
}

async function writeGenericEnrichment(
  cwd: string,
  command: AiCommandName,
  data: unknown,
): Promise<string> {
  const dareDir = path.join(cwd, 'DARE');
  await fs.ensureDir(dareDir);
  const artifactPath = path.join(dareDir, `${command}-semantic.json`);
  await fs.writeJSON(artifactPath, data, { spaces: 2 });
  return artifactPath;
}

async function applyReverseEnrichment(
  cwd: string,
  semantic: z.infer<typeof ReverseSemanticSchema>,
  deep?: boolean,
): Promise<string> {
  const reverseDir = path.join(cwd, 'DARE', 'REVERSE');
  await fs.ensureDir(reverseDir);
  const artifactPath = path.join(reverseDir, 'semantic-enrichment.json');
  await fs.writeJSON(artifactPath, semantic, { spaces: 2 });

  const ideiaPath = path.join(cwd, 'DARE', 'IDEIA.md');
  if (await fs.pathExists(ideiaPath)) {
    let ideia = await fs.readFile(ideiaPath, 'utf-8');
    ideia = replaceFirstAgentBlock(
      ideia,
      semantic.purpose,
    );
    ideia = replaceAgentComment(ideia, 'entidades', semantic.domainGlossary);
    if (semantic.mainFlowMermaid) {
      ideia = ideia.replace(
        /```mermaid[\s\S]*?```/,
        '```mermaid\n' + semantic.mainFlowMermaid.trim() + '\n```',
      );
    }
    if (semantic.openQuestions?.length) {
      ideia = replaceAgentComment(
        ideia,
        'NÃO foi possível',
        semantic.openQuestions.map((q) => `- ${q}`).join('\n'),
      );
    }
    await fs.writeFile(ideiaPath, ideia);
  }

  if (deep) {
    if (semantic.domainRules?.length && (await fs.pathExists(path.join(reverseDir, 'domain-rules.md')))) {
      const rules = semantic.domainRules.map((r) => `- ${r}`).join('\n');
      await fs.writeFile(path.join(reverseDir, 'domain-rules.md'), `# Domain Rules\n\n${rules}\n`);
    }
    if (semantic.permissionsMarkdown && (await fs.pathExists(path.join(reverseDir, 'permissions.md')))) {
      await fs.writeFile(path.join(reverseDir, 'permissions.md'), semantic.permissionsMarkdown);
    }
    const c4Dir = path.join(reverseDir, 'c4');
    if (semantic.c4ContextMermaid && (await fs.pathExists(path.join(c4Dir, 'c4-context.md')))) {
      await fs.writeFile(
        path.join(c4Dir, 'c4-context.md'),
        `# C4 Context\n\n\`\`\`mermaid\n${semantic.c4ContextMermaid.trim()}\n\`\`\`\n`,
      );
    }
    if (semantic.c4ContainerMermaid && (await fs.pathExists(path.join(c4Dir, 'c4-container.md')))) {
      await fs.writeFile(
        path.join(c4Dir, 'c4-container.md'),
        `# C4 Container\n\n\`\`\`mermaid\n${semantic.c4ContainerMermaid.trim()}\n\`\`\`\n`,
      );
    }
  }

  if (semantic.modulePurposes) {
    const files = (await fs.readdir(reverseDir)).filter((f) => f.startsWith('module-') && f.endsWith('.md'));
    for (const file of files) {
      const full = path.join(reverseDir, file);
      let content = await fs.readFile(full, 'utf-8');
      for (const [modId, purpose] of Object.entries(semantic.modulePurposes)) {
        if (content.includes(modId)) {
          content = replaceFirstAgentBlock(content, purpose);
        }
      }
      await fs.writeFile(full, content);
    }
  }

  return artifactPath;
}

async function applyDnaEnrichment(
  cwd: string,
  semantic: z.infer<typeof DnaSemanticSchema>,
): Promise<string> {
  const dareDir = path.join(cwd, 'DARE');
  const artifactPath = path.join(dareDir, 'dna-semantic.json');
  await fs.writeJSON(artifactPath, semantic, { spaces: 2 });

  const dnaPath = path.join(dareDir, 'PROJECT-DNA.md');
  if (!(await fs.pathExists(dnaPath))) return artifactPath;

  let content = await fs.readFile(dnaPath, 'utf-8');
  content = replaceFirstAgentBlock(content, semantic.namingNotes);
  content = replaceAgentComment(content, 'padrão arquitetural', `**${semantic.architecturePattern}**\n\n${semantic.layerRules}`);
  content = replaceAgentComment(content, 'estilo de teste', semantic.testingStyle);
  content = replaceAgentComment(content, 'erros são tratados', semantic.errorHandling);
  content = replaceAgentComment(
    content,
    'SEMPRE',
    semantic.goldenRules.map((r) => `- ${r}`).join('\n'),
  );
  if (semantic.ambiguities?.length) {
    content = replaceAgentComment(
      content,
      'ambíguas',
      semantic.ambiguities.map((a) => `- ${a}`).join('\n'),
    );
  }
  await fs.writeFile(dnaPath, content);
  return artifactPath;
}

async function applyMigrateEnrichment(
  cwd: string,
  semantic: z.infer<typeof MigrateSemanticSchema>,
): Promise<string> {
  const dareDir = path.join(cwd, 'DARE');
  const migrationDir = path.join(dareDir, 'MIGRATION');
  await fs.ensureDir(migrationDir);
  const artifactPath = path.join(dareDir, 'migrate-semantic.json');
  await fs.writeJSON(artifactPath, semantic, { spaces: 2 });

  const migrationPath = path.join(migrationDir, 'MIGRATION.md');
  if (!(await fs.pathExists(migrationPath))) {
    const body = `# MIGRATION

## Estratégia de Migração
${semantic.strategySummary}

## Registro de Risco
${semantic.riskAreas.map((r) => `- ${r}`).join('\n')}

## Notas de Paridade
${semantic.parityNotes}
${semantic.blockingGaps?.length ? `\n## Blocking Gaps\n${semantic.blockingGaps.map((g) => `- ${g}`).join('\n')}` : ''}
`;
    await fs.writeFile(migrationPath, body);
    return artifactPath;
  }

  let content = await fs.readFile(migrationPath, 'utf-8');
  content = replaceAgentComment(content, 'big-bang', semantic.strategySummary);
  content = replaceAgentComment(
    content,
    'riscos',
    semantic.riskAreas.map((r) => `- ${r}`).join('\n'),
  );
  content = replaceAgentComment(content, 'paridade', semantic.parityNotes);
  if (semantic.blockingGaps?.length) {
    content = replaceAgentComment(
      content,
      'tratamento',
      semantic.blockingGaps.map((g) => `- ${g}`).join('\n'),
    );
  }
  await fs.writeFile(migrationPath, content);
  return artifactPath;
}

async function applyReviewEnrichment(
  cwd: string,
  semantic: z.infer<typeof ReviewSemanticSchema>,
): Promise<string> {
  const dareDir = path.join(cwd, 'DARE');
  await fs.ensureDir(dareDir);
  const artifactPath = path.join(dareDir, 'review-semantic.json');
  const verdict = {
    passed: semantic.passed,
    unmetCriteria: semantic.unmetCriteria,
    ...(semantic.notes ? { notes: semantic.notes } : {}),
  };
  await fs.writeJSON(artifactPath, verdict, { spaces: 2 });
  return artifactPath;
}

async function applyRefineEnrichment(
  cwd: string,
  semantic: z.infer<typeof RefineSemanticSchema>,
): Promise<string> {
  return writeGenericEnrichment(cwd, 'refine', semantic);
}

async function applyDesignEnrichment(
  cwd: string,
  semantic: z.infer<typeof DesignSemanticSchema>,
): Promise<string> {
  const dareDir = path.join(cwd, 'DARE');
  const artifactPath = path.join(dareDir, 'design-semantic.json');
  await fs.writeJSON(artifactPath, semantic, { spaces: 2 });

  const designPath = path.join(dareDir, 'DESIGN.md');
  const goals = semantic.goals.map((g) => `- [ ] ${g}`).join('\n');
  const constraints = semantic.constraints.map((c) => `- [ ] ${c}`).join('\n');
  const success = semantic.successCriteria.map((s) => `- [ ] ${s}`).join('\n');
  const journeys = semantic.userJourneys?.map((j) => `- ${j}`).join('\n') ?? '';

  const body = `# DESIGN

## Goals
${goals}

## Constraints
${constraints}

## Success Criteria
${success}

${journeys ? `## User Journeys\n${journeys}\n` : ''}
---
*Enriched by DARE AI — ${new Date().toISOString()}*
`;
  await fs.writeFile(designPath, body);
  return artifactPath;
}

async function applyPatternsEnrichment(
  cwd: string,
  semantic: z.infer<typeof PatternsSemanticSchema>,
): Promise<string> {
  const dareDir = path.join(cwd, 'DARE');
  const artifactPath = path.join(dareDir, 'patterns-semantic.json');
  await fs.writeJSON(artifactPath, semantic, { spaces: 2 });

  const patternsPath = path.join(dareDir, 'PATTERNS.md');
  if (await fs.pathExists(patternsPath)) {
    let content = await fs.readFile(patternsPath, 'utf-8');
    content = replaceFirstAgentBlock(content, semantic.summary);
    content = replaceAgentComment(
      content,
      'recomenda',
      semantic.recommendations.map((r) => `- ${r}`).join('\n'),
    );
    await fs.writeFile(patternsPath, content);
  }
  return artifactPath;
}

async function applyBlueprintEnrichment(
  cwd: string,
  semantic: z.infer<typeof BlueprintSemanticSchema>,
): Promise<string> {
  const dareDir = path.join(cwd, 'DARE');
  const artifactPath = path.join(dareDir, 'blueprint-semantic.json');
  await fs.writeJSON(artifactPath, semantic, { spaces: 2 });

  const blueprintPath = path.join(dareDir, 'BLUEPRINT.md');
  const decisions = semantic.keyDecisions.map((d) => `- ${d}`).join('\n');
  const risks =
    semantic.risks && semantic.risks.length > 0
      ? `\n## Risks\n${semantic.risks.map((r) => `- ${r}`).join('\n')}\n`
      : '';
  const taskNotes = semantic.taskNotes ? `\n## Task Notes\n${semantic.taskNotes}\n` : '';

  const body = `# BLUEPRINT

## Architecture Overview
${semantic.architectureSummary}

## Key Decisions
${decisions}
${risks}${taskNotes}
---
*Enriched by DARE AI — ${new Date().toISOString()}*
`;
  await fs.writeFile(blueprintPath, body);
  return artifactPath;
}

export async function maybeRunAiEnrichment(args: {
  enabled: boolean;
  provider?: string;
  command: AiCommandName;
  cwd: string;
  facts: unknown;
  deep?: boolean;
  extra?: string;
  json?: boolean;
}): Promise<EnrichmentResult | null> {
  if (!args.enabled) return null;

  const result = await runCommandEnrichment({
    command: args.command,
    cwd: args.cwd,
    facts: args.facts,
    provider: args.provider,
    deep: args.deep,
    extra: args.extra,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return result;
  }

  const spinner = ora(`AI enrichment (${args.command})...`).start();
  if (result.ok) {
    spinner.succeed(chalk.green(`AI enrichment OK (${result.provider}) → ${result.artifactPath}`));
    return result;
  }

  spinner.fail(chalk.red(`AI enrichment failed (${result.provider}): ${result.error}`));
  process.exit(1);
}
