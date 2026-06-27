import { Command } from 'commander';
import chalk from 'chalk';
import type { RefineRunFacts } from '../core/commands/refine.js';
import { runRefine as runRefineCore } from '../core/commands/refine.js';
import type {
  ComplexityReport,
  RefineVerdict,
  SplitProposal,
} from '../types/Refine.types.js';
import { addAiOptions } from '../ai/command-options.js';
import type { AiCommandOptions } from '../ai/types.js';

export { buildSplitProposal } from '../core/commands/refine.js';

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
  .option('--apply', 'Aplica o split no DAG ativo (requer --split)', false)
  .option(
    '--strict',
    'Exit code 2 quando complexidade for HIGH/CRITICAL (CI-friendly)',
    false,
  )
  .option('--format <fmt>', 'Saída: human | json', 'human')
  .option('--from-agent <path>', 'JSON com RefineVerdict produzido pelo agente IDE');

addAiOptions(refineCommand);

refineCommand.action(
  async (
    taskId: string,
    options: {
      split: boolean;
      apply: boolean;
      strict: boolean;
      format: 'human' | 'json';
      fromAgent?: string;
    } & AiCommandOptions,
  ) => {
      const projectRoot = process.cwd();
      const result = await runRefineCore({
        cwd: projectRoot,
        ai: options.ai,
        provider: options.provider,
        input: {
          taskId,
          split: options.split,
          apply: options.apply,
          strict: options.strict,
          format: options.format,
          fromAgent: options.fromAgent,
        },
      });

      const facts = asRefineRunFacts(result.facts);
      if (facts) {
        if (options.format === 'json') {
          process.stdout.write(
            JSON.stringify(
              {
                report: facts.report,
                proposal: facts.proposal,
                agentVerdict: facts.agentVerdict,
              },
              null,
              2,
            ) + '\n',
          );
        } else {
          printHuman(facts.report, facts.proposal, facts.agentVerdict);
        }
      }

      if (result.error) {
        console.error(chalk.red(`❌ ${result.error}`));
        process.exit(1);
      }

      if (!facts) {
        console.error(chalk.red('❌ Refine core returned invalid facts.'));
        process.exit(1);
      }

      if (facts.strictFailure) process.exit(2);
      process.exit(0);
    },
  );

function asRefineRunFacts(value: unknown): RefineRunFacts | null {
  if (!value || typeof value !== 'object') return null;
  const report = (value as { report?: unknown }).report;
  if (!report || typeof report !== 'object') return null;
  return value as RefineRunFacts;
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
