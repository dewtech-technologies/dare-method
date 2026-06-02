import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { detectProject, formatDetectionReport } from '../utils/project-detector.js';
import { detectModules } from '../utils/module-detector.js';
import { ensureDareSkills } from '../utils/project-generator.js';
import {
  buildFacts,
  renderIdeiaSkeleton,
  renderModuleSpecSkeleton,
  renderArchitectureExcalidraw,
  moduleSpecFilename,
  renderC4Component,
  renderC4ContextSkeleton,
  renderC4ContainerSkeleton,
  renderDomainRulesSkeleton,
  renderStateMachinesSkeleton,
  renderPermissionsSkeleton,
  type ReverseFacts,
} from '../utils/reverse-facts.js';
import { extractDataModel, renderErd, renderApiSurface } from '../utils/datamodel.js';
import {
  parseSpecConfidence,
  renderConfidenceReport,
  renderCodeSpecMatrix,
  aggregate,
  type SpecConfidence,
} from '../utils/confidence.js';

interface ReverseOptions {
  dir?: string;
  check?: boolean;
  modules?: string;
  excalidraw?: boolean; // commander sets this false for --no-excalidraw
  report?: boolean;
  deep?: boolean;
}

export const reverseCommand = new Command('reverse')
  .description(
    'Reverse-engineer an existing codebase into a Phase-0 IDEIA.md + module specs (brownfield onboarding)',
  )
  .option('-d, --dir <path>', 'Target directory (default: current directory)')
  .option('--check', 'Only show detected modules without writing artifacts')
  .option('--modules <list>', 'Limit to specific modules (comma-separated ids/names)')
  .option('--no-excalidraw', 'Skip generating the editable .excalidraw architecture canvas')
  .option('--report', 'Compute the confidence report + code-spec matrix from already-marked specs')
  .option('--deep', 'Also extract ERD + API surface (deterministic) and scaffold domain-rules / state-machines / permissions / C4')
  .action(async (opts: ReverseOptions) => {
    const targetDir = path.resolve(opts.dir ?? process.cwd());

    // ── Report mode: parse markers from existing specs, no code re-scan ────
    if (opts.report) {
      await runConfidenceReport(targetDir);
      return;
    }

    console.log(chalk.blue.bold('\n🔁 DARE Framework - Reverse Engineering (Phase 0)\n'));
    console.log(chalk.gray(`  Scanning: ${targetDir}\n`));

    // Ensure the DARE slash-commands/skills are installed so the IDE side of
    // the workflow (`/dare-reverse`) actually exists. Idempotent. Skip in
    // --check mode (read-only detection, writes nothing).
    if (!opts.check) await ensureDareSkills(targetDir);

    const only = opts.modules
      ? opts.modules.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const spinner = ora('Detecting stack and module boundaries...').start();
    const detected = await detectProject(targetDir);
    const graph = await detectModules(targetDir, { only });
    spinner.stop();

    // ── Detection report ──────────────────────────────────────────────────
    console.log(chalk.yellow('Stack detection:\n'));
    console.log(formatDetectionReport(detected));
    console.log('');
    console.log(chalk.yellow(`Module map (strategy: ${graph.strategy}):\n`));
    console.log(formatModuleReport(graph.modules));
    console.log('');

    if (graph.modules.length === 0) {
      console.log(chalk.red('No modules with source code found. Nothing to reverse-engineer.'));
      return;
    }

    if (opts.check) {
      if (opts.deep) {
        const dm = await extractDataModel(targetDir);
        console.log(chalk.yellow(`Deep: ${dm.entities.length} entidade(s) e ${dm.endpoints.length} endpoint(s) detectados.\n`));
      }
      console.log(chalk.cyan('--check: detection only, no files written.'));
      return;
    }

    // ── Write artifacts ───────────────────────────────────────────────────
    const generatedAt = new Date().toISOString();
    const facts = buildFacts(detected, graph, generatedAt);
    const dareDir = path.join(targetDir, 'DARE');
    const reverseDir = path.join(dareDir, 'REVERSE');

    const writeSpinner = ora('Extracting API surface + data model...').start();
    try {
      await fs.ensureDir(reverseDir);

      // v3.2: deterministic API/entity extraction runs by default (was --deep
      // only) so IDEIA.md + module specs carry real collected data, not just
      // skeletons. The agent (/dare-reverse) enriches the semantic sections.
      const model = await extractDataModel(targetDir);
      writeSpinner.text = 'Writing IDEIA.md + module specs...';

      // Surface the counts in reverse-facts.json (no longer purely structural).
      const factsWithModel = {
        ...facts,
        api: {
          endpoints: model.endpoints.length,
          entities: model.entities.length,
        },
      };
      await fs.writeJSON(path.join(reverseDir, 'reverse-facts.json'), factsWithModel, { spaces: 2 });
      await fs.writeFile(
        path.join(dareDir, 'IDEIA.md'),
        renderIdeiaSkeleton(facts, opts.excalidraw !== false, model),
      );

      for (let i = 0; i < facts.modules.length; i++) {
        const mod = facts.modules[i];
        await fs.writeFile(
          path.join(reverseDir, moduleSpecFilename(i, mod)),
          renderModuleSpecSkeleton(mod, i, facts.modules.length, generatedAt, model),
        );
      }

      if (opts.excalidraw !== false) {
        await fs.writeFile(
          path.join(reverseDir, 'architecture.excalidraw'),
          renderArchitectureExcalidraw(facts),
        );
      }

      if (opts.deep) {
        await writeDeepArtifacts(targetDir, reverseDir, facts, model);
      }

      writeSpinner.succeed(
        chalk.green(
          `IDEIA.md + module specs generated (${model.endpoints.length} endpoints, ${model.entities.length} entities).`,
        ),
      );
    } catch (err) {
      writeSpinner.fail(chalk.red('Failed to write reverse-engineering artifacts'));
      console.error(err);
      process.exit(1);
    }

    // ── Output summary ────────────────────────────────────────────────────
    console.log(chalk.cyan('\n📋 Generated:\n'));
    console.log(`  ${chalk.gray('·')} DARE/IDEIA.md`);
    console.log(`  ${chalk.gray('·')} DARE/REVERSE/reverse-facts.json`);
    console.log(`  ${chalk.gray('·')} DARE/REVERSE/module-*.md (${facts.modules.length})`);
    if (opts.excalidraw !== false) {
      console.log(`  ${chalk.gray('·')} DARE/REVERSE/architecture.excalidraw`);
    }
    if (opts.deep) {
      console.log(`  ${chalk.gray('·')} DARE/REVERSE/ erd.md · api-surface.md · domain-rules.md · state-machines.md · permissions.md · c4/`);
    }

    console.log(chalk.cyan('\n📋 Next steps:\n'));
    console.log(`  ${chalk.gray('1.')} Run /dare-reverse in your IDE to fill the inferred sections (purpose, flows).`);
    console.log(`  ${chalk.gray('2.')} Review DARE/IDEIA.md and correct any wrong inference.`);
    console.log(`  ${chalk.gray('3.')} Promote to a DESIGN with: dare design "<what this project does>"\n`);
  });

