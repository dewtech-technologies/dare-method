/**
 * LocalRegistry — persistent skill registry stored in `~/.dare/registry/`.
 *
 * Directory layout:
 *
 * ```
 * ~/.dare/registry/
 * ├── index.json                  # { skills: [{ name, version, description, ... }] }
 * ├── dare-ax/
 * │   └── 1.0.0/
 * │       ├── skill.yml
 * │       └── index.ts
 * └── dare-layered-design/
 *     └── 1.0.0/
 *         └── ...
 * ```
 *
 * This acts as a local publish target that `dare skill publish` writes to, and
 * `dare skill add` falls back to when the remote mock registry has no match.
 *
 * @module skills/registry-local
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocalRegistrySkill {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  dare_version?: string;
  published_at?: string;
  size_kb?: number;
  source: 'local';
}

interface LocalRegistryIndex {
  skills: LocalRegistrySkill[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default path for the local registry root.  Tests can override via env var. */
function getRegistryRoot(): string {
  return process.env['DARE_LOCAL_REGISTRY'] ?? path.join(os.homedir(), '.dare', 'registry');
}

const INDEX_FILE = 'index.json';

// ---------------------------------------------------------------------------
// LocalRegistry
// ---------------------------------------------------------------------------

export class LocalRegistry {
  private readonly _root: string;

  constructor(root?: string) {
    this._root = root ?? getRegistryRoot();
  }

  // ---- Read -----------------------------------------------------------------

  /**
   * Returns all skills in the local registry index.
   */
  list(): LocalRegistrySkill[] {
    return this._readIndex().skills;
  }

  /**
   * Finds a skill by name (and optionally an exact version).
   * Returns `null` when not found.
   */
  find(name: string, version?: string): LocalRegistrySkill | null {
    const skills = this._readIndex().skills;
    const matches = skills.filter((s) => s.name === name);

    if (matches.length === 0) return null;

    if (version) {
      return matches.find((s) => s.version === version) ?? null;
    }

    // Return the latest by published_at, or just the last entry.
    return matches.sort((a, b) =>
      (b.published_at ?? '').localeCompare(a.published_at ?? ''),
    )[0] ?? null;
  }

  // ---- Write ----------------------------------------------------------------

  /**
   * Publishes a skill from `skillPath` into the local registry.
   *
   * Copies all files (excluding node_modules/, dist/, .git/) from `skillPath`
   * into `~/.dare/registry/<name>/<version>/` and updates `index.json`.
   */
  publish(skillPath: string, meta: LocalRegistrySkill): void {
    const destDir = path.join(this._root, meta.name, meta.version);
    fs.ensureDirSync(destDir);

    // Copy files (excluding node_modules, dist, .git).
    const entries = fs.readdirSync(skillPath, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
      const src = path.join(skillPath, entry.name);
      const dst = path.join(destDir, entry.name);
      fs.copySync(src, dst);
    }

    // Update index.
    const index = this._readIndex();
    const existing = index.skills.findIndex(
      (s) => s.name === meta.name && s.version === meta.version,
    );
    if (existing >= 0) {
      index.skills[existing] = meta;
    } else {
      index.skills.push(meta);
    }
    this._writeIndex(index);
  }

  /**
   * Installs a skill from the local registry into a project.
   *
   * Copies files from `~/.dare/registry/<name>/<version>/` into
   * `<targetProjectPath>/packages/skills/<name>/`.
   */
  install(name: string, version: string, targetProjectPath: string): void {
    const srcDir = path.join(this._root, name, version);
    if (!fs.pathExistsSync(srcDir)) {
      throw new Error(
        `Local registry does not have "${name}@${version}". ` +
          `Run \`dare skill publish\` first.`,
      );
    }
    const destDir = path.join(targetProjectPath, 'packages', 'skills', name);
    fs.ensureDirSync(destDir);
    fs.copySync(srcDir, destDir);
  }

  // ---- Private --------------------------------------------------------------

  private _indexPath(): string {
    return path.join(this._root, INDEX_FILE);
  }

  private _readIndex(): LocalRegistryIndex {
    const p = this._indexPath();
    if (!fs.pathExistsSync(p)) {
      return { skills: [] };
    }
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as Record<string, unknown>)['skills'])) {
      return { skills: [] };
    }
    return parsed as LocalRegistryIndex;
  }

  private _writeIndex(index: LocalRegistryIndex): void {
    fs.ensureDirSync(this._root);
    fs.writeFileSync(this._indexPath(), JSON.stringify(index, null, 2) + '\n', 'utf-8');
  }
}
