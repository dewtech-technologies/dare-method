import fs from 'node:fs';
import path from 'node:path';

/** Stable message for tests and CLI error handling. */
export const PATH_ESCAPE_MESSAGE =
  'Path escape: resolved path is outside allowed root';

/**
 * Thrown when a resolved path leaves the allowed project root.
 */
export class PathEscapeError extends Error {
  readonly code = 'PATH_ESCAPE' as const;

  constructor(message: string = PATH_ESCAPE_MESSAGE) {
    super(message);
    this.name = 'PathEscapeError';
  }
}

/**
 * Ensures a path is relative and does not escape via '..' (RS-01).
 */
export function assertRelativeSafe(targetPath: string): void {
  if (path.isAbsolute(targetPath)) {
    throw new Error(`targetPath must be relative, got absolute: ${targetPath}`);
  }
  const norm = path.posix.normalize(targetPath.replace(/\\/g, '/'));
  if (norm.startsWith('..') || norm.includes('/../')) {
    throw new Error(`targetPath must not contain '..': ${targetPath}`);
  }
}

function isUncPath(p: string): boolean {
  const normalized = p.replace(/\//g, '\\');
  return normalized.startsWith('\\\\');
}

function tryRealpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function normalizeForPrefixCheck(p: string): string {
  const resolved = tryRealpath(p);
  if (process.platform === 'win32') {
    return resolved.replace(/\//g, '\\').toLowerCase();
  }
  return resolved;
}

function isUnderRoot(rootNorm: string, targetNorm: string): boolean {
  if (targetNorm === rootNorm) return true;
  const sep = process.platform === 'win32' ? '\\' : path.sep;
  return targetNorm.startsWith(rootNorm + sep);
}

/**
 * Garante que `resolved` está sob `root` (prefixo realpath quando possível).
 */
export function assertWithinRoot(root: string, resolved: string): void {
  if (isUncPath(root)) {
    throw new PathEscapeError('Path escape: UNC paths are not allowed as root');
  }

  const rootNorm = normalizeForPrefixCheck(root);
  const targetNorm = normalizeForPrefixCheck(resolved);

  if (!isUnderRoot(rootNorm, targetNorm)) {
    throw new PathEscapeError(PATH_ESCAPE_MESSAGE);
  }
}

/**
 * Junta root + segmentos relativos e valida confinamento.
 */
export function resolveSafePath(root: string, ...segments: string[]): string {
  if (isUncPath(root)) {
    throw new PathEscapeError('Path escape: UNC paths are not allowed as root');
  }

  for (const segment of segments) {
    const norm = path.posix.normalize(segment.replace(/\\/g, '/'));
    if (norm === '..' || norm.startsWith('../') || norm.includes('/../')) {
      throw new PathEscapeError(PATH_ESCAPE_MESSAGE);
    }
    assertRelativeSafe(segment);
  }

  const resolved = path.resolve(root, ...segments);
  assertWithinRoot(root, resolved);
  return resolved;
}
