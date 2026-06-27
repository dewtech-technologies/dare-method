import fs from 'fs-extra';
import path from 'path';
import { runCommandEnrichment } from '../../ai/pipeline.js';
import { ensureDareSkills } from '../../utils/project-generator.js';
import { renderDnaSkeleton } from '../../utils/dna-facts.js';
import { detectDnaDetailed, type DnaFacts } from '../../utils/dna-detector.js';
import { registerRunner, type CommandRunOptions, type CommandRunResult } from './types.js';

interface DnaRunnerFlags {
  readonly check: boolean;
  readonly ast: boolean;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizePath(root: string, absolutePath: string): string {
  const rel = path.relative(root, absolutePath);
  if (rel && !rel.startsWith('..')) {
    return rel.replace(/\\/g, '/');
  }
  return absolutePath.replace(/\\/g, '/');
}

function normalizeDnaFlags(opts: CommandRunOptions): DnaRunnerFlags {
  const input = opts.input ?? {};
  return {
    check: asBoolean(input.check) ?? false,
    ast: asBoolean(input.ast) ?? false,
  };
}

export async function runDna(opts: CommandRunOptions): Promise<CommandRunResult> {
  const targetDir = path.resolve(opts.cwd);
  const flags = normalizeDnaFlags(opts);

  try {
    if (!flags.check) {
      await ensureDareSkills(targetDir);
    }

    const generatedAt = new Date().toISOString();
    const detailed = await detectDnaDetailed(
      targetDir,
      generatedAt,
      flags.ast ? { ast: true } : undefined,
    );
    const facts = detailed.facts;
    const summary = [formatDnaReport(facts)];

    if (detailed.extraction) {
      const extraction = detailed.extraction;
      summary.push(
        `AST: ${extraction.astAvailable ? 'on' : 'off (regex fallback)'} - `
        + `${extraction.astPatternCount} ast signals, ${extraction.regexPatternCount} regex layers`,
      );
    }

    if (flags.check) {
      summary.push('--check: detection only, no files written.');
      return {
        command: 'dna',
        ok: true,
        facts: {
          ...facts,
          ...(detailed.extraction ? { extraction: detailed.extraction } : {}),
        },
        artifacts: [],
        summary,
      };
    }

    const dareDir = path.join(targetDir, 'DARE');
    await fs.ensureDir(dareDir);

    const artifacts: string[] = [];
    const factsPath = path.join(dareDir, 'dna-facts.json');
    const dnaDocPath = path.join(dareDir, 'PROJECT-DNA.md');

    await fs.writeJSON(
      factsPath,
      detailed.extraction ? { ...facts, extraction: detailed.extraction } : facts,
      { spaces: 2 },
    );
    artifacts.push(normalizePath(targetDir, factsPath));

    await fs.writeFile(dnaDocPath, renderDnaSkeleton(facts));
    artifacts.push(normalizePath(targetDir, dnaDocPath));

    let enrichment: CommandRunResult['enrichment'];
    if (opts.ai) {
      enrichment = await runCommandEnrichment({
        command: 'dna',
        cwd: targetDir,
        facts,
        provider: opts.provider,
        signal: opts.signal,
        timeoutSeconds: opts.timeoutSeconds,
      });
      if (enrichment.artifactPath) {
        artifacts.push(normalizePath(targetDir, enrichment.artifactPath));
      }
      if (!enrichment.ok) {
        summary.push(`AI enrichment failed (${enrichment.provider}): ${enrichment.error ?? 'unknown error'}`);
        return {
          command: 'dna',
          ok: false,
          facts,
          artifacts,
          enrichment,
          summary,
          error: enrichment.error ?? 'AI enrichment failed',
        };
      }
    }

    summary.push('PROJECT-DNA.md generated from deterministic convention extraction.');
    if (opts.ai) {
      summary.push('AI enrichment merged into DNA artifacts.');
    }

    return {
      command: 'dna',
      ok: true,
      facts,
      artifacts,
      ...(enrichment ? { enrichment } : {}),
      summary,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      command: 'dna',
      ok: false,
      facts: {},
      artifacts: [],
      summary: ['Failed to run DNA extraction.'],
      error,
    };
  }
}

function formatDnaReport(facts: DnaFacts): string {
  const lines: string[] = [];
  const linters = facts.tooling.linters.map((item) => item.name).join(', ') || '-';
  const formatters = facts.tooling.formatters.map((item) => item.name).join(', ') || '-';
  lines.push('Conventions detected:');
  lines.push(`  Linters:      ${linters}`);
  lines.push(`  Formatters:   ${formatters}`);
  lines.push(`  Architecture: ${facts.architecture.guess}`);
  if (facts.architecture.detectedLayers.length) {
    lines.push(`  Layers:       ${facts.architecture.detectedLayers.join(', ')}`);
  }
  const testing = facts.testing;
  lines.push(
    `  Testing:      ${testing.framework ?? 'unknown'} `
    + `(${testing.testFiles} test / ${testing.prodFiles} prod, ratio ${testing.ratio})`,
  );
  const libs = Object.entries(facts.libraries)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ') || '-';
  lines.push(`  Libraries:    ${libs}`);
  if (facts.commits) {
    lines.push(
      `  Commits:      ${facts.commits.conventional ? 'Conventional Commits' : 'free-form'} `
      + `(${facts.commits.sampled} sampled)`,
    );
  }
  const naming = facts.naming.map((item) => `${item.extension}:${item.dominant}`).join(', ') || '-';
  lines.push(`  Naming:       ${naming}`);
  return lines.join('\n');
}

registerRunner('dna', runDna);
