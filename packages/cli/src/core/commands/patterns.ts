import fs from 'fs-extra';
import path from 'node:path';
import { runCommandEnrichment } from '../../ai/pipeline.js';
import type { DnaFacts } from '../../utils/dna-detector.js';
import {
  detectPatternsDetailed,
  type PatternsFacts,
} from '../../utils/pattern-detector.js';
import { renderPatternsSkeleton } from '../../utils/pattern-facts.js';
import {
  PathEscapeError,
  assertRelativeSafe,
  resolveSafePath,
} from '../../utils/path-safety.js';
import { createGraph, loadGraphConfig } from '../../graphrag/index.js';
import { ingestPatterns } from '../../graphrag/pattern-ingest.js';
import { registerRunner } from './types.js';
import type { CommandRunOptions, CommandRunResult } from './types.js';

export const DIR_ESCAPE_MSG =
  "Error: --dir must stay within the project (no '..' or absolute escape)";

interface PatternsInput {
  readonly check?: boolean;
  readonly modules?: string;
  readonly inject?: boolean;
  readonly ast?: boolean;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseInput(input: Record<string, unknown> | undefined): {
  check: boolean;
  modules?: string;
  inject: boolean;
  ast: boolean;
} {
  const typed = (input ?? {}) as PatternsInput;
  return {
    check: asBoolean(typed.check),
    modules: asString(typed.modules),
    inject: asBoolean(typed.inject),
    ast: asBoolean(typed.ast),
  };
}

function parseModulesList(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    try {
      assertRelativeSafe(part);
      if (part.includes('..') || path.isAbsolute(part)) {
        throw new PathEscapeError(DIR_ESCAPE_MSG);
      }
    } catch {
      throw new PathEscapeError(DIR_ESCAPE_MSG);
    }
  }
  return parts;
}

function asRelativeArtifact(cwd: string, artifactPath: string): string {
  const relative = path.relative(cwd, artifactPath);
  return relative === '' ? '.' : relative.replace(/\\/g, '/');
}

function formatPatternsSummary(facts: PatternsFacts): string[] {
  const byKind = new Map<string, number>();
  for (const pattern of facts.patterns) {
    byKind.set(pattern.kind, (byKind.get(pattern.kind) ?? 0) + pattern.frequency);
  }
  const lines = ['Patterns detected:'];
  if (byKind.size === 0) {
    lines.push('  (none above frequency threshold)');
  } else {
    for (const [kind, freq] of [...byKind.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      lines.push(`  ${kind}: ${freq} occurrence(s)`);
    }
  }
  lines.push(`  inventory: ${facts.fileInventorySource}`);
  return lines;
}

async function ingestPatternsBestEffort(
  targetDir: string,
  facts: PatternsFacts,
): Promise<{ nodes: number; edges: number } | null> {
  try {
    const config = await loadGraphConfig({ cwd: targetDir });
    const graph = await createGraph(config, { cwd: targetDir });
    try {
      return ingestPatterns(graph, facts, targetDir);
    } finally {
      await Promise.resolve(graph.close());
    }
  } catch {
    return null;
  }
}

function resultError(
  facts: unknown,
  artifacts: string[],
  error: string,
  enrichment?: CommandRunResult['enrichment'],
): CommandRunResult {
  return {
    command: 'patterns',
    ok: false,
    facts,
    artifacts,
    ...(enrichment ? { enrichment } : {}),
    error,
  };
}

export async function runPatterns(opts: CommandRunOptions): Promise<CommandRunResult> {
  const input = parseInput(opts.input);
  const artifacts: string[] = [];

  let modulesOnly: string[] | undefined;
  try {
    modulesOnly = parseModulesList(input.modules);
  } catch {
    return resultError(null, artifacts, DIR_ESCAPE_MSG);
  }

  let detailed: Awaited<ReturnType<typeof detectPatternsDetailed>>;
  try {
    const dnaPath = resolveSafePath(opts.cwd, 'DARE', 'dna-facts.json');
    const dna: DnaFacts | null = (await fs.pathExists(dnaPath))
      ? ((await fs.readJSON(dnaPath)) as DnaFacts)
      : null;
    detailed = await detectPatternsDetailed(opts.cwd, dna, {
      modulesOnly,
      ...(input.ast ? { ast: true } : {}),
    });
  } catch (err) {
    return resultError(
      null,
      artifacts,
      err instanceof Error ? err.message : String(err),
    );
  }
  const facts = detailed.facts;
  const summary = formatPatternsSummary(facts);

  if (detailed.extraction) {
    const extraction = detailed.extraction;
    summary.push(
      `  AST: ${extraction.astAvailable ? 'on' : 'off (regex fallback)'} - ${extraction.astPatternCount} ast patterns, ${extraction.regexPatternCount} regex patterns`,
    );
  }

  if (input.check) {
    summary.push('--check: detection only, no files written.');
    return {
      command: 'patterns',
      ok: true,
      facts,
      artifacts,
      summary,
    };
  }

  try {
    const dareDir = resolveSafePath(opts.cwd, 'DARE');
    await fs.ensureDir(dareDir);
    const factsPath = resolveSafePath(dareDir, 'patterns-facts.json');
    const patternsPath = resolveSafePath(dareDir, 'PATTERNS.md');
    await fs.writeJSON(
      factsPath,
      detailed.extraction ? { ...facts, extraction: detailed.extraction } : facts,
      { spaces: 2 },
    );
    await fs.writeFile(patternsPath, renderPatternsSkeleton(facts));
    artifacts.push('DARE/PATTERNS.md', 'DARE/patterns-facts.json');
  } catch (err) {
    return resultError(
      facts,
      artifacts,
      err instanceof Error ? err.message : String(err),
    );
  }

  const ingestion = await ingestPatternsBestEffort(opts.cwd, facts);
  if (ingestion) {
    summary.push(
      `  graph: +${ingestion.nodes} pattern node(s), +${ingestion.edges} edge(s)`,
    );
  }

  if (input.inject) {
    summary.push(
      '  --inject: DARE/PATTERNS.md registered as steering base (loader picks it up; user .dare/steering untouched).',
    );
  }

  let enrichment: CommandRunResult['enrichment'] | undefined;
  if (opts.ai) {
    enrichment = await runCommandEnrichment({
      command: 'patterns',
      cwd: opts.cwd,
      facts,
      provider: opts.provider,
    });
    if (!enrichment.ok) {
      return resultError(
        facts,
        artifacts,
        enrichment.error ?? 'AI enrichment failed',
        enrichment,
      );
    }
    if (enrichment.artifactPath) {
      artifacts.push(asRelativeArtifact(opts.cwd, enrichment.artifactPath));
    }
  }

  summary.push('Generated: DARE/PATTERNS.md, DARE/patterns-facts.json');

  return {
    command: 'patterns',
    ok: true,
    facts,
    artifacts,
    ...(enrichment ? { enrichment } : {}),
    summary,
  };
}

registerRunner('patterns', runPatterns);
