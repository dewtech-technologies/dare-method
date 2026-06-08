import { assertRelativeSafe, PathEscapeError } from '../utils/path-safety.js';
import type { SteeringFile, SteeringResolution } from './types.js';

/** Resolve o steering aplicável a um arquivo, por precedência determinística (RF-07/A-6). */
export function resolveSteeringForFile(
  files: readonly SteeringFile[],
  relFile: string,
): SteeringResolution {
  assertSafeOrThrow(relFile);
  const target = relFile.replace(/\\/g, '/');

  const applicable = files.filter((f) => {
    if (f.isBase) return true;
    if (f.frontMatter.scope === 'project') return true;
    return f.frontMatter.glob ? globMatches(f.frontMatter.glob, target) : false;
  });

  const blocks = sortSteeringByPrecedence(applicable);

  return {
    file: target,
    blocks,
    resolvedAt: new Date().toISOString(),
  };
}

function assertSafeOrThrow(relFile: string): void {
  try {
    assertRelativeSafe(relFile);
  } catch {
    throw new PathEscapeError();
  }
}

function globToRegExp(glob: string): RegExp {
  const norm = glob.replace(/\\/g, '/');
  const escaped = norm.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = escaped
    .replace(/\*\*\/?/g, '§§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§§/g, '.*');
  return new RegExp(`^${body}$`);
}

function globMatches(glob: string, relFile: string): boolean {
  return globToRegExp(glob).test(relFile.replace(/\\/g, '/'));
}

function bucketOf(file: SteeringFile): 0 | 1 | 2 {
  if (file.isBase) return 0;
  return file.frontMatter.scope === 'glob' ? 2 : 1;
}

/** Ordenação determinística compartilhada por list/show (A-6). */
export function sortSteeringByPrecedence(
  files: readonly SteeringFile[],
): SteeringFile[] {
  return [...files].sort((a, b) => {
    const ba = bucketOf(a);
    const bb = bucketOf(b);
    if (ba !== bb) return ba - bb;
    const pa = a.frontMatter.priority ?? 0;
    const pb = b.frontMatter.priority ?? 0;
    if (pa !== pb) return pa - pb;
    return a.path.localeCompare(b.path);
  });
}
