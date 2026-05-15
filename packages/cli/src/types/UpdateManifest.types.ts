/**
 * Types for the DARE Update Manifest system.
 *
 * The manifest lives in `templates/UPDATE-MANIFEST.json` and describes — for
 * every CLI version released — which template files changed, were added or
 * removed, plus optional migrations the `dare update` command must run.
 *
 * `dare update` reads the project's `dareVersion` from `dare.config.json`,
 * compares it with the installed CLI version, and applies every intermediate
 * version's entries in order.
 */

/** IDE targets a change applies to. `'*'` means every IDE / all setups. */
export type IdeTarget =
  | '*'
  | 'cursor'
  | 'claude-code'
  | 'antigravity'
  | 'hybrid'
  | 'claude-hybrid';

/** Kind of file-level change. */
export type ChangeKind = 'added' | 'modified' | 'removed' | 'renamed';

/** A single file-level change shipped in a release. */
export interface ManifestChange {
  /** What happened to the file. */
  type: ChangeKind;

  /**
   * Project-relative path that will be touched on the dev's machine
   * (e.g. `.cursor/commands/generate-design.md`).
   */
  path: string;

  /**
   * For `renamed` changes: the path the file used to live at, so we can
   * delete the old file before laying down the new one.
   */
  previousPath?: string;

  /**
   * Source path inside the CLI's `templates/` directory. When omitted, the
   * applier assumes the source mirrors `path` under `templates/`.
   */
  templateSource?: string;

  /** Short, human-readable description shown to the dev. */
  description: string;

  /** Which IDE setups this change applies to. Defaults to `['*']`. */
  appliesTo?: IdeTarget[];

  /**
   * Hash (SHA-256) of the **previous** template content. Used to detect
   * customizations: if the file in the project doesn't match this hash, we
   * treat it as customized and prompt the dev.
   */
  previousHash?: string;
}

/** Optional migration step (code transformation, not a file copy). */
export interface ManifestMigration {
  /** Stable id, e.g. `rename-dare-meta-to-config`. */
  id: string;
  /** What the migration does — shown to the dev. */
  description: string;
  /** Whether the dev can skip this safely. Defaults to `false`. */
  optional?: boolean;
}

/** Everything that ships in a single CLI release. */
export interface ManifestRelease {
  /** ISO-8601 release date. */
  releasedAt: string;
  /** One-line summary suitable for a changelog header. */
  summary: string;
  /** Longer explanation shown when the dev runs `dare update`. */
  changelog: string;
  /** File-level changes. */
  changes: ManifestChange[];
  /** Optional migrations (executed after file changes). */
  migrations?: ManifestMigration[];
}

/** Top-level shape of `templates/UPDATE-MANIFEST.json`. */
export interface UpdateManifest {
  /** Schema version of the manifest itself. Bump on breaking changes. */
  schemaVersion: 1;
  /** Keyed by semver version string, e.g. `"2.17.0"`. */
  releases: Record<string, ManifestRelease>;
}

/** Result of comparing project state with a target CLI version. */
export interface UpdatePlan {
  /** Version recorded in the project's `dare.config.json` (or `'legacy'`). */
  fromVersion: string;
  /** Version of the CLI currently installed. */
  toVersion: string;
  /** Ordered list of releases that need to be applied. */
  pendingReleases: Array<{ version: string; release: ManifestRelease }>;
  /** Total file changes across all pending releases (post-filter). */
  applicableChanges: ManifestChange[];
}

/** How a file change resolves on the dev's disk. */
export type ConflictResolution =
  | 'apply' // file matches previous hash (or is absent) → safe to overwrite
  | 'customized' // file was edited by the dev → ask
  | 'missing' // file expected but absent → just create
  | 'identical'; // already matches new content → skip
