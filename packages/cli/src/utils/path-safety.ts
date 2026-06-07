import path from 'node:path';

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
