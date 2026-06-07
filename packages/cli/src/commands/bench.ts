import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport } from '../verification/bench/report.js';
import { runSuite } from '../verification/bench/harness.js';

function defaultSuiteDir(): string {
  const here = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(here), '..', '..', 'fixtures', 'bench');
}

export interface BenchOptions {
  suite?: string;
  json?: boolean;
  baseline?: string;
  failOnRegression?: string;
  filter?: string;
}

export const benchCommand = new Command('bench')
  .description('Run verification bench fixtures (deterministic patch quality gate)')
  .option('--suite <dir>', 'Directory with suite.json', defaultSuiteDir())
  .option('--json', 'Emit JSON report on stdout', false)
  .option('--baseline <file>', 'Baseline BenchReport JSON for regression comparison')
  .option(
    '--fail-on-regression <pp>',
    'Fail if solve-rate drops more than N percentage points vs baseline',
    '3',
  )
  .option('--filter <glob>', 'Run only fixtures matching glob')
  .action(async (options: BenchOptions) => {
    const suiteDir = path.resolve(process.cwd(), options.suite ?? defaultSuiteDir());

    if (!(await fs.pathExists(path.join(suiteDir, 'suite.json')))) {
      console.error(chalk.red(`Error: invalid or missing suite at ${suiteDir}`));
      process.exit(2);
    }

    let baseline;
    if (options.baseline) {
      const baselinePath = path.resolve(process.cwd(), options.baseline);
      if (!(await fs.pathExists(baselinePath))) {
        console.error(chalk.red(`Error: baseline file not found: ${baselinePath}`));
        process.exit(2);
      }
      baseline = (await fs.readJson(baselinePath)) as ReturnType<typeof buildReport>;
    }

    const results = await runSuite(suiteDir, {
      filter: options.filter,
      deps: undefined,
    });

    const failPp = options.failOnRegression
      ? parseInt(options.failOnRegression, 10)
      : 3;

    const report = buildReport(results, {
      suite: path.relative(process.cwd(), suiteDir) || suiteDir,
      baseline,
      failOnRegressionPp: failPp,
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(chalk.blue.bold('\n📊 DARE Bench Report\n'));
      console.log(`  Suite: ${report.suite}`);
      console.log(
        `  Solved: ${report.totals.solved}/${report.totals.fixtures} (${(report.totals.solveRate * 100).toFixed(1)}%)`,
      );
      if (report.regression) {
        const icon = report.regression.failed ? chalk.red('❌') : chalk.green('✓');
        console.log(
          `  Regression: ${icon} baseline ${(report.regression.baselineSolveRate * 100).toFixed(1)}% → delta ${report.regression.deltaPp.toFixed(1)}pp`,
        );
      }
      console.log();
    }

    if (report.regression?.failed) {
      process.exit(1);
    }
    process.exit(0);
  });
