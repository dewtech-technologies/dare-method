import fs from 'fs-extra';
import path from 'path';
import { splitProposalFromRefineSemantic } from '../../ai/refine-bridge.js';
import { runCommandEnrichment } from '../../ai/pipeline.js';
import { RefineSemanticSchema } from '../../ai/schemas.js';
import {
  DEFAULT_STATE_PATH,
  loadAndApplyState,
  saveState,
} from '../../dag-runner/state-store.js';
import {
  CycleError,
  MaxDepthError,
  spliceSubDag,
  type SubTask,
} from '../../dag-runner/sub-dag.js';
import type {
  ComplexityReport,
  RefineVerdict,
  SplitProposal,
} from '../../types/Refine.types.js';
import { analyzeTaskComplexity, type ComplexityThresholds, proposeSplit } from '../../utils/complexity-analyzer.js';
import { convertDagToYaml, convertYamlToDag } from '../../utils/dag-converter.js';
import { findSpecFile, parseFilesFromSpec } from '../../utils/ReviewRunner.js';
import { readProjectConfig } from '../../utils/UpdateDetector.js';
import { registerRunner } from './types.js';
import type { CommandRunOptions, CommandRunResult } from './types.js';

interface RefineInput {
  readonly taskId: string;
  readonly split: boolean;
  readonly apply: boolean;
  readonly strict: boolean;
  readonly format: 'human' | 'json';
  readonly fromAgent?: string;
}

export interface RefineRunFacts {
  readonly report: ComplexityReport;
  readonly proposal?: SplitProposal;
  readonly agentVerdict?: RefineVerdict;
  readonly applied: boolean;
  readonly strictFailure: boolean;
}

function asRecord(input: CommandRunOptions['input']): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  return input as Record<string, unknown>;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readFormat(value: unknown): 'human' | 'json' {
  return value === 'json' ? 'json' : 'human';
}

function readInput(input: CommandRunOptions['input']): RefineInput {
  const raw = asRecord(input);
  return {
    taskId: readRequiredString(raw.taskId, 'input.taskId'),
    split: readBoolean(raw.split),
    apply: readBoolean(raw.apply),
    strict: readBoolean(raw.strict),
    format: readFormat(raw.format),
    fromAgent: readOptionalString(raw.fromAgent),
  };
}

function toArtifactPath(cwd: string, artifactPath: string): string {
  const normalizedCwd = cwd.replace(/\\/g, '/');
  const normalizedArtifact = artifactPath.replace(/\\/g, '/');
  if (normalizedArtifact.startsWith(normalizedCwd)) {
    return normalizedArtifact.slice(normalizedCwd.length + 1);
  }
  return normalizedArtifact;
}

async function readThresholds(cwd: string): Promise<ComplexityThresholds | undefined> {
  try {
    const cfg = (await readProjectConfig(cwd)) as Record<string, unknown>;
    const refine = cfg.refine as { thresholds?: ComplexityThresholds } | undefined;
    return refine?.thresholds;
  } catch {
    return undefined;
  }
}

export async function buildSplitProposal(
  taskId: string,
  projectRoot: string,
): Promise<SplitProposal> {
  const specPath = await findSpecFile(projectRoot, taskId);
  if (!specPath) {
    return { originalTaskId: taskId, subtasks: [], notes: 'Spec não encontrada.' };
  }
  const md = await fs.readFile(specPath, 'utf-8');
  const files = parseFilesFromSpec(md);
  return proposeSplit(taskId, files);
}

async function loadAgentVerdict(filePath: string): Promise<RefineVerdict> {
  if (!(await fs.pathExists(filePath))) {
    throw new Error(`--from-agent file not found: ${filePath}`);
  }
  const data = await fs.readJSON(filePath);
  if (typeof data?.manageable !== 'boolean' || !Array.isArray(data?.reasons)) {
    throw new Error(
      `Invalid refine verdict in ${filePath}: needs { manageable: boolean, reasons: string[] }.`,
    );
  }
  return data as RefineVerdict;
}

function resolveSpecDir(parentSpecFile: string | undefined): string {
  if (!parentSpecFile) return 'DARE/EXECUTION';
  const normalized = parentSpecFile.replace(/\\/g, '/');
  const dir = path.posix.dirname(normalized);
  return dir === '.' ? 'DARE/EXECUTION' : dir;
}

function proposalToSubTasks(
  dag: { tasks: Array<{ id: string; depends_on: string[]; spec_file?: string }> },
  parentId: string,
  proposal: SplitProposal,
): ReadonlyArray<SubTask> {
  const parent = dag.tasks.find((task) => task.id === parentId);
  if (!parent) throw new Error(`Task "${parentId}" não encontrada no DAG.`);
  const baseSpecDir = resolveSpecDir(parent.spec_file);

  return proposal.subtasks.map((subtask, idx) => ({
    id: subtask.id,
    parentId,
    dependsOn: idx === 0 ? [...parent.depends_on] : [proposal.subtasks[idx - 1].id],
    specPath: path.posix.join(baseSpecDir, `${subtask.id}.md`),
  }));
}

