import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { createInterface } from 'node:readline/promises';
import {
  applyCascadingSkip,
  buildTaskPrompt,
  computeRanks,
  markDone,
  markFailed,
  markRunning,
  nextExecutableTasks,
  renderCanvas,
  type Dag,
  type DagTask,
  type TaskStatus,
} from '../dag-runner/run_dag.js';
import { convertYamlToDag } from '../utils/dag-converter.js';
import { createGraph, loadGraphConfig } from '../graphrag/index.js';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import {
  DEFAULT_STATE_PATH,
  appendAttempt,
  getAttempts,
  loadAndApplyState,
  saveState,
} from '../dag-runner/state-store.js';
import {
  resolveStackFromConfig,
  runRalphLoop,
} from '../dag-runner/ralph-loop.js';
import { runReview } from '../utils/ReviewRunner.js';
import { readProjectConfig } from '../utils/UpdateDetector.js';
import { buildLocateContext, loadGraphLocateConfig } from '../dag-runner/graph-locate.js';
import type { AgentDriver, AgentRunResult, TokenUsage } from '../agent/driver.js';
import { BudgetTracker } from '../agent/budget.js';
import { recordCostTelemetry } from '../agent/telemetry.js';
import { mockDriver } from '../agent/drivers/mock.js';
import {
  AgentSdkMissingError,
  createClaudeDriver,
} from '../agent/drivers/claude.js';
import {
  createCodexCliDriver,
  type CodexApproval,
  type CodexSandbox,
} from '../agent/drivers/codex.js';
import { runIncrementalSemanticIndex } from '../graphrag/incremental-index.js';
import {
  gateToAspect,
  loadVerificationConfig,
  recordFailureAndVerdict,
  runPostRalphVerification,
  shouldRunVerification,
  validateBestOf,
  validatePolicy,
  validateFormalBackend,
  applyPolicyOverride,
  resolveBestOfCount,
} from './execute-verification.js';
import { parseVerificationConfig } from '../verification/config.js';
import { decideNextAction } from '../verification/decay/policy.js';
import { failureSignature } from '../verification/decay/signature.js';
import { recordVerification, recordFormalProof } from '../verification/telemetry.js';
import type {
  Aspect,
  AttemptRecord,
  FormalVerdict,
  VerificationConfig,
  VerificationResult,
} from '../verification/types.js';
import { runBestOfN } from '../verification/best-of-n/runner.js';
import {
  NoViableCandidateError,
  selectByPareto,
} from '../verification/best-of-n/selector/pareto.js';
import { createLogger } from '../utils/logger.js';
import { parseGuardConfig, type GuardConfig } from '../guard/config.js';
import type { BoundaryIntent } from '../guard/boundary.js';
import { runGuardPipeline } from '../guard/pipeline.js';
import type { GuardedArtifact } from '../guard/types.js';
import { loadSteeringFiles } from '../steering/loader.js';
import {
  CycleError,
  MaxDepthError,
  spliceSubDag,
  type SubTask,
} from '../dag-runner/sub-dag.js';
import { buildSplitProposal } from './refine.js';

const execLog = createLogger('execute');

/**
 * `dare execute` — orchestrate DAG execution.
 *
 * The DARE CLI **does not** invoke any LLM API. Execution happens inside the
 * IDE the user is already authenticated in (Cursor / Antigravity / Claude
 * Code). This command is a coordinator the IDE agent calls into:
 *
 *   dare execute --next                      → print next executable tasks + prompts
 *   dare execute --complete <id> --output …  → mark a task DONE, ingest into graph
 *   dare execute --fail <id> --reason …      → mark a task FAILED + cascade-skip
 *   dare execute --status                    → render canvas + summary
 *   dare execute --reset <id>                → re-open a task (PENDING) for retry
 *
 * No flags = `--status`.
 */

interface ExecuteOptions {
  dag: string;
  agent: boolean;
  next: boolean;
  status: boolean;
  watch: boolean;
  complete?: string;
  fail?: string;
  reset?: string;
  output?: string;
  reason?: string;
  tokens?: string;
  duration?: string;
  noGraph: boolean;
  parallelHint: boolean;
  verify?: boolean;
  noVerify?: boolean;
  fullMutation?: boolean;
  verdictJson?: boolean;
  bestOf?: string;
  policy?: string;
  prerank?: boolean;
  formal?: boolean;
  noFormal?: boolean;
  formalBackend?: string;
  budgetTokens?: string;
  requireApproval?: string;
  onFail?: string;
  driver?: string;
  dryRun?: boolean;
}

export const executeCommand = new Command('execute')
  .description('Orchestrate DAG execution (the IDE agent runs each task)')
  .option('--dag <file>', 'Path to dare-dag.yaml', 'DARE/dare-dag.yaml')
  .option('--agent', 'Run the autonomous executor loop', false)
  .option('--next', 'Print the next executable tasks (with composed prompts)', false)
  .option('--status', 'Render canvas and show summary (default action)', false)
  .option('--watch', 'Stream task readiness (re-print on every state change). Implies --next.', false)
  .option('--complete <id>', 'Mark a task DONE (use with --output)')
  .option('--fail <id>', 'Mark a task FAILED (use with --reason)')
  .option('--reset <id>', 'Reset a task back to PENDING')
  .option('--output <text>', 'Captured task output (used with --complete)')
  .option('--reason <text>', 'Failure reason (used with --fail)')
  .option('--tokens <n>', 'Tokens consumed (used with --complete)')
  .option('--duration <ms>', 'Task duration in ms (used with --complete)')
  .option('--no-graph', 'Skip knowledge-graph ingestion for this call', false)
  .option('--parallel-hint', 'When using --next, mark every rank-equal task as RUNNING', false)
  .option('--verify', 'Run verification core after Ralph Loop passes', false)
  .option('--no-verify', 'Skip verification even when enabled in dare.config.json', false)
  .option('--full-mutation', 'Disable incremental mutation for this completion', false)
  .option('--verdict-json', 'Emit LoopVerdict as JSON on stdout', false)
  .option('--best-of <n>', 'Run N verification candidates (best-of-N)')
  .option('--policy <p>', 'Override loop policy (decay|fixed)')
  .option('--prerank', 'Enable exec-free prerank ordering (never authorizes DONE)', false)
  .option('--formal', 'Enable formal verification gate for this completion', false)
  .option('--no-formal', 'Skip formal verification even when enabled in config', false)
  .option('--formal-backend <backend>', 'Formal backend override (dafny|verus|lean)')
  .option('--budget-tokens <n>', 'Token budget cap for --agent mode')
  .option('--driver <name>', 'Agent driver for --agent (claude|codex|mock)')
  .option(
    '--require-approval <mode>',
    'Approval mode for --agent (rank|none)',
    'rank',
  )
  .option(
    '--on-fail <mode>',
    'Action when a failed attempt does not resolve (replan|escalate|stop)',
    'escalate',
  )
  .option('--dry-run', 'Use mock driver instead of the configured agent driver', false)
  .action(async (options: ExecuteOptions) => {
    const cwd = process.cwd();
    const dagPath = path.resolve(cwd, options.dag);
    const canvasPath = path.resolve(cwd, 'DARE/.canvas.md');

    if (!(await fs.pathExists(dagPath))) {
      console.error(chalk.red(`❌ ${options.dag} not found.`));
      console.log(chalk.yellow('Run: dare blueprint'));
      process.exit(1);
    }

    const stateFile = path.resolve(cwd, DEFAULT_STATE_PATH);
    const dag = await loadDag(dagPath);
    await loadAndApplyState(dag, stateFile);

    const graph = options.noGraph ? undefined : await tryOpenGraph(cwd);

    try {
      if (options.agent) {
        await handleAgent(dag, options, stateFile, canvasPath, graph, cwd);
      } else if (options.complete) {
        await handleComplete(dag, options, stateFile, canvasPath, graph);
      } else if (options.fail) {
        await handleFail(dag, options, stateFile, canvasPath, graph);
      } else if (options.reset) {
        await handleReset(dag, options.reset, stateFile, canvasPath, graph);
      } else if (options.watch) {
        await handleWatch(dagPath, stateFile, canvasPath, options);
      } else if (options.next) {
        await handleNext(dag, options, stateFile, canvasPath, graph, cwd);
      } else {
        // Default: --status
        await handleStatus(dag, canvasPath);
      }
    } finally {
      await Promise.resolve(graph?.close());
    }
  });

