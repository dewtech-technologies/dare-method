/**
 * Detects what `dare update` needs to do for a given project.
 *
 * Pure planning — it never writes to disk. Loads the manifest, reads the
 * project's `dare.config.json`, and produces an `UpdatePlan` the applier can
 * execute (or the dev can simply preview with `--dry-run`).
 */

import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import type {
  ConflictResolution,
  IdeTarget,
  ManifestChange,
  UpdateManifest,
  UpdatePlan,
} from '../types/UpdateManifest.types.js';
import {
  compareVersions,
  isNewerThan,
  sortVersionsAscending,
} from './version-compare.js';

const require = createRequire(import.meta.url);

/** Path to `templates/UPDATE-MANIFEST.json`, shipped with the CLI. */
function getManifestPath(): string {
  // `import.meta.url` resolves to .../dist/utils/UpdateDetector.js once built.
  // The manifest lives at .../templates/UPDATE-MANIFEST.json, two levels up.
  const here = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(here), '..', '..', 'templates', 'UPDATE-MANIFEST.json');
}

export async function loadManifest(): Promise<UpdateManifest> {
  const manifestPath = getManifestPath();
  if (!(await fs.pathExists(manifestPath))) {
    throw new Error(`UPDATE-MANIFEST.json not found at ${manifestPath}`);
  }
  const data = (await fs.readJSON(manifestPath)) as UpdateManifest;
  if (data.schemaVersion !== 1) {
    throw new Error(
      `Unsupported manifest schemaVersion ${data.schemaVersion} (this CLI understands 1).`,
    );
  }
  return data;
}

/** Read the current CLI version from the bundled `package.json`. */
export function getCliVersion(): string {
  const pkg = require('../../package.json') as { version: string };
  return pkg.version;
}

export interface ProjectConfig {
  ide?: string;
  version?: string;
  [key: string]: unknown;
}

/**
 * Legacy `dare init` versions (pre-2.17) wrote a hardcoded `"0.1.0"` placeholder
 * that nothing read. Treat it as "this project was never tracked" — the update
 * flow will assume the project is on 2.16.0 (the last release before this field
 * carried meaning) and run the unification migration.
 */
const LEGACY_PLACEHOLDER_VERSION = '0.1.0';
/** Baseline assumed for projects with the legacy placeholder or no `version`. */
export const LEGACY_BASELINE_VERSION = '2.16.0';

/**
 * Resolve the "effective DARE version" of a project, handling the legacy
 * `"0.1.0"` placeholder that was hardcoded by pre-2.17 `dare init`.
 */
export function resolveProjectVersion(cfg: ProjectConfig): {
  version: string;
  isLegacy: boolean;
} {
  const raw = cfg.version;
  if (!raw || raw === LEGACY_PLACEHOLDER_VERSION) {
    return { version: LEGACY_BASELINE_VERSION, isLegacy: true };
  }
  return { version: raw, isLegacy: false };
}

/** Load and return `dare.config.json` from the given project root. */
export async function readProjectConfig(projectRoot: string): Promise<ProjectConfig> {
  const configPath = path.join(projectRoot, 'dare.config.json');
  if (!(await fs.pathExists(configPath))) {
    throw new Error(
      `dare.config.json not found in ${projectRoot}. Is this a DARE project? Run \`dare init\` first.`,
    );
  }
  return (await fs.readJSON(configPath)) as ProjectConfig;
}

/**
 * Filter a single change against the IDE configured for this project. A change
 * with `appliesTo: ['*']` (or no `appliesTo`) is universal.
 *
 * Hybrid setups (`hybrid` = cursor+antigravity, `claude-hybrid` = claude+cursor)
 * accept changes targeted at any of their member IDEs.
 */
export function changeAppliesToIde(change: ManifestChange, ide: string | undefined): boolean {
  const targets = change.appliesTo ?? ['*'];
  if (targets.includes('*')) return true;
  if (!ide) return false;

  if (targets.includes(ide as IdeTarget)) return true;

  // Hybrid expansions
  if (ide === 'hybrid') {
    return targets.includes('cursor') || targets.includes('antigravity');
  }
  if (ide === 'claude-hybrid') {
    return targets.includes('claude-code') || targets.includes('cursor');
  }
  return false;
}

/**
 * Build the update plan: every release between `from` (exclusive) and `to`
 * (inclusive), with its changes filtered down to what applies to this IDE.
 */
export function buildUpdatePlan(
  manifest: UpdateManifest,
  fromVersion: string,
  toVersion: string,
  ide: string | undefined,
): UpdatePlan {
  const allVersions = Object.keys(manifest.releases);
  const sorted = sortVersionsAscending(allVersions);

  const pending = sorted.filter((v) => {
    const newerThanFrom = isNewerThan(v, fromVersion);
    const notNewerThanTo = compareVersions(v, toVersion) !== 1;
    return newerThanFrom && notNewerThanTo;
  });

  const pendingReleases = pending.map((version) => ({
    version,
    release: manifest.releases[version],
  }));

  const applicableChanges: ManifestChange[] = [];
  for (const { release } of pendingReleases) {
    for (const change of release.changes) {
      if (changeAppliesToIde(change, ide)) {
        applicableChanges.push(change);
      }
    }
  }

  return {
    fromVersion,
    toVersion,
    pendingReleases,
    applicableChanges,
  };
}

/** SHA-256 hex digest of file content; returns `null` if the file is absent. */
export async function hashFile(absPath: string): Promise<string | null> {
  if (!(await fs.pathExists(absPath))) return null;
  const buf = await fs.readFile(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Classify what we'd be doing to a single file on disk:
 *   - `identical`  → new template content already matches what's on disk
 *   - `missing`    → file absent in the project, safe to create
 *   - `apply`      → file present and matches `previousHash`, safe to overwrite
 *   - `customized` → file present but doesn't match `previousHash`; ask the dev
 *
 * `newContent` is the bytes we'd write; `previousHash` is the manifest's record
 * of what the file looked like in the prior version (optional — without it we
 * can't tell `apply` from `customized` and conservatively return `customized`).
 */
export async function classifyChange(
  projectRoot: string,
  change: ManifestChange,
  newContent: Buffer | string | null,
): Promise<ConflictResolution> {
  // Schema-only changes (path includes `#`) are handled by migrations,
  // not by file copy. Treat them as `apply`.
  if (change.path.includes('#')) return 'apply';

  const target = path.join(projectRoot, change.path);
  const currentHash = await hashFile(target);

  if (change.type === 'removed') {
    return currentHash === null ? 'identical' : 'apply';
  }

  if (currentHash === null) return 'missing';

  if (newContent !== null) {
    const newHash = crypto
      .createHash('sha256')
      .update(typeof newContent === 'string' ? Buffer.from(newContent) : newContent)
      .digest('hex');
    if (newHash === currentHash) return 'identical';
  }

  if (change.previousHash && currentHash === change.previousHash) {
    return 'apply';
  }

  return 'customized';
}
