import path from 'node:path';
import { assertWithinRoot, PathEscapeError } from '../utils/path-safety.js';

export const PROJECT_NAME_RE = /^[a-z0-9-_]+$/;

export type ValidateProjectNameResult =
  | { readonly ok: true; readonly sanitized: string }
  | { readonly ok: false; readonly error: string };

const CWD_ESCAPE_MSG =
  'Error: project directory must stay inside the current working directory';

function simpleNameError(name: string): string {
  return `Error: project name must be a simple directory name under the current folder (got '${name}')`;
}

function regexNameError(name: string): string {
  return `Error: project name may only contain lowercase letters, numbers, hyphens and underscores (got '${name}')`;
}

function nameHasTraversal(name: string): boolean {
  const norm = path.posix.normalize(name.replace(/\\/g, '/'));
  return norm === '..' || norm.startsWith('../') || norm.includes('/../') || norm.endsWith('/..');
}

/**
 * Valida nome de projeto (paridade interativo + --non-interactive).
 */
export function validateProjectName(name: string): ValidateProjectNameResult {
  if (name === '.' || name === '..') {
    return { ok: false, error: simpleNameError(name) };
  }

  if (path.isAbsolute(name) || nameHasTraversal(name)) {
    return { ok: false, error: simpleNameError(name) };
  }

  const trimmed = name.trim();
  if (!trimmed || !PROJECT_NAME_RE.test(trimmed)) {
    return { ok: false, error: regexNameError(name) };
  }

  return { ok: true, sanitized: trimmed };
}

/**
 * Garante que `targetDir` permanece sob `cwd`.
 */
export function assertWithinCwd(cwd: string, targetDir: string): void {
  try {
    assertWithinRoot(path.resolve(cwd), path.resolve(targetDir));
  } catch (err) {
    if (err instanceof PathEscapeError) {
      throw new Error(CWD_ESCAPE_MSG);
    }
    throw err;
  }
}

/**
 * Resolve outputDir = path.resolve(cwd, name) e valida confinamento sob cwd.
 * `name` deve ter passado por {@link validateProjectName} antes.
 */
export function resolveProjectOutputDir(cwd: string, name: string): string {
  const outputDir = path.resolve(cwd, name);
  assertWithinCwd(cwd, outputDir);
  return outputDir;
}