type RequireApprovalMode = 'rank' | 'none';
type OnFailMode = 'replan' | 'escalate' | 'stop';
type AgentExecutionAction =
  | 'DONE'
  | 'CONTINUE'
  | 'FRESH_START'
  | 'REPLAN'
  | 'ESCALATE'
  | 'STOP';

interface AgentRuntimeConfig {
  readonly provider: AgentProviderName;
  readonly model: string;
  readonly apiKeyEnv?: string;
  readonly maxTokens?: number;
  readonly codexCommand?: string;
  readonly codexSandbox?: CodexSandbox;
  readonly codexApproval?: CodexApproval;
  readonly timeoutSeconds?: number;
  readonly guard: GuardConfig;
}

interface PreflightGuardResult {
  readonly verdict: 'PASS' | 'WARN' | 'FAIL';
  readonly artifacts: ReadonlyArray<GuardedArtifact>;
  readonly reason?: string;
}

type PreflightGuardFn = (
  task: DagTask,
  guardConfig: GuardConfig,
) => Promise<PreflightGuardResult>;

type ResolveDriverFn = (
  args: ExecuteOptions,
  config: AgentRuntimeConfig,
) => Promise<AgentDriver>;

type RankApprovalFn = (
  rank: number,
  tasks: ReadonlyArray<DagTask>,
) => Promise<boolean>;
type ApprovalGateResult = 'proceed' | 'stop';

interface AgentCandidate {
  readonly id: string;
  readonly run: AgentRunResult;
  readonly verification: VerificationResult;
}

interface RefineSplitResult {
  readonly subTasks: ReadonlyArray<SubTask>;
}

const GUARD_FAIL_EXIT_CODE = 6;
type AgentProviderName = 'claude' | 'codex' | 'mock';
const DEFAULT_AGENT_MODEL = 'claude-sonnet-4-5';

const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  model: 'agent-error',
};

type PreflightTargetRole = 'spec' | 'steering';

interface PreflightTarget {
  readonly path: string;
  readonly role: PreflightTargetRole;
}

function normalizePreflightPath(rawPath: string): string {
  return rawPath
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '');
}

function inferBoundaryIntent(artifactPath: string): BoundaryIntent {
  const normalized = normalizePreflightPath(artifactPath).toLowerCase();
  if (normalized.includes('/hooks/')) return 'execute-hook';
  if (normalized.includes('/gates/') || normalized.endsWith('dare-dag.yaml')) {
    return 'reorder-gate';
  }
  return 'read';
}

function preflightFailReason(verdict: ReturnType<typeof runGuardPipeline>['result']): string {
  const finding =
    verdict.findings.find((item) => item.severity === 'FAIL') ??
    verdict.findings[0];
  if (!finding) return `${verdict.artifact}: guard preflight failed`;
  return `${verdict.artifact}: [${finding.layer}:${finding.rule}] ${finding.evidence}`;
}

async function collectPreflightTargets(
  cwd: string,
  task: DagTask,
): Promise<PreflightTarget[]> {
  const targets = new Map<string, PreflightTargetRole>();
  if (task.spec_file && task.spec_file.trim().length > 0) {
    targets.set(normalizePreflightPath(task.spec_file), 'spec');
  }
  for (const steering of loadSteeringFiles(cwd)) {
    const normalized = normalizePreflightPath(steering.path);
    if (!targets.has(normalized)) targets.set(normalized, 'steering');
  }

  return [...targets.entries()].map(([filePath, role]) => ({
    path: filePath,
    role,
  }));
}

const defaultPreflightGuard: PreflightGuardFn = async (task, guardConfig) => {
  if (!guardConfig.enabled || !guardConfig.onExecute) {
    return { verdict: 'PASS', artifacts: [] };
  }

  const cwd = process.cwd();
  let targets: PreflightTarget[];
  try {
    targets = await collectPreflightTargets(cwd, task);
  } catch (err) {
    return {
      verdict: 'FAIL',
      artifacts: [],
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const steeringArtifacts: GuardedArtifact[] = [];
  let overallVerdict: PreflightGuardResult['verdict'] = 'PASS';

  for (const target of targets) {
    const artifactAbsPath = path.resolve(cwd, target.path);
    if (!(await fs.pathExists(artifactAbsPath))) continue;
    const stat = await fs.stat(artifactAbsPath);
    if (!stat.isFile()) continue;

    const content = await fs.readFile(artifactAbsPath);
    const pipeline = runGuardPipeline(artifactAbsPath, content, guardConfig, {
      cwd,
      boundaryIntent: inferBoundaryIntent(target.path),
    });

    if (target.role === 'steering' && pipeline.result.verdict !== 'FAIL') {
      steeringArtifacts.push(pipeline.artifact);
    }

    if (pipeline.result.verdict === 'FAIL') {
      return {
        verdict: 'FAIL',
        artifacts: [],
        reason: preflightFailReason(pipeline.result),
      };
    }
    if (pipeline.result.verdict === 'WARN') {
      overallVerdict = 'WARN';
    }
  }

  return {
    verdict: overallVerdict,
    artifacts: steeringArtifacts,
  };
};

const defaultRankApproval: RankApprovalFn = async (rank, tasks) => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(`Rank ${rank}: ${tasks.length} task(s). Proceder? [y/N] `);
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
};

let preflightGuardImpl: PreflightGuardFn = defaultPreflightGuard;
let resolveDriverOverride: ResolveDriverFn | null = null;
let rankApprovalImpl: RankApprovalFn = defaultRankApproval;

export function setPreflightGuardForTests(
  fn: PreflightGuardFn | null,
): void {
  preflightGuardImpl = fn ?? defaultPreflightGuard;
}

export function setResolveDriverForTests(
  fn: ResolveDriverFn | null,
): void {
  resolveDriverOverride = fn;
}

export function setRankApprovalForTests(fn: RankApprovalFn | null): void {
  rankApprovalImpl = fn ?? defaultRankApproval;
}

export async function resolveDriver(
  args: ExecuteOptions,
  config: AgentRuntimeConfig,
): Promise<AgentDriver> {
  if (resolveDriverOverride) {
    return resolveDriverOverride(args, config);
  }
  if (args.dryRun) return mockDriver;
  const provider = parseAgentProvider(args.driver) ?? config.provider;
  if (provider === 'mock') return mockDriver;
  if (provider === 'codex') {
    const model =
      config.provider !== 'codex' && config.model === DEFAULT_AGENT_MODEL
        ? undefined
        : config.model || undefined;
    return createCodexCliDriver({
      command: config.codexCommand,
      model,
      sandbox: config.codexSandbox,
      approval: config.codexApproval,
      timeoutSeconds: config.timeoutSeconds,
    });
  }
  return createClaudeDriver({
    model: config.model || DEFAULT_AGENT_MODEL,
    apiKeyEnv: config.apiKeyEnv,
    maxTokens: config.maxTokens,
  });
}

function parseAgentProvider(raw: string | undefined): AgentProviderName | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'claude' || normalized === 'claude-sdk') return 'claude';
  if (normalized === 'codex' || normalized === 'codex-cli') return 'codex';
  if (normalized === 'mock' || normalized === 'dry-run') return 'mock';
  return null;
}