async function readLoopMaxDepth(cwd: string): Promise<number> {
  let rawConfig: unknown = {};
  try {
    rawConfig = await readProjectConfig(cwd);
  } catch {
    rawConfig = {};
  }

  const value = (rawConfig as { verification?: { loop?: { maxDepth?: unknown } } })
    .verification?.loop?.maxDepth;

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  return 2;
}

async function applySplitToDag(
  projectRoot: string,
  taskId: string,
  proposal: SplitProposal,
): Promise<boolean> {
  const dagPath = path.join(projectRoot, 'DARE', 'dare-dag.yaml');
  if (!(await fs.pathExists(dagPath))) {
    throw new Error(`DAG não encontrado em ${dagPath}.`);
  }

  const dag = convertYamlToDag(await fs.readFile(dagPath, 'utf-8'));
  const statePath = path.join(projectRoot, DEFAULT_STATE_PATH);
  await loadAndApplyState(dag, statePath);

  const subTasks = proposalToSubTasks(dag, taskId, proposal);
  const maxDepth = await readLoopMaxDepth(projectRoot);
  const result = spliceSubDag(dag, taskId, subTasks, maxDepth);
  if (result.inserted.length === 0) {
    return false;
  }

  await fs.writeFile(dagPath, convertDagToYaml(result.dag));
  await saveState(result.dag, statePath);
  return true;
}

export async function runRefine(opts: CommandRunOptions): Promise<CommandRunResult> {
  let enrichment: CommandRunResult['enrichment'];
  try {
    const input = readInput(opts.input);
    if (input.apply && !input.split) {
      return {
        command: 'refine',
        ok: false,
        facts: { taskId: input.taskId },
        artifacts: [],
        error: '--apply exige --split.',
      };
    }

    const thresholds = await readThresholds(opts.cwd);
    const report = await analyzeTaskComplexity(input.taskId, opts.cwd, { thresholds });
    if (!report) {
      return {
        command: 'refine',
        ok: false,
        facts: { taskId: input.taskId },
        artifacts: [],
        error: `Não foi possível analisar a task ${input.taskId}.`,
      };
    }

    let proposal: SplitProposal | undefined;
    if (input.split) {
      proposal = await buildSplitProposal(input.taskId, opts.cwd);
    }

    if (opts.ai) {
      const specPath = await findSpecFile(opts.cwd, input.taskId);
      const spec = specPath ? await fs.readFile(specPath, 'utf-8') : '';
      enrichment = await runCommandEnrichment({
        command: 'refine',
        cwd: opts.cwd,
        facts: { taskId: input.taskId, report, proposal, spec },
        provider: opts.provider,
        deep: opts.deep,
      });

      if (!enrichment.ok) {
        return {
          command: 'refine',
          ok: false,
          facts: { report, proposal },
          artifacts: [],
          enrichment,
          error: enrichment.error ?? 'AI enrichment failed for refine.',
        };
      }

      if (enrichment.data) {
        proposal = splitProposalFromRefineSemantic(
          input.taskId,
          RefineSemanticSchema.parse(enrichment.data),
        );
      }
    }

    let agentVerdict: RefineVerdict | undefined;
    if (input.fromAgent) {
      agentVerdict = await loadAgentVerdict(input.fromAgent);
    }

    let applied = false;
    if (input.apply && proposal) {
      applied = await applySplitToDag(opts.cwd, input.taskId, proposal);
    }

    const strictFailure =
      input.strict && (report.level === 'HIGH' || report.level === 'CRITICAL');

    const facts: RefineRunFacts = {
      report,
      ...(proposal ? { proposal } : {}),
      ...(agentVerdict ? { agentVerdict } : {}),
      applied,
      strictFailure,
    };

    const artifacts =
      enrichment?.artifactPath ? [toArtifactPath(opts.cwd, enrichment.artifactPath)] : [];

    return {
      command: 'refine',
      ok: !strictFailure,
      facts,
      artifacts,
      enrichment,
      summary: [
        `taskId=${report.taskId}`,
        `level=${report.level}`,
        `score=${report.score.toFixed(1)}`,
        `split=${String(input.split)}`,
        `apply=${String(input.apply)}`,
        `format=${input.format}`,
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof MaxDepthError || err instanceof CycleError) {
      return {
        command: 'refine',
        ok: false,
        facts: { taskId: asRecord(opts.input).taskId },
        artifacts: [],
        enrichment,
        error: message,
      };
    }

    return {
      command: 'refine',
      ok: false,
      facts: { taskId: asRecord(opts.input).taskId },
      artifacts: [],
      enrichment,
      error: message,
    };
  }
}

registerRunner('refine', runRefine);
