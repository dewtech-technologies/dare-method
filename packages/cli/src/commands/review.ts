import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { runReview } from '../utils/ReviewRunner.js';
import type { ReviewReport, Violation } from '../types/Review.types.js';
import {
  applyCiGateOutput,
  parseCiFormat,
  parseFailOn,
  resolveVerdictFromCounts,
  violationsToFindings,
} from '../reporters/ci-gate.js';
import { addAiOptions, aiOptionsFromFlags } from '../ai/command-options.js';
import type { AiCommandOptions } from '../ai/types.js';
import { maybeRunAiEnrichment } from '../ai/pipeline.js';
import fs from 'fs-extra';

/**
 * `dare review <task-id>` — runs the static analyzer (and optionally a
 * semantic verdict from the IDE agent) against the files a task touched.
 *
 * Exit codes:
 *   0 → no errors (warnings are tolerated unless `--strict`)
 *   1 → at least one error / semantic verdict failed
 *
 * Designed to be wired into:
 *   - The agent's pre-DONE check (`/dare-execute` skill)
 *   - The Ralph Loop (when `reviewOnComplete: true` in dare.config.json)
 *   - Pre-commit hooks (`dare review <id> --strict --format json`)
 */
export const reviewCommand = new Command('review')
  .description("Audita uma task em busca de stubs, mocks, TODOs e funções vazias")
  .argument('<task-id>', 'ID da task (ex: task-001) — busca DARE/EXECUTION/<id>.md')
  .option('--strict', 'Trata warnings como errors (CI-friendly)', false)
  .option('--errors-only', 'Suprime warnings na saída humana', false)
  .option(
    '--files <files...>',
    'Lista explícita de arquivos a analisar (ignora spec/git)',
  )
  .option(
    '--from-agent <path>',
    'Caminho para JSON com SemanticVerdict produzido pelo agente IDE',
  )
  .option('--format <fmt>', 'Saída: human | json | github', 'human')
  .option('--comment', 'Post idempotent PR comment (requires GITHUB_TOKEN + PR context)', false)
  .option('--fail-on <mode>', 'Exit policy: none | warn | error', 'none');

addAiOptions(reviewCommand);

reviewCommand.action(
  async (
    taskId: string,
    options: {
      strict: boolean;
      errorsOnly: boolean;
      files?: string[];
      fromAgent?: string;
      format: string;
      comment: boolean;
      failOn: string;
    } & AiCommandOptions,
  ) => {
      const projectRoot = process.cwd();
      const format = parseCiFormat(options.format);
      if (!format) {
        console.error(chalk.red(`❌ --format must be human, json, or github (got "${options.format}")`));
        process.exit(1);
      }
      const failOn = parseFailOn(options.failOn);
      if (!failOn) {
        console.error(chalk.red(`❌ --fail-on must be none, warn, or error (got "${options.failOn}")`));
        process.exit(1);
      }

      let fromAgent = options.fromAgent;
      const aiOpts = aiOptionsFromFlags(options);
      if (aiOpts.enabled && !fromAgent) {
        const specPath = path.join(projectRoot, 'DARE', 'EXECUTION', `${taskId}.md`);
        const spec = (await fs.pathExists(specPath))
          ? await fs.readFile(specPath, 'utf-8')
          : '';
        const enrichment = await maybeRunAiEnrichment({
          enabled: true,
          provider: aiOpts.provider,
          command: 'review',
          cwd: projectRoot,
          facts: { taskId, spec },
        });
        if (enrichment?.artifactPath) fromAgent = enrichment.artifactPath;
      }

      let report: ReviewReport;
      try {
        report = await runReview(taskId, {
          projectRoot,
          files: options.files,
          fromAgent,
          strict: options.strict,
          errorsOnly: options.errorsOnly,
          format: format === 'github' ? 'human' : format,
        });
      } catch (err) {
        console.error(
          chalk.red(`❌ ${err instanceof Error ? err.message : String(err)}`),
        );
        process.exit(1);
      }

      const allViolations = report.reports.flatMap((r) => r.violations);
      const findings = violationsToFindings(allViolations, projectRoot);
      const verdict = resolveVerdictFromCounts(report.totals.errors, report.totals.warnings);

      if (format === 'json') {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      } else {
        printHumanReport(report, options.errorsOnly);
      }

      const ciMode = format === 'github' || options.comment || failOn !== 'none';

      if (ciMode) {
        const exitCode = await applyCiGateOutput({
          gate: 'review',
          format,
          comment: options.comment,
          failOn,
          findings,
          verdict,
          cwd: projectRoot,
        });
        process.exit(exitCode);
        return;
      }

      process.exit(report.failed ? 1 : 0);
    },
  );

function printHumanReport(report: ReviewReport, errorsOnly: boolean): void {
  console.log(chalk.blue.bold(`\n🔎 DARE Review — ${report.taskId}\n`));

  if (report.filesScanned.length === 0) {
    console.log(
      chalk.yellow(
        '⚠  Nenhum arquivo encontrado para revisar.\n' +
          '   Dica: liste arquivos no campo "ARQUIVOS A CRIAR / MODIFICAR" do spec,\n' +
          '   ou use --files <files...> explicitamente.',
      ),
    );
    return;
  }

  console.log(`  Arquivos analisados: ${chalk.cyan(report.filesScanned.length)}`);
  for (const f of report.filesScanned) {
    console.log(`    · ${path.normalize(f)}`);
  }
  console.log();

  for (const fileReport of report.reports) {
    if (fileReport.violations.length === 0) continue;

    console.log(
      chalk.bold(
        `  ${path.normalize(fileReport.file)}` +
          (fileReport.isTestFile ? chalk.gray(' [test]') : ''),
      ),
    );
    for (const v of fileReport.violations) {
      if (errorsOnly && v.severity === 'warning') continue;
      printViolation(v);
    }
    console.log();
  }

  if (report.semantic) {
    console.log(chalk.bold('  Verdito semântico (agente IDE):'));
    console.log(
      `    ${report.semantic.passed ? chalk.green('✅ passou') : chalk.red('❌ falhou')}`,
    );
    if (report.semantic.unmetCriteria.length > 0) {
      console.log(chalk.yellow('    Critérios não atendidos:'));
      for (const c of report.semantic.unmetCriteria) {
        console.log(`      · ${c}`);
      }
    }
    if (report.semantic.notes) {
      console.log(chalk.gray(`    Notas: ${report.semantic.notes}`));
    }
    console.log();
  }

  const { errors, warnings, filesWithFindings } = report.totals;
  if (report.failed) {
    console.log(
      chalk.red.bold(
        `❌ FAIL — ${errors} erro(s), ${warnings} aviso(s) em ${filesWithFindings} arquivo(s).`,
      ),
    );
    console.log(
      chalk.gray(
        '   Corrija os achados acima antes de marcar a task como DONE.\n',
      ),
    );
  } else if (errors === 0 && warnings === 0) {
    console.log(
      chalk.green.bold(
        `✅ PASS — nenhum padrão proibido detectado em ${report.filesScanned.length} arquivo(s).\n`,
      ),
    );
  } else {
    console.log(
      chalk.yellow(
        `⚠  PASS com ${warnings} aviso(s). Use --strict para falhar em warnings.\n`,
      ),
    );
  }
}

function printViolation(v: Violation): void {
  const icon = v.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
  console.log(
    `    ${icon} ${chalk.gray(`L${v.line}`)} ${chalk.magenta(`[${v.kind}]`)} ${v.message}`,
  );
  console.log(chalk.gray(`        ${v.snippet}`));
}