async function writeDeepArtifacts(
  targetDir: string,
  reverseDir: string,
  facts: ReverseFacts,
  preExtracted?: Awaited<ReturnType<typeof extractDataModel>>,
): Promise<void> {
  const generatedAt = facts.generatedAt;
  const model = preExtracted ?? (await extractDataModel(targetDir));

  // Deterministic data model + API surface.
  await fs.writeFile(path.join(reverseDir, 'erd.md'), renderErd(model, generatedAt));
  await fs.writeFile(path.join(reverseDir, 'api-surface.md'), renderApiSurface(model, generatedAt));

  // C4 — component is deterministic (module map); context/container are skill skeletons.
  const c4Dir = path.join(reverseDir, 'c4');
  await fs.ensureDir(c4Dir);
  await fs.writeFile(path.join(c4Dir, 'c4-component.md'), renderC4Component(facts));
  await fs.writeFile(path.join(c4Dir, 'c4-context.md'), renderC4ContextSkeleton(generatedAt));
  await fs.writeFile(path.join(c4Dir, 'c4-container.md'), renderC4ContainerSkeleton(generatedAt));

  // Semantic skeletons for the skill to fill.
  await fs.writeFile(path.join(reverseDir, 'domain-rules.md'), renderDomainRulesSkeleton(generatedAt));
  await fs.writeFile(path.join(reverseDir, 'state-machines.md'), renderStateMachinesSkeleton(generatedAt));
  await fs.writeFile(path.join(reverseDir, 'permissions.md'), renderPermissionsSkeleton(generatedAt));

  // Record a deep summary in reverse-facts.json.
  const factsPath = path.join(reverseDir, 'reverse-facts.json');
  const saved = await fs.readJSON(factsPath).catch(() => null);
  if (saved) {
    saved.deep = {
      entities: model.entities.length,
      endpoints: model.endpoints.length,
      entityNames: model.entities.map((e) => e.name),
    };
    await fs.writeJSON(factsPath, saved, { spaces: 2 });
  }

}