function parseRequireApprovalMode(raw: string | undefined): RequireApprovalMode | null {
  if (!raw || raw === 'rank') return 'rank';
  if (raw === 'none') return 'none';
  return null;
}

function isInteractiveRuntime(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function gateRank(
  rank: number,
  tasks: ReadonlyArray<DagTask>,
  mode: RequireApprovalMode,
): Promise<ApprovalGateResult> {
  if (mode === 'none') return 'proceed';
  const ok = await rankApprovalImpl(rank, tasks);
  return ok ? 'proceed' : 'stop';
}

function parseOnFailMode(raw: string | undefined): OnFailMode | null {
  if (!raw || raw === 'escalate') return 'escalate';
  if (raw === 'replan') return 'replan';
  if (raw === 'stop') return 'stop';
  return null;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

function usageTotals(candidates: ReadonlyArray<AgentCandidate>): TokenUsage {
  const totals = candidates.reduce(
    (acc, candidate) => {
      acc.inputTokens += candidate.run.usage.inputTokens;
      acc.outputTokens += candidate.run.usage.outputTokens;
      acc.costUsd += candidate.run.usage.costUsd;
      acc.models.add(candidate.run.usage.model);
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, costUsd: 0, models: new Set<string>() },
  );
  const model =
    totals.models.size === 1 ? (totals.models.values().next().value ?? 'unknown') : 'mixed';
  return {
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    costUsd: Number(totals.costUsd.toFixed(6)),
    model,
  };
}

function verificationFromRun(taskId: string, run: AgentRunResult): VerificationResult {
  if (run.status === 'implemented') {
    return {
      taskId,
      passed: true,
      aspects: [
        { aspect: 'build', verdict: 'PASS', reason: 'agent candidate built', durationMs: 0 },
        { aspect: 'test', verdict: 'PASS', reason: 'agent candidate tested', durationMs: 0 },
        { aspect: 'lint', verdict: 'PASS', reason: 'agent candidate linted', durationMs: 0 },
      ],
      durationMs: 0,
    };
  }

  const reason =
    run.status === 'aborted'
      ? 'driver aborted candidate execution'
      : (run.failureSignature ?? run.summary) || 'driver failed candidate execution';
  return {
    taskId,
    passed: false,
    aspects: [
      {
        aspect: 'test',
        verdict: 'FAIL',
        reason,
        durationMs: 0,
      },
    ],
    durationMs: 0,
  };
}

function selectParetoCandidate(candidates: ReadonlyArray<AgentCandidate>): AgentCandidate {
  const mapped = candidates.map((candidate) => ({
    id: candidate.id,
    worktree: {
      id: candidate.id,
      path: candidate.run.worktree,
      branch: `dare/agent/${candidate.id}`,
    },
    verification: candidate.verification,
  }));

  try {
    const winner = selectByPareto(mapped);
    return (
      candidates.find((candidate) => candidate.id === winner.id) ??
      candidates[0]
    );
  } catch (err) {
    if (err instanceof NoViableCandidateError) {
      return candidates[0];
    }
    throw err;
  }
}

function failureReasonFromVerification(result: VerificationResult): string {
  const failed = result.aspects.filter((aspect) => aspect.verdict === 'FAIL');
  if (failed.length === 0) return 'candidate verification failed';
  return failed.map((aspect) => `${aspect.aspect}: ${aspect.reason}`).join('\n');
}

function resolveAgentAction(
  action: AgentExecutionAction,
  onFail: OnFailMode,
  budgetExhausted: boolean,
): AgentExecutionAction {
  if (action === 'DONE') return 'DONE';
  if (budgetExhausted) return 'ESCALATE';
  if (action !== 'CONTINUE') return action;
  if (onFail === 'replan') return 'REPLAN';
  if (onFail === 'stop') return 'STOP';
  return 'ESCALATE';
}

async function loadTaskSpec(cwd: string, task: DagTask): Promise<string> {
  if (!task.spec_file) return task.subtask_prompt;
  const specPath = path.resolve(cwd, task.spec_file);
  if (!(await fs.pathExists(specPath))) return task.subtask_prompt;
  return fs.readFile(specPath, 'utf8');
}

async function refineSplit(task: DagTask, cwd: string): Promise<RefineSplitResult> {
  const proposal = await buildSplitProposal(task.id, cwd);
  const subTasks = proposal.subtasks.map((subtask, idx) => {
    const dependsOn =
      idx === 0 ? [...task.depends_on] : [proposal.subtasks[idx - 1]!.id];
    return {
      id: subtask.id,
      parentId: task.id,
      dependsOn,
      specPath: `DARE/EXECUTION/${subtask.id}.md`,
    } satisfies SubTask;
  });
  return { subTasks };
}

function replaceDagState(target: Dag, source: Dag): void {
  target.title = source.title;
  target.version = source.version;
  target.generated = source.generated;
  target.limits = source.limits;
  target.models = source.models;
  target.tasks = source.tasks;
}

async function loadAgentRuntimeConfig(cwd: string): Promise<AgentRuntimeConfig> {
  let rawConfig: Record<string, unknown> = {};
  try {
    rawConfig = (await readProjectConfig(cwd)) as Record<string, unknown>;
  } catch {
    rawConfig = {};
  }

  const guard = parseGuardConfig(rawConfig);
  const agent =
    typeof rawConfig.agent === 'object' && rawConfig.agent !== null
      ? (rawConfig.agent as Record<string, unknown>)
      : {};
  const provider =
    parseAgentProvider(
      typeof agent.provider === 'string'
        ? agent.provider
        : typeof agent.driver === 'string'
          ? agent.driver
          : undefined,
    ) ?? 'claude';
  const model =
    typeof agent.model === 'string' && agent.model.trim().length > 0
      ? agent.model
      : provider === 'claude'
        ? DEFAULT_AGENT_MODEL
        : '';
  const apiKeyEnv =
    typeof agent.apiKeyEnv === 'string' && agent.apiKeyEnv.trim().length > 0
      ? agent.apiKeyEnv
      : undefined;
  const maxTokens =
    typeof agent.maxTokens === 'number' &&
    Number.isInteger(agent.maxTokens) &&
    agent.maxTokens > 0
      ? agent.maxTokens
      : undefined;
  const codex =
    typeof agent.codex === 'object' && agent.codex !== null
      ? (agent.codex as Record<string, unknown>)
      : {};
  const codexCommand =
    typeof agent.command === 'string' && agent.command.trim().length > 0
      ? agent.command
      : typeof codex.command === 'string' && codex.command.trim().length > 0
        ? codex.command
        : undefined;
  const codexSandbox = parseCodexSandbox(
    typeof agent.sandbox === 'string'
      ? agent.sandbox
      : typeof codex.sandbox === 'string'
        ? codex.sandbox
        : undefined,
  );
  const codexApproval = parseCodexApproval(
    typeof agent.approval === 'string'
      ? agent.approval
      : typeof codex.approval === 'string'
        ? codex.approval
        : undefined,
  );
  const timeoutSeconds =
    typeof agent.timeoutSeconds === 'number' &&
    Number.isInteger(agent.timeoutSeconds) &&
    agent.timeoutSeconds > 0
      ? agent.timeoutSeconds
      : typeof codex.timeoutSeconds === 'number' &&
          Number.isInteger(codex.timeoutSeconds) &&
          codex.timeoutSeconds > 0
        ? codex.timeoutSeconds
        : undefined;

  return {
    provider,
    model,
    apiKeyEnv,
    maxTokens,
    codexCommand,
    codexSandbox,
    codexApproval,
    timeoutSeconds,
    guard,
  };
}

function parseCodexSandbox(raw: string | undefined): CodexSandbox | undefined {
  if (raw === 'read-only' || raw === 'workspace-write' || raw === 'danger-full-access') {
    return raw;
  }
  return undefined;
}

function parseCodexApproval(raw: string | undefined): CodexApproval | undefined {
  if (raw === 'untrusted' || raw === 'on-request' || raw === 'never') return raw;
  return undefined;
}

async function loadVerificationConfigForAgent(
  cwd: string,
  options: ExecuteOptions,
): Promise<VerificationConfig> {
  try {
    return await loadVerificationConfig(cwd, options.fullMutation, {
      formal: options.formal,
      noFormal: options.noFormal,
      formalBackend: options.formalBackend,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('dare.config.json not found')) {
      return parseVerificationConfig({});
    }
    throw err;
  }
}

async function runAgentCandidates(args: {
  readonly cwd: string;
  readonly task: DagTask;
  readonly spec: string;
  readonly steering: ReadonlyArray<GuardedArtifact>;
  readonly driver: AgentDriver;
  readonly budget: BudgetTracker;
  readonly n: number;
}): Promise<AgentCandidate[]> {
  const controller = new AbortController();
  if (args.budget.exhausted()) controller.abort();

  const runs = Array.from({ length: args.n }, async (_unused, idx) => {
    const id = `cand-${idx + 1}`;
    const worktree = path.resolve(
      args.cwd,
      '.dare',
      'agent-worktrees',
      args.task.id,
      id,
    );
    await fs.ensureDir(worktree);

    let run: AgentRunResult;
    try {
      run = await args.driver.run({
        taskId: args.task.id,
        spec: args.spec,
        steering: args.steering,
        worktree,
        budgetRemaining: args.budget.remaining(),
        signal: controller.signal,
      });
    } catch (err) {
      run = {
        status: 'failed',
        worktree,
        summary: `driver threw: ${err instanceof Error ? err.message : String(err)}`,
        usage: ZERO_USAGE,
        failureSignature: err instanceof Error ? err.name : 'DriverError',
      };
    }

    args.budget.add(run.usage);
    if (args.budget.exhausted() && !controller.signal.aborted) {
      controller.abort();
    }

    return {
      id,
      run,
      verification: verificationFromRun(args.task.id, run),
    };
  });

  return Promise.all(runs);
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleAgent(
  dag: Dag,
  options: ExecuteOptions,
  stateFile: string,
  canvasPath: string,
  graph: KnowledgeGraph | undefined,
  cwd: string,
): Promise<void> {
  if (
    options.complete ||
    options.fail ||
    options.reset ||
    options.next ||
    options.watch ||
    options.status
  ) {
    console.error(
      chalk.red(
        'Error: --agent cannot be combined with --status/--next/--watch/--complete/--fail/--reset.',
      ),
    );
    process.exit(1);
    return;
  }

  const requireApproval = parseRequireApprovalMode(options.requireApproval);
  if (!requireApproval) {
    console.error(
      chalk.red(
        `Error: --require-approval must be 'rank' or 'none' (got '${options.requireApproval}')`,
      ),
    );
    process.exit(1);
    return;
  }

  if (requireApproval === 'rank' && !isInteractiveRuntime()) {
    console.error(
      chalk.red(
        "Error: --require-approval rank needs an interactive TTY. Use '--require-approval none' in CI/non-interactive environments.",
      ),
    );
    process.exit(1);
    return;
  }

  const onFail = parseOnFailMode(options.onFail);
  if (!onFail) {
    console.error(
      chalk.red(
        `Error: --on-fail must be 'replan', 'escalate' or 'stop' (got '${options.onFail}')`,
      ),
    );
    process.exit(1);
    return;
  }

  if (options.driver && !parseAgentProvider(options.driver)) {
    console.error(
      chalk.red(
        `Error: --driver must be 'claude', 'codex' or 'mock' (got '${options.driver}')`,
      ),
    );
    process.exit(1);
    return;
  }

  if (options.policy) {
    const policyErr = validatePolicy(options.policy);
    if (policyErr) {
      console.error(chalk.red(policyErr));
      process.exit(1);
      return;
    }
  }

  if (options.formalBackend) {
    const formalErr = validateFormalBackend(options.formalBackend);
    if (formalErr) {
      console.error(chalk.red(formalErr));
      process.exit(1);
      return;
    }
  }

  let verificationConfig = await loadVerificationConfigForAgent(cwd, options);
  if (options.policy) {
    verificationConfig = applyPolicyOverride(verificationConfig, options.policy);
  }

  const bestOfFlag = parsePositiveInt(options.bestOf);
  if (options.bestOf !== undefined && bestOfFlag === undefined) {
    console.error(
      chalk.red(`Error: --best-of must be between 1 and ${verificationConfig.bestOfN.max} (got ${options.bestOf})`),
    );
    process.exit(1);
    return;
  }
  const bestOfN = resolveBestOfCount(bestOfFlag, verificationConfig);
  const bestOfErr = validateBestOf(bestOfN, verificationConfig.bestOfN.max);
  if (bestOfErr) {
    console.error(chalk.red(bestOfErr));
    process.exit(1);
    return;
  }

  const budgetTokens = options.budgetTokens
    ? parsePositiveInt(options.budgetTokens)
    : verificationConfig.bestOfN.budgetTokens;
  if (options.budgetTokens !== undefined && budgetTokens === undefined) {
    console.error(
      chalk.red(`Error: --budget-tokens must be a positive integer (got ${options.budgetTokens})`),
    );
    process.exit(1);
    return;
  }

  const runtimeConfig = await loadAgentRuntimeConfig(cwd);
  const budget = new BudgetTracker(budgetTokens ?? null);
  while (true) {
    const newlySkipped = applyCascadingSkip(dag);
    if (newlySkipped.length > 0) {
      console.log(chalk.gray(`↷ Auto-skipped ${newlySkipped.length} blocked task(s).`));
    }

    const ready = nextExecutableTasks(dag, true);
    if (ready.length === 0) break;

    const rank = computeRanks(dag.tasks).get(ready[0].id) ?? 0;
    const rankGate = await gateRank(rank, ready, requireApproval);
    if (rankGate === 'stop') {
      console.log(
        chalk.yellow(
          `⏸ Rank ${rank} paused by approval policy. State preserved as PENDING/RUNNING.`,
        ),
      );
      await persist(dag, stateFile, canvasPath);
      return;
    }

    for (const task of ready) {
      if (budget.exhausted()) {
        console.error(chalk.red('❌ Budget exhausted before starting next task. Escalating.'));
        await persist(dag, stateFile, canvasPath);
        process.exit(1);
        return;
      }

      markRunning(dag, task.id);
      await persist(dag, stateFile, canvasPath);

      const guarded = await preflightGuardImpl(task, runtimeConfig.guard);
      if (guarded.verdict === 'FAIL') {
        markFailed(dag, task.id, {
          error: guarded.reason ?? 'guard preflight failed',
          graph,
        });
        await persist(dag, stateFile, canvasPath);
        process.exit(GUARD_FAIL_EXIT_CODE);
        return;
      }

      let driver: AgentDriver;
      try {
        driver = await resolveDriver(options, runtimeConfig);
      } catch (err) {
        if (err instanceof AgentSdkMissingError) {
          console.error(chalk.red(err.message));
          await persist(dag, stateFile, canvasPath);
          process.exit(1);
          return;
        }
        throw err;
      }

      const spec = await loadTaskSpec(cwd, task);
      const candidates = await runAgentCandidates({
        cwd,
        task,
        spec,
        steering: guarded.artifacts,
        driver,
        budget,
        n: bestOfN,
      });

      const winner = selectParetoCandidate(candidates);
      const totals = usageTotals(candidates);
      const failedAspect = winner.verification.aspects.find((a) => a.verdict === 'FAIL')
        ?.aspect as Aspect | undefined;
      const failureBody = failureReasonFromVerification(winner.verification);
      const sig = winner.verification.passed
        ? undefined
        : winner.run.failureSignature ??
          failureSignature({
            failedAspect: failedAspect ?? 'test',
            stderr: failureBody,
          });

      const current: AttemptRecord = await appendAttempt(cwd, task.id, {
        at: new Date().toISOString(),
        passed: winner.verification.passed,
        failureSignature: sig,
        failedAspect: winner.verification.passed ? undefined : failedAspect,
      });
      const history = await getAttempts(cwd, task.id);
      const verdict = decideNextAction({
        result: winner.verification,
        current,
        history,
        loop: verificationConfig.loop,
      });
      const action = resolveAgentAction(
        verdict.action as AgentExecutionAction,
        onFail,
        budget.exhausted(),
      );

      if (action === 'DONE') {
        markDone(dag, task.id, {
          output: winner.run.summary,
          tokens: totals.inputTokens + totals.outputTokens,
          durationMs: winner.verification.durationMs,
          graph,
        });
        if (graph) {
          try {
            recordCostTelemetry(graph, task.id, totals, candidates.length);
          } catch (err) {
            execLog.warn(
              { err: err instanceof Error ? err.message : String(err), taskId: task.id },
              'cost telemetry write failed (best-effort)',
            );
          }
        }
        await persist(dag, stateFile, canvasPath);
        continue;
      }

      let terminalAction = action;
      let terminalReason = verdict.reason;
      if (action === 'REPLAN') {
        try {
          const sub = await refineSplit(task, cwd);
          const spliced = spliceSubDag(
            dag,
            task.id,
            sub.subTasks,
            verificationConfig.loop.maxDepth ?? 2,
          );
          replaceDagState(dag, spliced.dag);
          const parent = dag.tasks.find((item) => item.id === task.id);
          if (parent) {
            parent.status = 'PENDING';
            parent.error = undefined;
          }
          await persist(dag, stateFile, canvasPath);
          continue;
        } catch (err) {
          if (err instanceof MaxDepthError) {
            terminalAction = 'ESCALATE';
            terminalReason = 'max nesting depth';
          } else if (err instanceof CycleError) {
            terminalAction = 'ESCALATE';
            terminalReason = 'replan would create a cycle';
          } else {
            throw err;
          }
        }
      }

      markFailed(dag, task.id, {
        error: `${terminalAction}: ${terminalReason}`,
        durationMs: winner.verification.durationMs,
        graph,
      });
      if (graph) {
        try {
          recordCostTelemetry(graph, task.id, totals, candidates.length);
        } catch (err) {
          execLog.warn(
            { err: err instanceof Error ? err.message : String(err), taskId: task.id },
            'cost telemetry write failed (best-effort)',
          );
        }
      }
      await persist(dag, stateFile, canvasPath);
      console.error(chalk.red(`❌ ${task.id} ${terminalAction} — ${terminalReason}`));
      process.exit(1);
      return;
    }
  }

  await persist(dag, stateFile, canvasPath);
  console.log(chalk.green('✅ Autonomous agent loop completed all executable tasks.'));
}

async function handleNext(
  dag: Dag,
  options: ExecuteOptions,
  stateFile: string,
  canvasPath: string,
  graph?: KnowledgeGraph,
  cwd?: string,
): Promise<void> {
  const newlySkipped = applyCascadingSkip(dag);
  if (newlySkipped.length > 0) {
    console.log(chalk.gray(`↷ Auto-skipped ${newlySkipped.length} blocked task(s).`));
  }

  const ready = nextExecutableTasks(dag, true);
  if (ready.length === 0) {
    const remaining = dag.tasks.some((t) => t.status === 'PENDING' || t.status === 'RUNNING');
    if (remaining) {
      console.log(chalk.yellow('⏸  No tasks ready right now (waiting on RUNNING tasks to complete).'));
    } else {
      console.log(chalk.green('✅ All tasks resolved. Run `dare execute --status` for the summary.'));
    }
    await persist(dag, stateFile, canvasPath);
    return;
  }

  const ranks = computeRanks(dag.tasks);
  const rank = ranks.get(ready[0].id) ?? 0;
  console.log(
    chalk.blue.bold(`\n📦 Rank ${rank} — ${ready.length} task(s) ready in parallel\n`),
  );

  for (const task of ready) {
    if (options.parallelHint) markRunning(dag, task.id);
    printTaskBriefing(dag, task, graph, cwd);
  }

  await persist(dag, stateFile, canvasPath);

  console.log(chalk.cyan('\nNext steps for the IDE agent:'));
  console.log('  1. Execute each task above (parallel or sequential — your choice).');
  console.log('  2. After each task: `dare execute --complete <id> --output "<summary>"`');
  console.log('  3. On failure: `dare execute --fail <id> --reason "<message>"`');
  console.log('  4. When this rank finishes, run `dare execute --next` again.\n');
}

async function handleComplete(
  dag: Dag,
  options: ExecuteOptions,
  stateFile: string,
  canvasPath: string,
  graph?: KnowledgeGraph,
): Promise<void> {
  const taskId = options.complete!;
  const tokens = options.tokens ? parseInt(options.tokens, 10) : undefined;
  const reportedDuration = options.duration
    ? parseInt(options.duration, 10)
    : undefined;

  // Locate the task before running gates so we fail fast if the id is wrong.
  const target = dag.tasks.find((t) => t.id === taskId);
  if (!target) {
    console.error(chalk.red(`❌ Task "${taskId}" not found in DAG.`));
    process.exit(1);
  }

  // Resolve stack and run Ralph Loop. There is no opt-out: a task only
  // becomes DONE after build → test → lint pass for the project's stack.
  const cwd = process.cwd();
  let stack: string;
  try {
    stack = await resolveStackFromConfig(cwd);
  } catch (err) {
    console.error(chalk.red(`❌ ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  console.log(chalk.cyan(`🔧 Ralph Loop (${stack}) — build → test → lint`));
  const ralphStart = Date.now();
  const result = await runRalphLoop({
    stack,
    cwd,
    onProgress: ({ gate, phase }) => {
      const icon = phase === 'start' ? '▸' : phase === 'pass' ? '✓' : '✗';
      const color = phase === 'fail' ? chalk.red : phase === 'pass' ? chalk.green : chalk.gray;
      console.log(color(`  ${icon} ${gate}`));
    },
  });
  const ralphMs = Date.now() - ralphStart;

  if (!result.passed) {
    const errorBody = [
      `Ralph Loop failed at gate: ${result.failedAt}`,
      `Command: ${result.failedCommand ?? '(unknown)'}`,
      `--- stderr ---`,
      (result.stderr ?? '').trim(),
    ].join('\n');

    try {
      const config = await loadVerificationConfig(cwd, options.fullMutation);
      if (
        shouldRunVerification({
          verify: options.verify,
          noVerify: options.noVerify,
          configEnabled: config.enabled,
        })
      ) {
        await recordFailureAndVerdict({
          cwd,
          taskId,
          stack,
          passed: false,
          failedAspect: gateToAspect(result.failedAt),
          stderr: result.stderr ?? errorBody,
          loop: config.loop,
          verdictJson: options.verdictJson,
        });
      }
    } catch {
      // decay is best-effort when config is invalid — Ralph failure still blocks DONE
    }

    markFailed(dag, taskId, {
      error: errorBody,
      durationMs: reportedDuration ?? ralphMs,
      graph,
    });

    console.log(chalk.red.bold(`\n❌ ${taskId} FAILED — Ralph Loop blocked DONE.`));
    console.log(chalk.gray(`   gate: ${result.failedAt}`));
    console.log(chalk.gray(`   cmd : ${result.failedCommand}`));
    if (result.stderr) {
      console.log(chalk.gray(`   --- stderr (truncated) ---`));
      console.log(chalk.gray(result.stderr.trim().split('\n').slice(0, 30).join('\n')));
    }
    console.log(chalk.yellow(`\nFix the failure, then either re-run completion or use \`dare execute --reset ${taskId}\` first.\n`));

    await persist(dag, stateFile, canvasPath);
    process.exit(1);
  }

  // Gates passed — but optionally run `dare review` before marking DONE.
  // Opt-in via `dare.config.json#review.onComplete: true`. The review
  // catches mocks/stubs/TODOs that Ralph's build/test/lint don't see.
  const reviewBlocked = await maybeRunReviewGate(cwd, taskId);
  if (reviewBlocked) {
    markFailed(dag, taskId, {
      error: reviewBlocked,
      durationMs: reportedDuration ?? ralphMs,
      graph,
    });
    console.log(
      chalk.red.bold(`\n❌ ${taskId} FAILED — \`dare review\` blocked DONE.`),
    );
    console.log(chalk.gray(reviewBlocked.split('\n').slice(0, 20).join('\n')));
    console.log(
      chalk.yellow(
        `\nResolva os achados do review e rode \`dare execute --reset ${taskId}\` antes de tentar novamente.\n`,
      ),
    );
    await persist(dag, stateFile, canvasPath);
    process.exit(1);
  }

  let verificationConfig = await loadVerificationConfig(cwd, options.fullMutation, {
    formal: options.formal,
    noFormal: options.noFormal,
    formalBackend: options.formalBackend,
  });
  if (options.policy) {
    const policyErr = validatePolicy(options.policy);
    if (policyErr) {
      console.error(chalk.red(policyErr));
      process.exit(1);
    }
    verificationConfig = applyPolicyOverride(verificationConfig, options.policy);
  }

  const bestOfN = options.bestOf
    ? parseInt(options.bestOf, 10)
    : resolveBestOfCount(undefined, verificationConfig);
  const bestOfErr = validateBestOf(bestOfN, verificationConfig.bestOfN.max);
  if (bestOfErr) {
    console.error(chalk.red(bestOfErr));
    process.exit(1);
  }

  if (options.formalBackend) {
    const formalErr = validateFormalBackend(options.formalBackend);
    if (formalErr) {
      console.error(chalk.red(formalErr));
      process.exit(1);
    }
  }

  if (options.prerank) {
    verificationConfig = {
      ...verificationConfig,
      prerank: { enabled: true },
    };
  }

  let verification: Awaited<ReturnType<typeof runPostRalphVerification>>;

  if (
    bestOfN > 1 &&
    shouldRunVerification({
      verify: options.verify,
      noVerify: options.noVerify,
      configEnabled: verificationConfig.enabled,
    })
  ) {
    try {
      const { winner } = await runBestOfN({
        taskId,
        repoRoot: cwd,
        n: bestOfN,
        stack,
        config: verificationConfig,
        fillCandidate: async () => {
          /* Skill/agent fills worktrees; CLI only orchestrates verification. */
        },
      });
      verification = {
        ran: true,
        passed: winner.verification.passed,
        exitCode: winner.verification.passed ? 0 : 1,
        verificationResult: winner.verification,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Error: best-of-N failed: ${msg}`));
      markFailed(dag, taskId, { error: msg, durationMs: reportedDuration ?? ralphMs, graph });
      await persist(dag, stateFile, canvasPath);
      process.exit(1);
    }
  } else {
    verification = await runPostRalphVerification({
      taskId,
      cwd,
      stack,
      verify: options.verify,
      noVerify: options.noVerify,
      fullMutation: options.fullMutation,
      verdictJson: options.verdictJson,
      formal: options.formal,
      noFormal: options.noFormal,
      formalBackend: options.formalBackend,
    });
  }

  if (verification.errorMessage) {
    console.error(chalk.red(verification.errorMessage));
    markFailed(dag, taskId, {
      error: verification.errorMessage,
      durationMs: reportedDuration ?? ralphMs,
      graph,
    });
    await persist(dag, stateFile, canvasPath);
    process.exit(verification.exitCode);
  }

  if (verification.ran && !verification.passed) {
    const failReason =
      verification.verificationResult?.aspects
        .filter((a) => a.verdict === 'FAIL')
        .map((a) => `${a.aspect}: ${a.reason}`)
        .join('; ') ?? 'verification failed';

    markFailed(dag, taskId, {
      error: failReason,
      durationMs: reportedDuration ?? ralphMs,
      graph,
    });
    console.log(chalk.red.bold(`\n❌ ${taskId} FAILED — verification blocked DONE.`));
    console.log(chalk.gray(`   ${failReason}`));
    await persist(dag, stateFile, canvasPath);
    process.exit(1);
  }

  if (
    verification.ran &&
    verification.verificationResult &&
    graph &&
    !options.noGraph
  ) {
    try {
      recordVerification(graph, verification.verificationResult);
      const artifactFile = path.join(cwd, '.dare/verification', `${taskId}.json`);
      if (await fs.pathExists(artifactFile)) {
        const artifact = (await fs.readJson(artifactFile)) as {
          formalProof?: FormalVerdict;
        };
        if (artifact.formalProof) {
          recordFormalProof(graph, taskId, artifact.formalProof);
        }
      }
    } catch (err) {
      execLog.warn(
        { err: err instanceof Error ? err.message : String(err), taskId },
        'telemetry write failed (best-effort)',
      );
    }
  }

  const task = markDone(dag, taskId, {
    output: options.output,
    tokens,
    durationMs: reportedDuration ?? ralphMs,
    graph,
  });

  if (graph && !options.noGraph) {
    try {
      await runIncrementalSemanticIndex(graph, cwd);
    } catch (err) {
      execLog.warn(
        { err: err instanceof Error ? err.message : String(err), taskId },
        'incremental semantic index failed (best-effort)',
      );
    }
  }

  const verifyNote = verification.ran ? ' + verification PASS' : '';
  console.log(
    chalk.green.bold(`\n✅ ${task.id} DONE — Ralph Loop passed in ${ralphMs}ms${verifyNote}.`),
  );
  if (task.tokens) console.log(chalk.gray(`   tokens: ${task.tokens}`));

  await persist(dag, stateFile, canvasPath);
}

async function handleFail(
  dag: Dag,
  options: ExecuteOptions,
  stateFile: string,
  canvasPath: string,
  graph?: KnowledgeGraph,
): Promise<void> {
  const taskId = options.fail!;
  const duration = options.duration ? parseInt(options.duration, 10) : undefined;

  const task = markFailed(dag, taskId, {
    error: options.reason ?? 'unspecified',
    durationMs: duration,
    graph,
  });

  console.log(chalk.red(`❌ ${task.id} marked as FAILED: ${task.error}`));
  const skipped = dag.tasks.filter((t) => t.status === 'SKIPPED');
  if (skipped.length > 0) {
    console.log(chalk.gray(`   Cascading-skipped: ${skipped.map((t) => t.id).join(', ')}`));
  }

  await persist(dag, stateFile, canvasPath);
}

async function handleReset(
  dag: Dag,
  taskId: string,
  stateFile: string,
  canvasPath: string,
  graph?: KnowledgeGraph,
): Promise<void> {
  const task = dag.tasks.find((t) => t.id === taskId);
  if (!task) {
    console.error(chalk.red(`❌ Task "${taskId}" not found.`));
    process.exit(1);
  }
  task.status = 'PENDING';
  task.error = undefined;
  task.output = undefined;
  task.duration = undefined;
  task.tokens = undefined;

  // Drop the stale graph node (and its outgoing edges) so the next DONE/FAILED
  // recreates it with fresh metadata. Best-effort.
  if (graph) {
    try {
      graph.deleteNode(`task:${taskId}`);
    } catch {
      // ignore — graph cleanup is non-critical
    }
  }

  console.log(chalk.cyan(`↺ ${task.id} reset to PENDING.`));
  await persist(dag, stateFile, canvasPath);
}

async function handleStatus(dag: Dag, canvasPath: string): Promise<void> {
  await renderCanvas(dag, canvasPath);

  const counts: Record<TaskStatus, number> = {
    PENDING: 0,
    RUNNING: 0,
    DONE: 0,
    FAILED: 0,
    SKIPPED: 0,
  };
  for (const t of dag.tasks) counts[t.status ?? 'PENDING']++;

  console.log(chalk.blue.bold(`\n📊 ${dag.title}\n`));
  console.log(`  ✅ DONE     : ${counts.DONE}`);
  console.log(`  🔄 RUNNING  : ${counts.RUNNING}`);
  console.log(`  ⏳ PENDING  : ${counts.PENDING}`);
  console.log(`  ❌ FAILED   : ${counts.FAILED}`);
  console.log(`  ⏭️  SKIPPED  : ${counts.SKIPPED}`);
  const nestingLines = renderNestingSummary(dag);
  if (nestingLines.length > 0) {
    console.log(chalk.cyan('\n  🪜 Sub-DAG nesting:'));
    for (const line of nestingLines) console.log(`  ${line}`);
  }
  console.log(chalk.cyan(`\n  📄 Canvas: ${canvasPath}\n`));
}

async function handleWatch(
  dagPath: string,
  stateFile: string,
  canvasPath: string,
  options: ExecuteOptions,
): Promise<void> {
  const cwd = process.cwd();
  await fs.ensureDir(path.dirname(stateFile));
  console.log(
    chalk.blue.bold(`\n👀 Watching ${path.relative(cwd, stateFile)} — Ctrl+C to exit\n`),
  );

  const renderOnce = async (): Promise<void> => {
    const fresh = await loadDag(dagPath);
    await loadAndApplyState(fresh, stateFile);
    process.stdout.write(`\n${chalk.gray('━'.repeat(60))}\n`);
    process.stdout.write(`${chalk.gray(new Date().toISOString())}\n`);
    await handleNext(fresh, options, stateFile, canvasPath);
  };

  await renderOnce();

  // Coalesce bursts of fs events.
  let pending: NodeJS.Timeout | null = null;
  const schedule = (): void => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      void renderOnce().catch((err) => {
        console.error(chalk.red(`watch error: ${err instanceof Error ? err.message : String(err)}`));
      });
    }, 150);
  };

  // Watch the directory containing state.json — fs.watch on a non-existent
  // file would throw on some platforms, so we watch its parent.
  const watcher = fs.watch(path.dirname(stateFile), { persistent: true }, (_event, filename) => {
    if (filename && filename.toString().endsWith('state.json')) schedule();
  });

  await new Promise<void>((resolve) => {
    const stop = (): void => {
      watcher.close();
      console.log(chalk.gray('\n  Watcher stopped.\n'));
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadDag(dagPath: string): Promise<Dag> {
  const yaml = await fs.readFile(dagPath, 'utf-8');
  return convertYamlToDag(yaml);
}

async function persist(dag: Dag, stateFile: string, canvasPath: string): Promise<void> {
  await saveState(dag, stateFile);
  await renderCanvas(dag, canvasPath);
}

async function tryOpenGraph(cwd: string): Promise<KnowledgeGraph | undefined> {
  try {
    const config = await loadGraphConfig({ cwd });
    return await createGraph(config, { cwd });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.gray(`(graph disabled: ${msg})`));
    return undefined;
  }
}

function printTaskBriefing(
  dag: Dag,
  task: DagTask,
  graph?: KnowledgeGraph,
  cwd?: string,
): void {
  console.log(chalk.bold(`▸ ${task.id} — ${task.title}`));
  console.log(chalk.gray(`  complexity: ${task.complexity}`));
  if (task.spec_file) console.log(chalk.gray(`  spec_file:  ${task.spec_file}`));
  console.log(chalk.gray('  prompt:'));
  let graphLocate: string | undefined;
  if (graph && cwd) {
    graphLocate = buildLocateContext(graph, task, loadGraphLocateConfig(cwd));
  }
  const prompt = buildTaskPrompt(dag, task, { graphLocate });
  for (const line of prompt.split('\n')) console.log(`    ${line}`);
  console.log();
}

function renderNestingSummary(dag: Dag): string[] {
  const byId = new Map(dag.tasks.map((task) => [task.id, task]));
  const childrenByParent = new Map<string, DagTask[]>();

  for (const task of dag.tasks) {
    if (!task.__parentId) continue;
    if (!childrenByParent.has(task.__parentId)) childrenByParent.set(task.__parentId, []);
    childrenByParent.get(task.__parentId)!.push(task);
  }
  if (childrenByParent.size === 0) return [];

  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.id.localeCompare(b.id));
  }

  const parentIds = [...childrenByParent.keys()].sort((a, b) => a.localeCompare(b));
  const rootParents = parentIds.filter((parentId) => {
    const parent = byId.get(parentId);
    return !parent?.__parentId;
  });
  const visitedParents = new Set<string>();
  const lines: string[] = [];

  const walk = (parentId: string, depth: number, ancestry: Set<string>): void => {
    const children = childrenByParent.get(parentId) ?? [];
    if (children.length === 0 || ancestry.has(parentId)) return;

    visitedParents.add(parentId);
    const pad = '  '.repeat(depth);
    for (const child of children) {
      const status = child.status ?? 'PENDING';
      lines.push(`${pad}- ${child.id} (${status})`);
      const nextAncestry = new Set(ancestry);
      nextAncestry.add(parentId);
      walk(child.id, depth + 1, nextAncestry);
    }
  };

  for (const parentId of rootParents) {
    lines.push(`• ${parentId}`);
    walk(parentId, 1, new Set());
  }
  for (const parentId of parentIds) {
    if (visitedParents.has(parentId)) continue;
    lines.push(`• ${parentId}`);
    walk(parentId, 1, new Set());
  }

  return lines;
}

/**
 * If `dare.config.json#review.onComplete` is `true`, run `dare review` over
 * the just-finished task and return a non-null error string when the review
 * fails. Returning `null` means either the gate is disabled or the review
 * passed — caller can proceed to mark DONE.
 *
 * Reads optional knobs:
 *   review.onComplete  : boolean   — enable the gate (default: false)
 *   review.strict      : boolean   — treat warnings as errors (default: false)
 *   review.fromAgent   : string    — path to JSON verdict produced by IDE skill
 */
async function maybeRunReviewGate(
  cwd: string,
  taskId: string,
): Promise<string | null> {
  let cfg: Record<string, unknown>;
  try {
    cfg = (await readProjectConfig(cwd)) as Record<string, unknown>;
  } catch {
    return null; // no config → no opt-in
  }
  const review = cfg.review as
    | { onComplete?: boolean; strict?: boolean; fromAgent?: string }
    | undefined;
  if (!review?.onComplete) return null;

  console.log(chalk.cyan(`\n🔎 dare review (gate opt-in) — ${taskId}`));

  let report;
  try {
    report = await runReview(taskId, {
      projectRoot: cwd,
      strict: Boolean(review.strict),
      fromAgent: review.fromAgent,
    });
  } catch (err) {
    return `Review gate threw: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (!report.failed) {
    console.log(
      chalk.green(
        `  ✓ review limpa (${report.filesScanned.length} arquivo(s), ${report.totals.errors} erro(s))`,
      ),
    );
    return null;
  }

  const lines: string[] = [`Review gate falhou para ${taskId}:`];
  lines.push(
    `  totals: ${report.totals.errors} erro(s), ${report.totals.warnings} aviso(s) em ${report.totals.filesWithFindings} arquivo(s)`,
  );
  for (const r of report.reports) {
    if (r.violations.length === 0) continue;
    lines.push(`  ${r.file}:`);
    for (const v of r.violations.slice(0, 10)) {
      lines.push(`    L${v.line} [${v.kind}] ${v.message}`);
    }
    if (r.violations.length > 10) {
      lines.push(`    … +${r.violations.length - 10} mais`);
    }
  }
  if (report.semantic && !report.semantic.passed) {
    lines.push(`  verdito semântico: FAIL`);
    for (const c of report.semantic.unmetCriteria) lines.push(`    · ${c}`);
  }
  return lines.join('\n');
}
