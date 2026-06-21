/**
 * dare-frontend-design — FrontendLinter
 * Detects DARE frontend antipatterns in .tsx and .vue files.
 *
 * Rules:
 *   component-too-large  — component file > 300 lines
 *   fetch-in-jsx         — fetch() or axios. used directly in JSX/template
 *                          (outside custom hooks/composables)
 *
 * License: MIT
 */

import fs from 'fs';
import path from 'path';
import type { LinterViolation, LinterResult } from './types.js';

const COMPONENT_MAX_LINES = 300;

/** File extensions treated as frontend component files */
const COMPONENT_EXTENSIONS = new Set(['.tsx', '.vue']);

/**
 * Patterns that indicate a fetch/axios call is inside a hook or composable
 * (e.g. the function name starts with "use").
 * We detect this via function scope heuristic.
 */
const HOOK_PATTERN = /function\s+use[A-Z]/;
const COMPOSABLE_PATTERN = /(?:export\s+(?:default\s+)?)?(?:const|function)\s+use[A-Z]/;

export class FrontendLinter {
  /**
   * Lint a single file and return any violations found.
   */
  lintFile(filePath: string): LinterViolation[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const violations: LinterViolation[] = [];

    const ext = path.extname(filePath);
    if (!COMPONENT_EXTENSIONS.has(ext)) {
      return [];
    }

    // Rule 1: component-too-large
    if (lines.length > COMPONENT_MAX_LINES) {
      violations.push({
        file: filePath,
        line: 1,
        rule: 'component-too-large',
        message: `Component has ${lines.length} lines (max ${COMPONENT_MAX_LINES}). Split into smaller components.`,
        severity: 'error',
      });
    }

    // Rule 2: fetch-in-jsx — detect fetch() or axios. outside hooks/composables
    const fetchViolations = detectInlineFetch(filePath, lines);
    violations.push(...fetchViolations);

    return violations;
  }

  /**
   * Lint all .tsx and .vue files under a directory (recursively).
   */
  lintDirectory(dirPath: string): LinterResult {
    if (!fs.existsSync(dirPath)) {
      return { violations: [], filesChecked: 0, pass: true };
    }

    const files = collectComponentFiles(dirPath);
    const violations: LinterViolation[] = [];

    for (const file of files) {
      violations.push(...this.lintFile(file));
    }

    return {
      violations,
      filesChecked: files.length,
      pass: violations.filter((v) => v.severity === 'error').length === 0,
    };
  }

  /**
   * Lint a list of specific files.
   */
  lintFiles(filePaths: string[]): LinterResult {
    const violations: LinterViolation[] = [];
    let filesChecked = 0;

    for (const filePath of filePaths) {
      const ext = path.extname(filePath);
      if (!COMPONENT_EXTENSIONS.has(ext)) continue;
      filesChecked++;
      violations.push(...this.lintFile(filePath));
    }

    return {
      violations,
      filesChecked,
      pass: violations.filter((v) => v.severity === 'error').length === 0,
    };
  }
}

/**
 * Collect all .tsx and .vue files in a directory tree.
 */
function collectComponentFiles(dirPath: string): string[] {
  const results: string[] = [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectComponentFiles(fullPath));
    } else if (COMPONENT_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Detect fetch() or axios. calls that appear directly in JSX/template context
 * (i.e., NOT inside a function named useXxx).
 */
function detectInlineFetch(filePath: string, lines: string[]): LinterViolation[] {
  const violations: LinterViolation[] = [];
  const ext = path.extname(filePath);

  // Inline fetch pattern: fetch( or axios. appearing in JSX/return context
  const FETCH_REGEX = /\bfetch\s*\(|axios\./;

  // Track scope: are we inside a hook/composable function?
  // Simple heuristic: scan for useXxx function declarations above each match.
  const content = lines.join('\n');
  const inHookOrComposable = HOOK_PATTERN.test(content) || COMPOSABLE_PATTERN.test(content);

  // For Vue files, the <script setup> with composable is considered safe if
  // the file itself is a composable (useXxx naming).
  const filename = path.basename(filePath, path.extname(filePath));
  const isHookFile = /^use[A-Z]/.test(filename);

  if (inHookOrComposable || isHookFile) {
    // The file itself is a hook/composable — fetch calls are expected
    return [];
  }

  // Scan each line for direct fetch/axios usage outside of function blocks
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    if (FETCH_REGEX.test(line)) {
      // Check if this line is inside a local function named useXxx
      // by scanning backwards for the enclosing function signature
      const context = lines.slice(Math.max(0, i - 20), i + 1).join('\n');
      const inLocalHook = HOOK_PATTERN.test(context) || COMPOSABLE_PATTERN.test(context);

      if (!inLocalHook) {
        // Additional check: is this in a .tsx return block or template?
        const isInReturn = isInJSXOrTemplate(lines, i, ext);
        if (isInReturn) {
          violations.push({
            file: filePath,
            line: i + 1,
            rule: 'fetch-in-jsx',
            message: `Direct fetch() or axios. call found outside custom hook/composable at line ${i + 1}. Move to useXxx hook or composable.`,
            severity: 'error',
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Heuristic: is line i inside a JSX/template context (not in a hook)?
 * We check if:
 * - For .tsx: the line is inside a return() block of a component function (not a useXxx)
 * - For .vue: the line is in <template> or <script setup> (non-composable)
 */
function isInJSXOrTemplate(lines: string[], lineIdx: number, ext: string): boolean {
  const line = lines[lineIdx];

  if (ext === '.vue') {
    // Check if we are in <template> section
    let inTemplate = false;
    for (let i = 0; i <= lineIdx; i++) {
      const l = lines[i].trim();
      if (l === '<template>' || l.startsWith('<template')) inTemplate = true;
      if (l === '</template>') inTemplate = false;
    }
    if (inTemplate) return true;

    // In <script setup> directly (not in composable)
    let inScript = false;
    for (let i = 0; i <= lineIdx; i++) {
      const l = lines[i].trim();
      if (l.startsWith('<script')) inScript = true;
      if (l === '</script>') inScript = false;
    }
    return inScript;
  }

  // .tsx: check if the fetch is in any non-hook function
  // Simple: if any nearby context has JSX (<, />, return (
  const context = lines.slice(Math.max(0, lineIdx - 5), lineIdx + 5).join('\n');
  const hasJSX = /<[A-Z]|<\/|jsx|return\s*\(/.test(context);

  // Also flag if fetch appears as a direct statement (not in arrow fn named useXxx)
  const isDirectStatement = /^\s*(const|let|var)?\s*(await\s+)?fetch\s*\(|^\s*(const|let|var)\s+\w+\s*=\s*(await\s+)?fetch\s*\(/.test(line);

  return hasJSX || isDirectStatement;
}
