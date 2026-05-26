/**
 * Registry client — mock implementation backed by a local JSON file.
 *
 * When the real HTTP registry (`registry.dare-method.dev`) is available,
 * replace `loadAll()` and `findByName()` with fetch calls.
 * The rest of the skill commands depend only on this interface, so the
 * swap will be transparent to them.
 *
 * @module skills/registry
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrySkill {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  homepage: string;
  repository: string;
  keywords: string[];
  /** Map of skill name → semver range */
  dependencies: Record<string, string>;
  published_at: string;
  size_kb: number;
}

interface RegistryData {
  skills: RegistrySkill[];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class Registry {
  private _data: RegistryData | null = null;

  /**
   * Returns all skills known to the registry.
   * Result is cached in-memory for the lifetime of the process.
   */
  loadAll(): RegistrySkill[] {
    return this._getData().skills;
  }

  /**
   * Looks up a skill by exact name.
   * Returns `undefined` when not found.
   */
  findByName(name: string): RegistrySkill | undefined {
    return this._getData().skills.find((s) => s.name === name);
  }

  /**
   * Returns the list of (transitive) dependencies for a skill in
   * topological install order (deepest dependency first).
   *
   * Throws when a dependency is not in the registry.
   * Throws on circular dependency chains.
   */
  resolveDependencies(skillName: string): RegistrySkill[] {
    const resolved: RegistrySkill[] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (inStack.has(name)) {
        throw new Error(
          `Circular dependency detected: "${name}" is already in the resolution stack.`,
        );
      }

      const skill = this.findByName(name);
      if (!skill) {
        throw new Error(
          `Dependency "${name}" not found in the registry. Cannot resolve.`,
        );
      }

      inStack.add(name);

      for (const depName of Object.keys(skill.dependencies)) {
        visit(depName);
      }

      inStack.delete(name);
      visited.add(name);
      resolved.push(skill);
    };

    visit(skillName);

    // Remove the skill itself — return only its dependencies.
    return resolved.filter((s) => s.name !== skillName);
  }

  // ---- private -------------------------------------------------------------

  private _getData(): RegistryData {
    if (!this._data) {
      // Resolve relative to the *source* file so this works both in:
      //   - `tsx` (runs from src/skills/)
      //   - `node dist/` (compiled JS lands in dist/skills/)
      // Both layouts keep registry-mock.json in the same directory as this
      // file, so __dirname-equivalent resolution always works.
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const jsonPath = path.join(dir, 'registry-mock.json');

      if (!fs.pathExistsSync(jsonPath)) {
        // Fallback: try createRequire (works in some bundler environments)
        const require = createRequire(import.meta.url);
        this._data = require('./registry-mock.json') as RegistryData;
      } else {
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        this._data = JSON.parse(raw) as RegistryData;
      }
    }
    return this._data;
  }
}

/** Singleton instance used by all skill commands. */
export const registry = new Registry();
