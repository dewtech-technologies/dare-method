/**
 * Manifest — reads and writes `.dare/skills.yml`
 *
 * Source of truth for all installed skills in a DARE project.
 * Format is intentionally human-readable but managed by the CLI (ADR-01).
 *
 * @module skills/manifest
 */

import fs from 'fs-extra';
import path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillEntry {
  name: string;
  version: string;
  enabled: boolean;
  dependsOn?: string[];
}

export interface Manifest {
  skills: SkillEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIFEST_DIR = '.dare';
const MANIFEST_FILE = 'skills.yml';

function manifestPath(projectPath: string): string {
  return path.join(projectPath, MANIFEST_DIR, MANIFEST_FILE);
}

const HEADER_COMMENT =
  '# .dare/skills.yml — Managed by DARE CLI. Do not edit manually.\n';

// ---------------------------------------------------------------------------
// ManifestReader
// ---------------------------------------------------------------------------

export class ManifestReader {
  /**
   * Returns true when a manifest file exists at the given project root.
   */
  exists(projectPath: string): boolean {
    return fs.pathExistsSync(manifestPath(projectPath));
  }

  /**
   * Reads and parses the manifest.
   * Throws a descriptive error when the file is absent or malformed.
   */
  read(projectPath: string): Manifest {
    const filePath = manifestPath(projectPath);

    if (!fs.pathExistsSync(filePath)) {
      throw new Error(
        `Manifest not found at ${filePath}. Run 'dare skill add <name>' to create one.`,
      );
    }

    const raw = fs.readFileSync(filePath, 'utf-8');

    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch (err) {
      throw new Error(
        `Failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return this._validate(parsed, filePath);
  }

  /**
   * Reads the manifest if it exists, or returns an empty one.
   */
  readOrEmpty(projectPath: string): Manifest {
    if (!this.exists(projectPath)) {
      return { skills: [] };
    }
    return this.read(projectPath);
  }

  // ---- private -------------------------------------------------------------

  private _validate(raw: unknown, filePath: string): Manifest {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`${filePath}: expected an object at top level, got ${typeof raw}.`);
    }

    const obj = raw as Record<string, unknown>;

    if (!Array.isArray(obj['skills'])) {
      throw new Error(`${filePath}: 'skills' must be an array.`);
    }

    const skills: SkillEntry[] = (obj['skills'] as unknown[]).map(
      (item: unknown, idx: number) => {
        if (typeof item !== 'object' || item === null) {
          throw new Error(`${filePath}: skills[${idx}] must be an object.`);
        }
        const entry = item as Record<string, unknown>;

        if (typeof entry['name'] !== 'string' || !entry['name']) {
          throw new Error(`${filePath}: skills[${idx}].name must be a non-empty string.`);
        }
        if (typeof entry['version'] !== 'string' || !entry['version']) {
          throw new Error(
            `${filePath}: skills[${idx}].version must be a non-empty string.`,
          );
        }
        if (typeof entry['enabled'] !== 'boolean') {
          throw new Error(`${filePath}: skills[${idx}].enabled must be a boolean.`);
        }

        const skill: SkillEntry = {
          name: entry['name'],
          version: entry['version'],
          enabled: entry['enabled'],
        };

        if (Array.isArray(entry['dependsOn'])) {
          skill.dependsOn = (entry['dependsOn'] as unknown[]).map((d, i) => {
            if (typeof d !== 'string') {
              throw new Error(
                `${filePath}: skills[${idx}].dependsOn[${i}] must be a string.`,
              );
            }
            return d;
          });
        }

        return skill;
      },
    );

    return { skills };
  }
}

// ---------------------------------------------------------------------------
// ManifestWriter
// ---------------------------------------------------------------------------

export class ManifestWriter {
  private readonly _reader = new ManifestReader();

  /**
   * Writes (overwrites) the full manifest to disk.
   * Creates `.dare/` directory if it does not exist.
   */
  write(projectPath: string, manifest: Manifest): void {
    const filePath = manifestPath(projectPath);
    fs.ensureDirSync(path.dirname(filePath));

    const yamlBody = stringifyYaml(this._toSerializable(manifest), {
      indent: 2,
      lineWidth: 120,
    });

    fs.writeFileSync(filePath, HEADER_COMMENT + yamlBody, 'utf-8');
  }

  /**
   * Adds a skill entry to the manifest.
   * If the skill already exists (same name), it is replaced.
   */
  addSkill(projectPath: string, skill: SkillEntry): void {
    const manifest = this._reader.readOrEmpty(projectPath);
    const idx = manifest.skills.findIndex((s) => s.name === skill.name);

    if (idx >= 0) {
      manifest.skills[idx] = skill;
    } else {
      manifest.skills.push(skill);
    }

    this.write(projectPath, manifest);
  }

  /**
   * Removes a skill entry by name.
   * No-op if the skill is not present.
   */
  removeSkill(projectPath: string, skillName: string): void {
    const manifest = this._reader.readOrEmpty(projectPath);
    manifest.skills = manifest.skills.filter((s) => s.name !== skillName);
    this.write(projectPath, manifest);
  }

  // ---- private -------------------------------------------------------------

  /** Convert to a plain object that yaml serialises predictably. */
  private _toSerializable(manifest: Manifest): object {
    return {
      skills: manifest.skills.map((s) => {
        const entry: Record<string, unknown> = {
          name: s.name,
          version: s.version,
          enabled: s.enabled,
        };
        if (s.dependsOn && s.dependsOn.length > 0) {
          entry['dependsOn'] = s.dependsOn;
        }
        return entry;
      }),
    };
  }
}
