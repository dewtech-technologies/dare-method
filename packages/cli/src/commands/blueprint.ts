import { Command } from 'commander';
import chalk from 'chalk';
import { addAiOptions, aiOptionsFromFlags } from '../ai/command-options.js';
import type { AiCommandOptions } from '../ai/types.js';
import { runBlueprint } from '../core/commands/blueprint.js';

/**
 * `dare blueprint` — gera o esqueleto dos 4 artefatos da fase de Architect:
 *
 *   DARE/BLUEPRINT.md
 *   DARE/TASKS.md
 *   DARE/dare-dag.yaml
 *   DARE/EXECUTION/task-<id>.md (uma por task)
 *
 * O preenchimento real é responsabilidade do agente IA (via `/dare-blueprint`,
 * `/generate-blueprint` ou skill `dare-blueprint`). Este comando apenas
 * inicializa a estrutura com placeholders consistentes — alinhada com o
 * schema canônico definido em `skill-dag-runner` (com `limits`, `models` per
 * runner e `spec_file`). Arquivos já existentes são preservados.
 */
export const blueprintCommand = new Command('blueprint')
  .description('Scaffold BLUEPRINT.md, dare-dag.yaml, TASKS.md and EXECUTION/task-*.md from DESIGN.md')
  .argument('[design-file]', 'Path to DESIGN.md', 'DARE/DESIGN.md')
  .option('-f, --force', 'Overwrite existing files', false);

addAiOptions(blueprintCommand);

blueprintCommand.action(async (designFile: string, options: { force: boolean } & AiCommandOptions) => {
    console.log(chalk.blue.bold('\n🏗️  DARE Framework - Blueprint Phase\n'));
    const aiOpts = aiOptionsFromFlags(options);
    const result = await runBlueprint({
      cwd: process.cwd(),
      ai: aiOpts.enabled,
      provider: aiOpts.provider,
      input: {
        designFile,
        force: options.force,
      },
    });

    if (aiOpts.enabled && aiOpts.json) {
      console.log(JSON.stringify(result.enrichment ?? null, null, 2));
      if (!result.ok) process.exit(1);
      return;
    }

    if (!result.ok) {
      console.error(chalk.red(`❌ ${result.error ?? 'Failed to scaffold blueprint artifacts'}`));
      if (result.error?.includes('DESIGN.md not found')) {
        console.log(chalk.yellow('Run: dare design "Your project description"'));
      }
      process.exit(1);
    }

    console.log(chalk.green('✅ Files scaffolded (existing files preserved):'));
    for (const summaryLine of result.summary ?? []) {
      console.log(chalk.gray(`   ${summaryLine}`));
    }
    console.log('');
    console.log(chalk.gray('Tip: use --ai for terminal enrichment or /dare-blueprint in your IDE.'));
    console.log(chalk.gray('Tip: open DARE/dag-graph.mmd in your editor with a Mermaid preview to see the static graph.'));
    console.log(chalk.cyan('\nNext: dare execute --next\n'));
  });
