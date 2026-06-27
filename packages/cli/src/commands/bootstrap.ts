import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import {
  bootstrapBackend,
  bootstrapFrontend,
  bootstrapMcp,
  type BackendStack,
  type FrontendStack,
  type McpLanguage,
  type ToolchainMode,
} from '../utils/stack-bootstrap.js';

const VALID_TOOLCHAINS: readonly ToolchainMode[] = ['auto', 'native', 'docker'];

/**
 * `dare bootstrap` — runs the official scaffold for the current project's
 * stack, **without** touching DARE artifacts. Use this on a project that
 * was created before v2.5.0 (or where bootstrap was skipped at init time).
 *
 * The command reads `dare.config.json` to determine the stack and refuses
 * to run if the working directory looks "dirty" — i.e. has framework
 * artifacts that the official scaffold would overwrite (composer.lock,
 * vendor/, package-lock.json with non-trivial deps, etc). Override with
 * `--force` if you know what you're doing.
 */
export const bootstrapCommand = new Command('bootstrap')
  .description("Run the official scaffold for the current project's stack (uses dare.config.json)")
  .option('--force', 'Run even if framework artifacts already exist (may overwrite files)', false)
  .option(
    '--toolchain <mode>',
    'Override toolchain mode for this run: auto | native | docker',
  )
  .action(async (options: { force: boolean; toolchain?: string }) => {
    const cwd = process.cwd();
    const cfgPath = path.join(cwd, 'dare.config.json');

    if (!(await fs.pathExists(cfgPath))) {
      console.error(chalk.red('❌ dare.config.json not found in current directory.'));
      console.log(chalk.yellow('  Run from a directory created by `dare init`.'));
      process.exit(1);
    }

    const cfg = (await fs.readJson(cfgPath)) as {
      name?: string;
      structure?: string;
      backend?: string;
      frontend?: string;
      mcpLanguage?: string;
      toolchain?: ToolchainMode;
    };

    // CLI flag wins over saved config; default 'auto' if neither set.
    let toolchain: ToolchainMode = cfg.toolchain ?? 'auto';
    if (options.toolchain) {
      if (!VALID_TOOLCHAINS.includes(options.toolchain as ToolchainMode)) {
        console.error(
          chalk.red(`❌ Invalid --toolchain "${options.toolchain}". Use: auto | native | docker.`),
        );
        process.exit(1);
      }
      toolchain = options.toolchain as ToolchainMode;
    }

    const projectName = cfg.name ?? path.basename(cwd);

    if (!options.force) {
      const conflicts = await detectConflicts(cwd);
      if (conflicts.length > 0) {
        console.error(chalk.red('❌ Refusing to run — found framework artifacts that the scaffold would overwrite:'));
        for (const f of conflicts) console.log(chalk.gray(`   - ${f}`));
        console.log(chalk.yellow('\n  Use --force to run anyway (may overwrite existing files).'));
        process.exit(1);
      }
    }

    console.log(chalk.blue.bold(`\n🚀 Running scaffold for ${cfg.structure}/${cfg.backend ?? cfg.frontend ?? cfg.mcpLanguage}\n`));

    try {
      if (cfg.structure === 'mcp-server') {
        const lang = (cfg.mcpLanguage ?? 'node-ts') as McpLanguage;
        await bootstrapMcp({ language: lang, dir: cwd, projectName, toolchain });
      } else if (cfg.structure === 'frontend' && cfg.frontend) {
        await bootstrapFrontend({
          stack: cfg.frontend as FrontendStack,
          dir: cwd,
          projectName,
          toolchain,
        });
      } else if ((cfg.structure === 'backend' || cfg.structure === 'monorepo' || cfg.structure === 'mvc') && cfg.backend) {
        const dir = cfg.structure === 'monorepo' ? path.join(cwd, 'backend') : cwd;
        await fs.ensureDir(dir);
        await bootstrapBackend({
          stack: cfg.backend as BackendStack,
          dir,
          projectName,
          toolchain,
          // MVC → full server-rendered app (Rails views); ignored by other stacks.
          fullstack: cfg.structure === 'mvc',
        });
        if (cfg.structure === 'monorepo' && cfg.frontend) {
          const fdir = path.join(cwd, 'frontend');
          await fs.ensureDir(fdir);
          await bootstrapFrontend({
            stack: cfg.frontend as FrontendStack,
            dir: fdir,
            projectName,
            toolchain,
          });
        }
      } else {
        console.error(chalk.red('❌ dare.config.json has no stack to bootstrap.'));
        process.exit(1);
      }

      console.log(chalk.green('\n✅ Bootstrap complete. Your DARE artifacts (.cursor/, DARE/, etc.) were preserved.\n'));
    } catch (err) {
      console.error(chalk.red(`\n❌ Bootstrap failed: ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  });

async function detectConflicts(cwd: string): Promise<string[]> {
  // These are framework artifacts that would be unsafe to overwrite without
  // explicit user consent. Presence indicates the project was already
  // scaffolded (manually or otherwise).
  const sentinels = [
    'vendor',
    'composer.lock',
    'node_modules',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'Cargo.lock',
    'target',
  ];
  const found: string[] = [];
  for (const f of sentinels) {
    if (await fs.pathExists(path.join(cwd, f))) found.push(f);
  }
  return found;
}
