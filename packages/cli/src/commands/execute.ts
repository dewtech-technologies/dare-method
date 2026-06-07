import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
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
  loadAndApplyState,
  saveState,
} from '../dag-runner/state-store.js';
import {
  resolveStackFromConfig,
  runRalphLoop,
  type GateName,
} from '../dag-runner/ralph-loop.js';
import { runReview } from '../utils/ReviewRunner.js';
import { readProjectConfig } from '../utils/UpdateDetector.js';
import {
  gateToAspect,
  loadVerificationConfig,
  recordFailureAndVerdict,
  runPostRalphVerification,
  shouldRunVerification,
  validateBestOf,
  validatePolicy,
  applyPolicyOverride,
  resolveBestOfCount,
} from './execute-verification.js';
import { recordVerification } from '../verification/telemetry.js';
import { runBestOfN } from '../verification/best-of-n/runner.js';
import { createLogger } from '../utils/logger.js';

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
}

export const executeCommand = new Command('execute')
  .description('Orchestrate DAG execution (the IDE agent runs each task)')
  .option('--dag <file>', 'Path to dare-dag.yaml', 'DARE/dare-dag.yaml')
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
      if (options.complete) {
        await handleComplete(dag, options, stateFile, canvasPath, graph);
      } else if (options.fail) {
        await handleFail(dag, options, stateFile, canvasPath, graph);
      } else if (options.reset) {
        await handleReset(dag, options.reset, stateFile, canvasPath, graph);
      } else if (options.watch) {
        await handleWatch(dagPath, stateFile, canvasPath, options);
      } else if (options.next) {
        await handleNext(dag, options, stateFile, canvasPath);
      } else {
        // Default: --status
        await handleStatus(dag, canvasPath);
      }
    } finally {
      graph?.close();
    }
  });

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleNext(
  dag: Dag,
  options: ExecuteOptions,
  stateFile: string,
  canvasPath: string,
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
    printTaskBriefing(dag, task);
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

  let verificationConfig = await loadVerificationConfig(cwd, options.fullMutation);
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

function printTaskBriefing(dag: Dag, task: DagTask): void {
  console.log(chalk.bold(`▸ ${task.id} — ${task.title}`));
  console.log(chalk.gray(`  complexity: ${task.complexity}`));
  if (task.spec_file) console.log(chalk.gray(`  spec_file:  ${task.spec_file}`));
  console.log(chalk.gray('  prompt:'));
  const prompt = buildTaskPrompt(dag, task);
  for (const line of prompt.split('\n')) console.log(`    ${line}`);
  console.log();
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
