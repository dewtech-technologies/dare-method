/**
 * Storage layer for the DARE registry.
 *
 * Reads and writes `data/index.json` — the source of truth for all published
 * skills.  In production (Vercel), this file lives in the repo; updates are
 * applied in memory during the request but are NOT persisted (read-only FS).
 * A future v2 will write to a database or S3.
 *
 * For tests, the data directory path is overridable via the `dataDir` param.
 *
 * @module lib/storage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillEntry {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  dare_version: string;
  dependencies: Record<string, string>;
  keywords: string[];
  homepage?: string;
  publishedAt: string;
}

export interface RegistryIndex {
  version: string;
  updatedAt: string;
  skills: SkillEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultDataDir(): string {
  // Works both in ts-node and compiled JS since data/ sits next to lib/
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(__dirname, '..', 'data');
}

// ---------------------------------------------------------------------------
// Storage API
// ---------------------------------------------------------------------------

/**
 * Reads the registry index from `data/index.json`.
 * Returns a fresh parsed object on each call (no caching).
 */
export function readIndex(dataDir?: string): RegistryIndex {
  const dir = dataDir ?? defaultDataDir();
  const filePath = path.join(dir, 'index.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as RegistryIndex;
}

/**
 * Writes `index` back to `data/index.json`.
 * Sets `updatedAt` to the current ISO timestamp.
 */
export function writeIndex(index: RegistryIndex, dataDir?: string): void {
  const dir = dataDir ?? defaultDataDir();
  const filePath = path.join(dir, 'index.json');
  index.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(index, null, 2) + '\n', 'utf-8');
}

/**
 * Upserts a skill entry into the index.
 * If a skill with the same name+version already exists it is replaced;
 * otherwise the entry is appended.
 */
export function upsertSkill(
  index: RegistryIndex,
  entry: SkillEntry,
): RegistryIndex {
  const existing = index.skills.findIndex(
    (s) => s.name === entry.name && s.version === entry.version,
  );
  if (existing >= 0) {
    index.skills[existing] = entry;
  } else {
    index.skills.push(entry);
  }
  return index;
}

/**
 * Finds a skill by name (case-insensitive).
 * When multiple versions exist, returns them all sorted newest first.
 */
export function findSkillsByName(
  index: RegistryIndex,
  name: string,
): SkillEntry[] {
  const lower = name.toLowerCase();
  return index.skills
    .filter((s) => s.name.toLowerCase() === lower)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
