import fs from 'fs-extra';
import path from 'path';
import { runCommandEnrichment } from '../../ai/pipeline.js';
import {
  aggregate,
  parseSpecConfidence,
  renderCodeSpecMatrix,
  renderConfidenceReport,
  type SpecConfidence,
} from '../../utils/confidence.js';
import { extractDataModelDetailed, renderApiSurface, renderErd } from '../../utils/datamodel.js';
import { detectModules, type ModuleInfo } from '../../utils/module-detector.js';
import { detectProject, formatDetectionReport } from '../../utils/project-detector.js';
import { ensureDareSkills } from '../../utils/project-generator.js';
import {
  buildFacts,
  moduleSpecFilename,
  renderArchitectureExcalidraw,
  renderC4Component,
  renderC4ContainerSkeleton,
  renderC4ContextSkeleton,
  renderDomainRulesSkeleton,
  renderIdeiaSkeleton,
  renderModuleSpecSkeleton,
  renderPermissionsSkeleton,
  renderStateMachinesSkeleton,
  type ReverseFacts,
} from '../../utils/reverse-facts.js';
import { registerRunner, type CommandRunOptions, type CommandRunResult } from './types.js';

interface ReverseRunnerFlags {
  readonly check: boolean;
  readonly report: boolean;
  readonly deep: boolean;
  readonly ast: boolean;
  readonly excalidraw: boolean;
  readonly only?: string[];
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeReverseFlags(opts: CommandRunOptions): ReverseRunnerFlags {
  const input = opts.input ?? {};
  const deep = opts.deep ?? asBoolean(input.deep) ?? false;
  const modules = asString(input.modules);
  return {
    check: asBoolean(input.check) ?? false,
    report: asBoolean(input.report) ?? false,
    deep,
    ast: asBoolean(input.ast) ?? false,
    excalidraw: asBoolean(input.excalidraw) !== false,
    only: modules
      ? modules
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
      : undefined,
  };
}

function normalizePath(root: string, absolutePath: string): string {
  const rel = path.relative(root, absolutePath);
  if (rel && !rel.startsWith('..')) {
    return rel.replace(/\\/g, '/');
  }
  return absolutePath.replace(/\\/g, '/');
}

function formatExtractionLine(extraction: {
  astAvailable: boolean;
  astEndpoints: number;
  regexEndpoints: number;
  astEntities: number;
  regexEntities: number;
  astLanguages: readonly string[];
}): string {
  return (
    `AST: ${extraction.astAvailable ? 'on' : 'off (regex fallback)'} - `
    + `${extraction.astEndpoints} ast endpoints, ${extraction.regexEndpoints} regex endpoints; `
    + `${extraction.astEntities} ast entities, ${extraction.regexEntities} regex entities`
    + (extraction.astLanguages.length ? ` [${extraction.astLanguages.join(', ')}]` : '')
  );
}

export async function runReverse(opts: CommandRunOptions): Promise<CommandRunResult> {
  const targetDir = path.resolve(opts.cwd);
  const flags = normalizeReverseFlags(opts);

  if (flags.report) {
    return runConfidenceReport(targetDir);
  }

  try {
    if (!flags.check) {
      await ensureDareSkills(targetDir);
    }

    const detected = await detectProject(targetDir);
    const graph = await detectModules(targetDir, { only: flags.only });
    const summary: string[] = [
      `Stack detection:\n${formatDetectionReport(detected)}`,
      `Module map (strategy: ${graph.strategy}):\n${formatModuleReport(graph.modules)}`,
    ];

    if (graph.modules.length === 0) {
      summary.push('No modules with source code found. Nothing to reverse-engineer.');
      return {
        command: 'reverse',
        ok: true,
        facts: { detected, graph },
        artifacts: [],
        summary,
      };
    }

    if (flags.ast && !flags.deep) {
      summary.push('--ast has no effect without --deep; ignoring.');
    }

    const extractionOpts = flags.ast && flags.deep ? { ast: true as const } : undefined;
    const detailed = await extractDataModelDetailed(targetDir, extractionOpts);
    const model = detailed.model;

    if (flags.check) {
      if (flags.deep) {
        summary.push(`Deep: ${model.entities.length} entidade(s) e ${model.endpoints.length} endpoint(s) detectados.`);
        if (detailed.extraction) {
          summary.push(formatExtractionLine(detailed.extraction));
        }
      }
      summary.push('--check: detection only, no files written.');
      return {
        command: 'reverse',
        ok: true,
        facts: {
          detected,
          graph,
          model,
          ...(detailed.extraction ? { extraction: detailed.extraction } : {}),
        },
        artifacts: [],
        summary,
      };
    }

    const generatedAt = new Date().toISOString();
    const facts = buildFacts(detected, graph, generatedAt);
    const dareDir = path.join(targetDir, 'DARE');
    const reverseDir = path.join(dareDir, 'REVERSE');
    const artifacts: string[] = [];

    await fs.ensureDir(reverseDir);

    const factsWithModel = {
      ...facts,
      api: {
        endpoints: model.endpoints.length,
        entities: model.entities.length,
      },
      ...(detailed.extraction ? { extraction: detailed.extraction } : {}),
    };

    const reverseFactsPath = path.join(reverseDir, 'reverse-facts.json');
    await fs.writeJSON(reverseFactsPath, factsWithModel, { spaces: 2 });
    artifacts.push('DARE/REVERSE/reverse-facts.json');

    await fs.writeFile(
      path.join(dareDir, 'IDEIA.md'),
      renderIdeiaSkeleton(facts, flags.excalidraw, model),
    );
    artifacts.push('DARE/IDEIA.md');

    for (let i = 0; i < facts.modules.length; i += 1) {
      const mod = facts.modules[i];
      const fileName = moduleSpecFilename(i, mod);
      await fs.writeFile(
        path.join(reverseDir, fileName),
        renderModuleSpecSkeleton(mod, i, facts.modules.length, generatedAt, model),
      );
      artifacts.push(`DARE/REVERSE/${fileName}`);
    }

    if (flags.excalidraw) {
      await fs.writeFile(
        path.join(reverseDir, 'architecture.excalidraw'),
        renderArchitectureExcalidraw(facts),
      );
      artifacts.push('DARE/REVERSE/architecture.excalidraw');
    }

    if (flags.deep) {
      artifacts.push(...(await writeDeepArtifacts(targetDir, reverseDir, facts, model)));
    }

    let enrichment: CommandRunResult['enrichment'];
    if (opts.ai) {
      enrichment = await runCommandEnrichment({
        command: 'reverse',
        cwd: targetDir,
        facts: factsWithModel,
        provider: opts.provider,
        deep: flags.deep,
        signal: opts.signal,
        timeoutSeconds: opts.timeoutSeconds,
      });
      if (enrichment.artifactPath) {
        artifacts.push(normalizePath(targetDir, enrichment.artifactPath));
      }
      if (!enrichment.ok) {
        summary.push(`AI enrichment failed (${enrichment.provider}): ${enrichment.error ?? 'unknown error'}`);
        return {
          command: 'reverse',
          ok: false,
          facts: factsWithModel,
          artifacts,
          enrichment,
          summary,
          error: enrichment.error ?? 'AI enrichment failed',
        };
      }
    }

    summary.push(
      `Generated reverse artifacts (${model.endpoints.length} endpoints, ${model.entities.length} entities).`,
    );
    if (opts.ai) {
      summary.push('AI enrichment merged into reverse artifacts.');
    }

    return {
      command: 'reverse',
      ok: true,
      facts: factsWithModel,
      artifacts,
      ...(enrichment ? { enrichment } : {}),
      summary,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      command: 'reverse',
      ok: false,
      facts: {},
      artifacts: [],
      summary: ['Failed to run reverse heuristics.'],
      error,
    };
  }
}

async function writeDeepArtifacts(
  targetDir: string,
  reverseDir: string,
  facts: ReverseFacts,
  model: Awaited<ReturnType<typeof extractDataModelDetailed>>['model'],
): Promise<string[]> {
  const generatedAt = facts.generatedAt;
  const artifacts: string[] = [];

  await fs.writeFile(path.join(reverseDir, 'erd.md'), renderErd(model, generatedAt));
  artifacts.push('DARE/REVERSE/erd.md');
  await fs.writeFile(path.join(reverseDir, 'api-surface.md'), renderApiSurface(model, generatedAt));
  artifacts.push('DARE/REVERSE/api-surface.md');

  const c4Dir = path.join(reverseDir, 'c4');
  await fs.ensureDir(c4Dir);
  await fs.writeFile(path.join(c4Dir, 'c4-component.md'), renderC4Component(facts));
  artifacts.push('DARE/REVERSE/c4/c4-component.md');
  await fs.writeFile(path.join(c4Dir, 'c4-context.md'), renderC4ContextSkeleton(generatedAt));
  artifacts.push('DARE/REVERSE/c4/c4-context.md');
  await fs.writeFile(path.join(c4Dir, 'c4-container.md'), renderC4ContainerSkeleton(generatedAt));
  artifacts.push('DARE/REVERSE/c4/c4-container.md');

  await fs.writeFile(path.join(reverseDir, 'domain-rules.md'), renderDomainRulesSkeleton(generatedAt));
  artifacts.push('DARE/REVERSE/domain-rules.md');
  await fs.writeFile(path.join(reverseDir, 'state-machines.md'), renderStateMachinesSkeleton(generatedAt));
  artifacts.push('DARE/REVERSE/state-machines.md');
  await fs.writeFile(path.join(reverseDir, 'permissions.md'), renderPermissionsSkeleton(generatedAt));
  artifacts.push('DARE/REVERSE/permissions.md');

  const factsPath = path.join(reverseDir, 'reverse-facts.json');
  const saved = await fs.readJSON(factsPath).catch(() => null);
  if (saved) {
    saved.deep = {
      entities: model.entities.length,
      endpoints: model.endpoints.length,
      entityNames: model.entities.map((entity) => entity.name),
    };
    await fs.writeJSON(factsPath, saved, { spaces: 2 });
  }

  return artifacts.map((artifact) => normalizePath(targetDir, path.join(targetDir, artifact)));
}

async function runConfidenceReport(targetDir: string): Promise<CommandRunResult> {
  const dareDir = path.join(targetDir, 'DARE');
  const reverseDir = path.join(dareDir, 'REVERSE');

  try {
    if (!(await fs.pathExists(reverseDir))) {
      return {
        command: 'reverse',
        ok: false,
        facts: {},
        artifacts: [],
        summary: ['No DARE/REVERSE folder found.'],
        error: 'Run `dare reverse` before using --report.',
      };
    }

    const specs: SpecConfidence[] = [];
    const ideiaPath = path.join(dareDir, 'IDEIA.md');
    if (await fs.pathExists(ideiaPath)) {
      specs.push(parseSpecConfidence('IDEIA.md', await fs.readFile(ideiaPath, 'utf-8')));
    }

    const moduleFiles = (await fs.readdir(reverseDir))
      .filter((file) => /^module-.*\.md$/.test(file))
      .sort();

    for (const file of moduleFiles) {
      specs.push(parseSpecConfidence(file, await fs.readFile(path.join(reverseDir, file), 'utf-8')));
    }

    const { counts, index } = aggregate(specs);
    if (counts.total === 0) {
      return {
        command: 'reverse',
        ok: true,
        facts: { counts, index, specs: [] },
        artifacts: [],
        summary: [
          'No confidence markers found (green/yellow/red).',
          'Run /dare-reverse in your IDE to mark claims, then re-run --report.',
        ],
      };
    }

    const generatedAt = new Date().toISOString();
    const confidencePath = path.join(reverseDir, 'confidence-report.md');
    const matrixDir = path.join(reverseDir, 'traceability');
    const matrixPath = path.join(matrixDir, 'code-spec-matrix.md');

    await fs.writeFile(confidencePath, renderConfidenceReport(specs, generatedAt));
    await fs.ensureDir(matrixDir);
    await fs.writeFile(matrixPath, renderCodeSpecMatrix(specs, generatedAt));

    const factsPath = path.join(reverseDir, 'reverse-facts.json');
    if (await fs.pathExists(factsPath)) {
      const facts = await fs.readJSON(factsPath).catch(() => null);
      if (facts) {
        facts.confidence = {
          computedAt: generatedAt,
          index,
          counts,
          perSpec: specs.map((spec) => ({ spec: spec.spec, ...spec.counts, index: spec.index })),
        };
        await fs.writeJSON(factsPath, facts, { spaces: 2 });
      }
    }

    return {
      command: 'reverse',
      ok: true,
      facts: { counts, index, specs },
      artifacts: [
        normalizePath(targetDir, confidencePath),
        normalizePath(targetDir, matrixPath),
      ],
      summary: [
        `Confidence index: ${index}% (${counts.total} claims across ${specs.length} specs).`,
        `Gaps: ${counts.gap} | Confirmed: ${counts.confirmed} | Inferred: ${counts.inferred}`,
      ],
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      command: 'reverse',
      ok: false,
      facts: {},
      artifacts: [],
      summary: ['Failed to compute reverse confidence report.'],
      error,
    };
  }
}

function formatModuleReport(modules: ModuleInfo[]): string {
  if (modules.length === 0) return '  (none)';
  const icon: Record<string, string> = { LOW: 'L', MED: 'M', HIGH: 'H' };
  return modules
    .map((mod) => {
      const deps = mod.depends_on.length ? ` -> ${mod.depends_on.join(', ')}` : '';
      return (
        `  ${icon[mod.size] ?? '•'} ${mod.name} (${mod.path}) `
        + `- ${mod.size} - ${mod.fileCount} files - ${mod.loc} LOC${deps}`
      );
    })
    .join('\n');
}

registerRunner('reverse', runReverse);
