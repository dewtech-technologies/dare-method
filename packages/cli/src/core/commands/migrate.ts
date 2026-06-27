import fs from 'fs-extra';
import path from 'node:path';
import { runCommandEnrichment } from '../../ai/pipeline.js';
import {
  buildMigrationFacts,
  loadReverseArtifacts,
  parityFeatureFilename,
  renderMigrationDoc,
  renderParityFeature,
  reverseFactsPath,
  type MigrationFacts,
} from '../../utils/migration.js';
import { registerRunner } from './types.js';
import type { CommandRunOptions, CommandRunResult } from './types.js';

interface MigrateInput {
  readonly to?: string;
  readonly check?: boolean;
}

const TARGET_REQUIRED_ERROR =
  'Target stack is required in write mode. Provide --to <stack> (input.to).';

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseInput(input: Record<string, unknown> | undefined): {
  to?: string;
  check: boolean;
} {
  const typed = (input ?? {}) as MigrateInput;
  return {
    to: asString(typed.to)?.trim() || undefined,
    check: asBoolean(typed.check),
  };
}

function asRelativeArtifact(cwd: string, artifactPath: string): string {
  const relative = path.relative(cwd, artifactPath);
  return relative === '' ? '.' : relative.replace(/\\/g, '/');
}

function formatMigrationSummary(facts: MigrationFacts): string[] {
  const lines: string[] = [];
  lines.push('Migration plan:');
  lines.push(`  Source: ${facts.source.stack} (${facts.source.structure})`);
  lines.push(`  Target: ${facts.target.stack}`);
  lines.push(`  Modules: ${facts.modules.length}`);
  if (facts.conventions.architecture) {
    lines.push(`  Architecture (DNA): ${facts.conventions.architecture}`);
  }
  lines.push(`  Blocking gaps: ${facts.blockingGaps.total}`);
  for (const gap of facts.blockingGaps.perSpec) {
    lines.push(`    - ${gap.spec}: ${gap.gaps}`);
  }
  return lines;
}

function resultError(
  facts: unknown,
  artifacts: string[],
  error: string,
  summary?: string[],
  enrichment?: CommandRunResult['enrichment'],
): CommandRunResult {
  return {
    command: 'migrate',
    ok: false,
    facts,
    artifacts,
    ...(summary ? { summary } : {}),
    ...(enrichment ? { enrichment } : {}),
    error,
  };
}

export async function runMigrate(opts: CommandRunOptions): Promise<CommandRunResult> {
  const input = parseInput(opts.input);
  const artifacts: string[] = [];

  if (!input.check && !input.to) {
    return resultError(null, artifacts, TARGET_REQUIRED_ERROR);
  }

  const reverse = await loadReverseArtifacts(opts.cwd);
  if (!reverse) {
    return resultError(
      null,
      artifacts,
      `Missing DARE/REVERSE/reverse-facts.json. Expected: ${reverseFactsPath(opts.cwd)}`,
    );
  }

  const target = input.to ?? 'unspecified';
  const facts = buildMigrationFacts(reverse, target, new Date().toISOString());
  const summary = formatMigrationSummary(facts);

  if (input.check) {
    summary.push('--check: detection only, no files written.');
    return {
      command: 'migrate',
      ok: true,
      facts,
      artifacts,
      summary,
    };
  }

  try {
    const migrationDir = path.join(opts.cwd, 'DARE', 'MIGRATION');
    const parityDir = path.join(migrationDir, 'parity');
    const factsPath = path.join(migrationDir, 'migration-facts.json');
    const migrationPath = path.join(migrationDir, 'MIGRATION.md');

    await fs.ensureDir(parityDir);
    await fs.writeJSON(factsPath, facts, { spaces: 2 });
    await fs.writeFile(migrationPath, renderMigrationDoc(facts));
    artifacts.push('DARE/MIGRATION/MIGRATION.md', 'DARE/MIGRATION/migration-facts.json');

    for (const moduleFacts of facts.modules) {
      const featureName = parityFeatureFilename(moduleFacts);
      const featurePath = path.join(parityDir, featureName);
      await fs.writeFile(featurePath, renderParityFeature(moduleFacts));
      artifacts.push(`DARE/MIGRATION/parity/${featureName}`);
    }
  } catch (err) {
    return resultError(
      facts,
      artifacts,
      err instanceof Error ? err.message : String(err),
      summary,
    );
  }

  let enrichment: CommandRunResult['enrichment'] | undefined;
  if (opts.ai) {
    enrichment = await runCommandEnrichment({
      command: 'migrate',
      cwd: opts.cwd,
      facts,
      provider: opts.provider,
    });
    if (!enrichment.ok) {
      return resultError(
        facts,
        artifacts,
        enrichment.error ?? 'AI enrichment failed',
        summary,
        enrichment,
      );
    }
    if (enrichment.artifactPath) {
      artifacts.push(asRelativeArtifact(opts.cwd, enrichment.artifactPath));
    }
  }

  summary.push('Generated: DARE/MIGRATION/MIGRATION.md');
  summary.push('Generated: DARE/MIGRATION/migration-facts.json');
  summary.push(`Generated: DARE/MIGRATION/parity/*.feature (${facts.modules.length})`);

  return {
    command: 'migrate',
    ok: true,
    facts,
    artifacts,
    ...(enrichment ? { enrichment } : {}),
    summary,
  };
}

registerRunner('migrate', runMigrate);
