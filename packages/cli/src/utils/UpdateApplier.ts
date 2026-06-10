/**
 * Applies an `UpdatePlan` to a project on disk.
 *
 * The detector decides *what* would happen; the applier actually writes files,
 * backs up the previous state, prompts on conflicts and runs migrations. Kept
 * separate so unit tests can poke the detector without touching the filesystem.
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { fileURLToPath } from 'url';
import type {
  ConflictResolution,
  ManifestChange,
  ManifestMigration,
  UpdatePlan,
} from '../types/UpdateManifest.types.js';
import { classifyChange, readProjectConfig } from './UpdateDetector.js';
import {
  seedDriftDefaultsIfAbsent,
  seedVerificationDefaultsIfAbsent,
} from '../verification/config.js';
import { seedHooksDefaultsIfAbsent } from '../hooks/config.js';

/** Where templates ship inside the CLI bundle. */
function getTemplatesRoot(): string {
  const here = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(here), '..', '..', 'templates');
}

/** Resolve the template source for a change (defaults to mirroring `path`). */
function resolveTemplateSource(change: ManifestChange): string {
  const rel = change.templateSource ?? change.path;
  return path.join(getTemplatesRoot(), rel);
}

/** Read the new template content for a non-schema change. */
async function readNewContent(change: ManifestChange): Promise<Buffer | null> {
  if (change.path.includes('#')) return null; // schema-only
  if (change.type === 'removed') return null;
  const source = resolveTemplateSource(change);
  if (!(await fs.pathExists(source))) {
    throw new Error(
      `Template source missing for change "${change.path}" (expected at ${source}). ` +
        `Make sure the manifest's templateSource is correct or that templates/ ships the file.`,
    );
  }
  return fs.readFile(source);
}

/** Per-file outcome used to build the final summary. */
export interface ChangeOutcome {
  change: ManifestChange;
  resolution: ConflictResolution;
  action: 'wrote' | 'deleted' | 'skipped' | 'kept-custom';
}

export interface ApplyOptions {
  projectRoot: string;
  /** Backup directory inside the project (defaults to `.dare/backup-<from>`). */
  backupDir?: string;
  /** Skip interactive prompts and always overwrite customizations. Dangerous. */
  force?: boolean;
  /** Print plan but write nothing. */
  dryRun?: boolean;
  /** Default answer for the per-file conflict prompt — `'ask'` is interactive. */
  conflictPolicy?: 'ask' | 'keep' | 'replace';
}

/**
 * Snapshot every file the plan touches into `backupDir`, preserving its
 * relative path. Touches only files that currently exist.
 */
export async function backupAffectedFiles(
  plan: UpdatePlan,
  projectRoot: string,
  backupDir: string,
): Promise<number> {
  let copied = 0;
  for (const change of plan.applicableChanges) {
    if (change.path.includes('#')) continue;
    const src = path.join(projectRoot, change.path);
    if (!(await fs.pathExists(src))) continue;
    const dest = path.join(backupDir, change.path);
    await fs.ensureDir(path.dirname(dest));
    await fs.copy(src, dest);
    copied++;
  }
  return copied;
}

/**
 * Prompt the dev on a customized file. Returns the action to take.
 *
 * Honors `conflictPolicy` to skip the prompt in non-interactive flows
 * (CI, scripted updates) — `'keep'` preserves the local file, `'replace'`
 * overwrites it.
 */
async function resolveCustomization(
  change: ManifestChange,
  conflictPolicy: 'ask' | 'keep' | 'replace',
): Promise<'keep' | 'replace'> {
  if (conflictPolicy !== 'ask') return conflictPolicy;

  const { decision } = (await inquirer.prompt([
    {
      type: 'list',
      name: 'decision',
      message: `Arquivo customizado: ${chalk.yellow(change.path)}\n  ${chalk.gray(change.description)}`,
      choices: [
        { name: '🔒 Manter minha versão (recomendado se você editou)', value: 'keep' },
        { name: '⬆️  Substituir pela versão nova do DARE', value: 'replace' },
      ],
      default: 'keep',
    },
  ])) as { decision: 'keep' | 'replace' };

  return decision;
}

async function applyOne(
  change: ManifestChange,
  projectRoot: string,
  conflictPolicy: 'ask' | 'keep' | 'replace',
  dryRun: boolean,
): Promise<ChangeOutcome> {
  // Schema-only ("dare.config.json#field") — migrations handle these.
  if (change.path.includes('#')) {
    return { change, resolution: 'apply', action: 'skipped' };
  }

  const target = path.join(projectRoot, change.path);
  const newContent = await readNewContent(change);
  const resolution = await classifyChange(projectRoot, change, newContent);

  if (resolution === 'identical') {
    return { change, resolution, action: 'skipped' };
  }

  if (change.type === 'removed') {
    if (!dryRun && (await fs.pathExists(target))) {
      await fs.remove(target);
    }
    return { change, resolution, action: 'deleted' };
  }

  if (resolution === 'customized') {
    const decision = await resolveCustomization(change, conflictPolicy);
    if (decision === 'keep') {
      return { change, resolution, action: 'kept-custom' };
    }
  }

  if (change.type === 'renamed' && change.previousPath) {
    const prev = path.join(projectRoot, change.previousPath);
    if (!dryRun && (await fs.pathExists(prev))) {
      await fs.remove(prev);
    }
  }

  if (newContent && !dryRun) {
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, newContent);
  }

  return { change, resolution, action: 'wrote' };
}

