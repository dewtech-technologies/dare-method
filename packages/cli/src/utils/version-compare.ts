/**
 * Minimal semver comparison utilities for `dare update`.
 *
 * We don't pull in `semver` from npm because the comparisons we need are
 * trivial (compare `MAJOR.MINOR.PATCH` triples, no ranges, no pre-releases)
 * and the CLI already ships a slim dependency tree.
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

/**
 * Parse a semver-like string. Throws on invalid input so callers don't end up
 * silently comparing `NaN`s.
 */
export function parseVersion(input: string): ParsedVersion {
  const match = SEMVER_RE.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid version string: "${input}"`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** Return `-1` if `a < b`, `0` if equal, `1` if `a > b`. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;
  return 0;
}

/** True when `version` is strictly greater than `baseline`. */
export function isNewerThan(version: string, baseline: string): boolean {
  return compareVersions(version, baseline) === 1;
}

/**
 * Sort version strings ascending (oldest first). Caller-owned array stays
 * untouched.
 */
export function sortVersionsAscending(versions: string[]): string[] {
  return [...versions].sort(compareVersions);
}