async function runConfidenceReport(targetDir: string): Promise<void> {
  const dareDir = path.join(targetDir, 'DARE');
  const reverseDir = path.join(dareDir, 'REVERSE');

  console.log(chalk.blue.bold('\n🔎 DARE Reverse - Confidence Report\n'));

  if (!(await fs.pathExists(reverseDir))) {
    console.log(chalk.red('No DARE/REVERSE/ found. Run `dare reverse` (and /dare-reverse) first.'));
    process.exit(1);
  }

  const specs: SpecConfidence[] = [];
  const ideiaPath = path.join(dareDir, 'IDEIA.md');
  if (await fs.pathExists(ideiaPath)) {
    specs.push(parseSpecConfidence('IDEIA.md', await fs.readFile(ideiaPath, 'utf-8')));
  }
  const moduleFiles = (await fs.readdir(reverseDir))
    .filter((f) => /^module-.*\.md$/.test(f))
    .sort();
  for (const f of moduleFiles) {
    specs.push(parseSpecConfidence(f, await fs.readFile(path.join(reverseDir, f), 'utf-8')));
  }

  const { counts, index } = aggregate(specs);
  if (counts.total === 0) {
    console.log(chalk.yellow('No confidence markers (🟢/🟡/🔴) found yet.'));
    console.log(chalk.gray('Run /dare-reverse in your IDE to mark claims, then re-run --report.\n'));
    return;
  }

  const generatedAt = new Date().toISOString();
  const spinner = ora('Computing confidence report...').start();
  try {
    await fs.writeFile(
      path.join(reverseDir, 'confidence-report.md'),
      renderConfidenceReport(specs, generatedAt),
    );
    await fs.ensureDir(path.join(reverseDir, 'traceability'));
    await fs.writeFile(
      path.join(reverseDir, 'traceability', 'code-spec-matrix.md'),
      renderCodeSpecMatrix(specs, generatedAt),
    );

    const factsPath = path.join(reverseDir, 'reverse-facts.json');
    if (await fs.pathExists(factsPath)) {
      const facts = await fs.readJSON(factsPath).catch(() => null);
      if (facts) {
        facts.confidence = {
          computedAt: generatedAt,
          index,
          counts,
          perSpec: specs.map((s) => ({ spec: s.spec, ...s.counts, index: s.index })),
        };
        await fs.writeJSON(factsPath, facts, { spaces: 2 });
      }
    }
    spinner.succeed(chalk.green('Confidence report generated.'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to write confidence report'));
    console.error(err);
    process.exit(1);
  }

  console.log('');
  console.log(`  🟢 ${counts.confirmed}  🟡 ${counts.inferred}  🔴 ${counts.gap}  ` + chalk.bold(`· index ${index}%`));
  console.log(chalk.gray(`  (${counts.total} claims across ${specs.length} spec(s))`));
  console.log(chalk.cyan('\n📋 Generated:'));
  console.log(`  ${chalk.gray('·')} DARE/REVERSE/confidence-report.md`);
  console.log(`  ${chalk.gray('·')} DARE/REVERSE/traceability/code-spec-matrix.md`);
  if (counts.gap > 0) {
    console.log(chalk.yellow(`\n  ⚠️  ${counts.gap} gap(s) need human validation — see DARE/REVERSE/gaps.md\n`));
  } else {
    console.log('');
  }
}

function formatModuleReport(
  modules: { name: string; path: string; size: string; fileCount: number; loc: number; depends_on: string[] }[],
): string {
  if (modules.length === 0) return chalk.gray('  (none)');
  const icon: Record<string, string> = { LOW: '🔵', MED: '🟠', HIGH: '🔴' };
  return modules
    .map((m) => {
      const deps = m.depends_on.length ? ` → ${m.depends_on.join(', ')}` : '';
      return `  ${icon[m.size] ?? '•'} ${chalk.bold(m.name)} ${chalk.gray(`(${m.path})`)} `
        + `${chalk.gray(`· ${m.size} · ${m.fileCount} files · ${m.loc} LOC`)}${chalk.gray(deps)}`;
    })
    .join('\n');
}