/** Run all migrations declared in the plan (post file changes). */
async function runMigrations(
  plan: UpdatePlan,
  projectRoot: string,
  dryRun: boolean,
): Promise<ManifestMigration[]> {
  const ran: ManifestMigration[] = [];
  for (const { release } of plan.pendingReleases) {
    if (!release.migrations) continue;
    for (const migration of release.migrations) {
      if (dryRun) {
        ran.push(migration);
        continue;
      }
      await runMigration(migration, projectRoot);
      ran.push(migration);
    }
  }
  return ran;
}

/**
 * Built-in migrations. Each `id` maps to a handler — unknown ids are skipped
 * with a warning so an older CLI can still apply a partial update.
 */
async function runMigration(
  migration: ManifestMigration,
  projectRoot: string,
): Promise<void> {
  switch (migration.id) {
    case 'unify-version-field': {
      // Pre-2.17 projects wrote `version: "0.1.0"` (zombie placeholder) and
      // an early prototype briefly used `dareVersion`. Consolidate both into
      // a single `version` field that now tracks the DARE release.
      const configPath = path.join(projectRoot, 'dare.config.json');
      const cfg = (await readProjectConfig(projectRoot)) as Record<string, unknown>;
      const legacyDareVersion = cfg.dareVersion as string | undefined;
      if (legacyDareVersion) {
        cfg.version = legacyDareVersion;
        delete cfg.dareVersion;
      } else if (!cfg.version || cfg.version === '0.1.0') {
        cfg.version = '2.16.0';
      }
      await fs.writeJSON(configPath, cfg, { spaces: 2 });
      return;
    }
    case 'add-review-refine-defaults': {
      // Seed the new review/refine objects so dev can see they exist (and
      // edit). Opt-in stance for legacy projects — review.onComplete: false
      // means the gate is silent until the dev flips it.
      const configPath = path.join(projectRoot, 'dare.config.json');
      const cfg = (await readProjectConfig(projectRoot)) as Record<string, unknown>;
      if (!cfg.review) {
        cfg.review = { onComplete: false, strict: false };
      }
      if (!cfg.refine) {
        cfg.refine = { thresholds: { low: 5, med: 12, high: 20 } };
      }
      await fs.writeJSON(configPath, cfg, { spaces: 2 });
      return;
    }
    case 'add-verification-defaults': {
      const configPath = path.join(projectRoot, 'dare.config.json');
      const cfg = (await readProjectConfig(projectRoot)) as Record<string, unknown>;
      seedVerificationDefaultsIfAbsent(cfg);
      seedDriftDefaultsIfAbsent(cfg);
      seedHooksDefaultsIfAbsent(cfg);
      await fs.writeJSON(configPath, cfg, { spaces: 2 });
      return;
    }
    default:
      console.log(
        chalk.yellow(
          `  ⚠  Unknown migration "${migration.id}" — skipping (CLI may be outdated).`,
        ),
      );
  }
}

/** Bump `version` in `dare.config.json` to the plan's target version. */
async function stampVersion(projectRoot: string, toVersion: string): Promise<void> {
  const configPath = path.join(projectRoot, 'dare.config.json');
  const cfg = (await readProjectConfig(projectRoot)) as Record<string, unknown>;
  cfg.version = toVersion;
  cfg.updatedAt = new Date().toISOString();
  await fs.writeJSON(configPath, cfg, { spaces: 2 });
}

export interface ApplyResult {
  outcomes: ChangeOutcome[];
  migrationsRan: ManifestMigration[];
  backupPath: string | null;
  backupFilesCount: number;
}

/**
 * Execute the plan. Returns a structured result so the command can print a
 * sensible summary at the end.
 */
export async function applyPlan(
  plan: UpdatePlan,
  options: ApplyOptions,
): Promise<ApplyResult> {
  const {
    projectRoot,
    backupDir,
    force = false,
    dryRun = false,
    conflictPolicy = force ? 'replace' : 'ask',
  } = options;

  let backupPath: string | null = null;
  let backupFilesCount = 0;

  if (!dryRun) {
    backupPath =
      backupDir ?? path.join(projectRoot, '.dare', `backup-${plan.fromVersion}`);
    await fs.ensureDir(backupPath);
    backupFilesCount = await backupAffectedFiles(plan, projectRoot, backupPath);
  }

  const outcomes: ChangeOutcome[] = [];
  for (const change of plan.applicableChanges) {
    const outcome = await applyOne(change, projectRoot, conflictPolicy, dryRun);
    outcomes.push(outcome);
  }

  const migrationsRan = await runMigrations(plan, projectRoot, dryRun);

  if (!dryRun) {
    await stampVersion(projectRoot, plan.toVersion);
  }

  return { outcomes, migrationsRan, backupPath, backupFilesCount };
}
