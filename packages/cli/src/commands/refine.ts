import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import {
  analyzeTaskComplexity,
  proposeSplit,
  DEFAULT_THRESHOLDS,
  type ComplexityThresholds,
} from '../utils/complexity-analyzer.js';
import { parseFilesFromSpec, findSpecFile } from '../utils/ReviewRunner.js';
import { readProjectConfig } from '../utils/UpdateDetector.js';
import type {
  ComplexityReport,
  RefineVerdict,
  SplitProposal,
} from '../types/Refine.types.js';

/**
 * `dare refine <task-id>` — measures complexity of a task and (optionally)
 * proposes how to break it down. Exit codes:
 *
 *   0 → task is manageable (LOW/MED) OR split applied successfully
 *   1 → I/O error
 *   2 → task is HIGH/CRITICAL and the dev asked for `--strict`
 *
 * Use `--split` to also emit a coarse split proposal. The CLI only proposes
 * — it never rewrites `dare-dag.yaml` directly unless `--apply` is set
 * (intentionally manual: the IDE agent should usually re-generate spec
 * files for each subtask).
 */
export const refineCommand = new Command('refine')
  .description("Mede complexidade de uma task e (opcional) propõe quebra em sub-tasks")
  .argument('<task-id>', 'ID da task (ex: task-001)')
  .option('--split', 'Emite uma proposta de quebra em sub-tasks', false)
  .option('--apply', 'Aplica o split: marca task original como SPLIT em DARE/TASKS.md', false)
  .option(
    '--strict',
    'Exit code 2 quando complexidade for HIGH/CRITICAL (CI-friendly)',
    false,
  )
  .option('--format <fmt>', 'Saída: human | json', 'human')
  .option('--from-agent <path>', 'JSON com RefineVerdict produzido pelo agente IDE')
  .action(
    async (
      taskId: string,
      options: {
        split: boolean;
        apply: boolean;
        strict: boolean;
        format: 'human' | 'json';
        fromAgent?: string;
      },
    ) => {
      const projectRoot = process.cwd();

      // Read optional thresholds from dare.config.json (#refine.thresholds).
      const thresholds = await readThresholds(projectRoot);

      let report: ComplexityReport | null = null;
      try {
        report = await analyzeTaskComplexity(taskId, projectRoot, { thresholds });
      } catch (err) {
        console.error(
          chalk.red(`❌ ${err instanceof Error ? err.message : String(err)}`),
        );
        process.exit(1);
      }
      if (!report) {
        console.error(chalk.red(`❌ Não foi possível analisar a task ${taskId}.`));
        process.exit(1);
      }

      let proposal: SplitProposal | undefined;
      if (options.split) {
        proposal = await buildSplitProposal(taskId, projectRoot);
      }

      let agentVerdict: RefineVerdict | undefined;
      if (options.fromAgent) {
        agentVerdict = await loadAgentVerdict(options.fromAgent);
      }

      if (options.format === 'json') {
        process.stdout.write(
          JSON.stringify({ report, proposal, agentVerdict }, null, 2) + '\n',
        );
      } else {
        printHuman(report, proposal, agentVerdict);
      }

      if (options.apply && proposal) {
        await applySplitMarker(projectRoot, taskId, proposal);
      }

      const isHigh = report.level === 'HIGH' || report.level === 'CRITICAL';
      if (options.strict && isHigh) process.exit(2);
      process.exit(0);
    },
  );

async function readThresholds(
  projectRoot: string,
): Promise<ComplexityThresholds | undefined> {
  try {
    const cfg = (await readProjectConfig(projectRoot)) as Record<string, unknown>;
    const refine = cfg.refine as { thresholds?: ComplexityThresholds } | undefined;
    return refine?.thresholds;
  } catch {
    return undefined;
  }
}

async function buildSplitProposal(
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

/**
 * Light-touch "apply": annotate `DARE/TASKS.md` with a marker so the dev /
 * agent can see this task was identified for split. Doesn't rewrite the
 * DAG — that's intentionally left to the `dare-refine` IDE skill, which
 * has the context to write coherent sub-task specs.
 */
async function applySplitMarker(
  projectRoot: string,
  taskId: string,
  proposal: SplitProposal,
): Promise<void> {
  const tasksPath = path.join(projectRoot, 'DARE', 'TASKS.md');
  if (!(await fs.pathExists(tasksPath))) {
    console.log(chalk.yellow(`  ⚠  ${tasksPath} não existe — pulando apply.`));
    return;
  }
  const md = await fs.readFile(tasksPath, 'utf-8');
  const stamp =
    `\n\n<!-- dare-refine: ${taskId} marcada para split em ${proposal.subtasks.length} sub-task(s) — ` +
    `regenere com /dare-refine ${taskId} no IDE -->\n`;
  if (md.includes(`dare-refine: ${taskId}`)) return; // idempotent
  await fs.writeFile(tasksPath, md + stamp);
  console.log(
    chalk.green(`  ✅ TASKS.md anotado com marker de split para ${taskId}.`),
  );
}

function printHuman(
  report: ComplexityReport,
  proposal: SplitProposal | undefined,
  verdict: RefineVerdict | undefined,
): void {
  console.log(chalk.blue.bold(`\n🪓 DARE Refine — ${report.taskId}\n`));
  console.log(`  Spec      : ${chalk.cyan(report.specPath ?? '(não encontrada)')}`);
  console.log(
    `  Score     : ${chalk.cyan(report.score.toFixed(1))}  Level: ${formatLevel(report.level)}`,
  );

  if (report.signals.length > 0) {
    console.log(chalk.bold('\n  Sinais:'));
    for (const s of report.signals) {
      console.log(
        `    · ${chalk.magenta(s.kind.padEnd(14))} ${chalk.gray('+' + s.weight.toFixed(1))}  ${s.detail}`,
      );
    }
  }

  if (report.recommendsSplit) {
    console.log(
      chalk.yellow.bold(
        `\n  ⚠ Recomenda quebra — task é ${report.level}. Considere /dare-refine no IDE ou \`--split\`.`,
      ),
    );
  } else {
    console.log(chalk.green(`\n  ✅ Task manuseável (${report.level}).`));
  }

  if (verdict) {
    console.log(chalk.bold('\n  Verdito do agente:'));
    console.log(
      `    ${verdict.manageable ? chalk.green('✅ manageable') : chalk.red('❌ não-manageable')}`,
    );
    for (const r of verdict.reasons) console.log(`      · ${r}`);
  }

  if (proposal && proposal.subtasks.length > 0) {
    console.log(chalk.bold(`\n  Proposta de split (${proposal.subtasks.length} sub-task(s)):`));
    for (const st of proposal.subtasks) {
      console.log(
        `    ${chalk.cyan(st.id)} — ${st.title}  ${chalk.gray(`[${st.estimatedLevel}]`)}`,
      );
      for (const f of st.files) console.log(chalk.gray(`        · ${f}`));
      console.log(chalk.gray(`        ${st.rationale}`));
    }
    console.log(chalk.gray(`\n  ${proposal.notes}`));
  } else if (proposal) {
    console.log(chalk.gray(`\n  ${proposal.notes}`));
  }
  console.log();
}

function formatLevel(level: string): string {
  switch (level) {
    case 'LOW':
      return chalk.green(level);
    case 'MED':
      return chalk.cyan(level);
    case 'HIGH':
      return chalk.yellow(level);
    case 'CRITICAL':
      return chalk.red(level);
    default:
      return level;
  }
}
