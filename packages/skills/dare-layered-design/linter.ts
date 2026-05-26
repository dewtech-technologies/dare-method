/**
 * dare-layered-design — LayeredDesignLinter
 * Static analysis: detects Handler → Repository direct calls (violation of layered design).
 * License: MIT
 */

import fs from 'fs';
import path from 'path';
import { Language, LinterViolation, LinterResult } from './types.js';

/**
 * Per-language rules for detecting Handler→Repository violations.
 *
 * Each rule defines:
 * - `handlerDirs`: directories that contain handlers/controllers
 * - `handlerFilePattern`: regex to identify handler files by name
 * - `repositoryImportPattern`: regex that detects a Repository import/use in handler files
 * - `repositoryUsagePattern`: regex that detects direct Repository instantiation or call
 */
interface LanguageRule {
  language: Language;
  extensions: string[];
  /** Dirs relative to projectPath/srcPath where handlers live */
  handlerDirs: string[];
  /** Pattern matching handler file names */
  handlerFilePattern: RegExp;
  /**
   * Patterns that, if found in a handler file, indicate a direct Repository reference.
   * Each match = one violation (checked line-by-line).
   */
  violationPatterns: Array<{
    pattern: RegExp;
    message: string;
  }>;
}

const LANGUAGE_RULES: LanguageRule[] = [
  // ── TypeScript / JavaScript ─────────────────────────────────────────────────
  {
    language: 'typescript',
    extensions: ['.ts', '.tsx'],
    handlerDirs: ['handlers', 'controllers', 'routes', 'router'],
    handlerFilePattern: /handler|controller|route/i,
    violationPatterns: [
      {
        pattern: /import\s+.*Repository/,
        message:
          'Handler imports Repository directly. Use a Service instead (Handler → Service → Repository).',
      },
      {
        pattern: /new\s+\w+Repository\s*\(/,
        message:
          'Handler instantiates Repository directly. Inject a Service instead.',
      },
      {
        pattern: /\w+Repository\.\w+\s*\(/,
        message:
          'Handler calls Repository method directly. Delegate to a Service.',
      },
    ],
  },
  {
    language: 'javascript',
    extensions: ['.js', '.mjs'],
    handlerDirs: ['handlers', 'controllers', 'routes', 'router'],
    handlerFilePattern: /handler|controller|route/i,
    violationPatterns: [
      {
        pattern: /require\s*\(\s*['"].*[Rr]epository/,
        message: 'Handler requires Repository directly. Use a Service instead.',
      },
      {
        pattern: /import\s+.*Repository/,
        message: 'Handler imports Repository directly. Use a Service instead.',
      },
      {
        pattern: /new\s+\w+Repository\s*\(/,
        message: 'Handler instantiates Repository directly.',
      },
      {
        pattern: /\w+Repository\.\w+\s*\(/,
        message: 'Handler calls Repository method directly. Delegate to a Service.',
      },
    ],
  },
  // ── Ruby ────────────────────────────────────────────────────────────────────
  {
    language: 'ruby',
    extensions: ['.rb'],
    handlerDirs: ['app/handlers', 'app/controllers'],
    handlerFilePattern: /handler|controller/i,
    violationPatterns: [
      {
        pattern: /Repository\./,
        message: 'Handler calls Repository directly. Route through a Service.',
      },
      {
        pattern: /Repository\.new/,
        message: 'Handler instantiates Repository directly.',
      },
      {
        pattern: /\w+Repository\.find|\.create|\.save|\.update|\.destroy/,
        message: 'Handler calls Repository data method directly.',
      },
    ],
  },
  // ── Rust ────────────────────────────────────────────────────────────────────
  {
    language: 'rust',
    extensions: ['.rs'],
    handlerDirs: ['handlers', 'routes', 'api'],
    handlerFilePattern: /handler|controller|route/i,
    violationPatterns: [
      {
        pattern: /use\s+crate::(db|repository|repositories)::/,
        message: 'Handler imports from repository/db module. Use a Service layer instead.',
      },
      {
        pattern: /\w+Repository\s*::\s*new/,
        message: 'Handler instantiates Repository directly.',
      },
      {
        pattern: /\w+_repo\.\w+\s*\(/,
        message: 'Handler calls repository method directly. Delegate to a service.',
      },
    ],
  },
  // ── Python ──────────────────────────────────────────────────────────────────
  {
    language: 'python',
    extensions: ['.py'],
    handlerDirs: ['handlers', 'controllers', 'routes', 'api', 'views'],
    handlerFilePattern: /handler|controller|route|view/i,
    violationPatterns: [
      {
        pattern: /from\s+.*repository.*\s+import|import\s+.*Repository/i,
        message: 'Handler imports Repository directly. Use a Service instead.',
      },
      {
        pattern: /Repository\(\)/,
        message: 'Handler instantiates Repository directly.',
      },
      {
        pattern: /\w+_repository\.\w+\s*\(/,
        message: 'Handler calls repository method directly.',
      },
    ],
  },
  // ── Go ──────────────────────────────────────────────────────────────────────
  {
    language: 'go',
    extensions: ['.go'],
    handlerDirs: ['handlers', 'api', 'http', 'controller'],
    handlerFilePattern: /handler|controller/i,
    violationPatterns: [
      {
        pattern: /repository\.\w+/,
        message: 'Handler accesses repository package directly. Use a service layer.',
      },
      {
        pattern: /New\w*Repository\s*\(/,
        message: 'Handler instantiates Repository directly.',
      },
    ],
  },
  // ── PHP ─────────────────────────────────────────────────────────────────────
  {
    language: 'php',
    extensions: ['.php'],
    handlerDirs: ['app/Http/Controllers', 'handlers', 'controllers'],
    handlerFilePattern: /Handler|Controller/i,
    violationPatterns: [
      {
        pattern: /use\s+\w+\\Repositories\\/,
        message: 'Handler imports Repository namespace directly. Use a Service.',
      },
      {
        pattern: /new\s+\w+Repository\s*\(/,
        message: 'Handler instantiates Repository directly.',
      },
      {
        pattern: /\$\w+Repository->/,
        message: 'Handler accesses repository object directly.',
      },
    ],
  },
];

export class LayeredDesignLinter {
  private readonly maxDepth: number;

  constructor(maxDepth = 6) {
    this.maxDepth = maxDepth;
  }

  /**
   * Lints a project directory for Handler→Repository violations.
   *
   * Detects language automatically or uses provided language.
   * Scans all handler files in the project and checks for Repository imports/calls.
   *
   * @param projectPath - Absolute path to the project root.
   * @param language - Optional language override (default: auto-detect).
   * @returns LinterResult with violations and metadata.
   */
  lint(projectPath: string, language?: Language): LinterResult {
    const detectedLanguage = language ?? detectLanguage(projectPath);
    const rules = LANGUAGE_RULES.filter(
      (r) => r.language === detectedLanguage || detectedLanguage === 'unknown'
    );

    // If unknown language, use all rules
    const effectiveRules = rules.length > 0 ? rules : LANGUAGE_RULES;

    const violations: LinterViolation[] = [];
    let filesScanned = 0;

    for (const rule of effectiveRules) {
      const handlerFiles = this.findHandlerFiles(projectPath, rule);
      filesScanned += handlerFiles.length;

      for (const file of handlerFiles) {
        const fileViolations = this.checkFile(file, rule);
        violations.push(...fileViolations);
      }
    }

    return {
      violations,
      filesScanned,
      pass: violations.length === 0,
    };
  }

  /**
   * Lints a single file against all applicable rules.
   * Useful for editor integrations and CI checks on specific files.
   */
  lintFile(filePath: string, language?: Language): LinterResult {
    const ext = path.extname(filePath);
    const detectedLanguage = language ?? extensionToLanguage(ext);

    const rules = LANGUAGE_RULES.filter(
      (r) => r.language === detectedLanguage
    );

    const violations: LinterViolation[] = [];

    for (const rule of rules) {
      // Only check handler files
      if (!isHandlerFile(filePath, rule)) continue;
      violations.push(...this.checkFile(filePath, rule));
    }

    return {
      violations,
      filesScanned: 1,
      pass: violations.length === 0,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private findHandlerFiles(projectPath: string, rule: LanguageRule): string[] {
    const results: string[] = [];

    // Search in designated handler directories
    for (const handlerDir of rule.handlerDirs) {
      const dirPath = path.join(projectPath, handlerDir);
      if (fs.existsSync(dirPath)) {
        this.collectFiles(dirPath, rule.extensions, results, 0);
      }

      // Also search within src/, app/, lib/
      for (const srcRoot of ['src', 'app', 'lib']) {
        const nestedDir = path.join(projectPath, srcRoot, handlerDir);
        if (fs.existsSync(nestedDir)) {
          this.collectFiles(nestedDir, rule.extensions, results, 0);
        }
      }
    }

    // Also find files with handler patterns in top-level source dirs
    for (const srcRoot of ['src', 'app', 'lib', 'cmd']) {
      const srcPath = path.join(projectPath, srcRoot);
      if (fs.existsSync(srcPath)) {
        this.collectHandlerFilesByName(srcPath, rule, results, 0);
      }
    }

    // Deduplicate
    return [...new Set(results)];
  }

  private collectFiles(
    dir: string,
    extensions: string[],
    results: string[],
    depth: number
  ): void {
    if (depth > this.maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.collectFiles(fullPath, extensions, results, depth + 1);
      } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
        results.push(fullPath);
      }
    }
  }

  private collectHandlerFilesByName(
    dir: string,
    rule: LanguageRule,
    results: string[],
    depth: number
  ): void {
    if (depth > this.maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.collectHandlerFilesByName(fullPath, rule, results, depth + 1);
      } else if (
        entry.isFile() &&
        rule.extensions.includes(path.extname(entry.name)) &&
        rule.handlerFilePattern.test(entry.name)
      ) {
        results.push(fullPath);
      }
    }
  }

  private checkFile(filePath: string, rule: LanguageRule): LinterViolation[] {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return [];
    }

    const violations: LinterViolation[] = [];
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Skip comments
      const trimmed = line.trim();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*')
      ) {
        continue;
      }

      for (const { pattern, message } of rule.violationPatterns) {
        if (pattern.test(line)) {
          violations.push({
            file: filePath,
            line: lineNum + 1,
            content: line.trim(),
            rule: `handler-repository-direct-call`,
            message,
          });
          break; // one violation per line
        }
      }
    }

    return violations;
  }
}

// ── Utility functions ────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules',
  'target',
  'dist',
  '.git',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'coverage',
  '.cache',
]);

function isHandlerFile(filePath: string, rule: LanguageRule): boolean {
  return rule.handlerFilePattern.test(path.basename(filePath));
}

function extensionToLanguage(ext: string): Language {
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.rb':
      return 'ruby';
    case '.rs':
      return 'rust';
    case '.py':
      return 'python';
    case '.go':
      return 'go';
    case '.php':
      return 'php';
    default:
      return 'unknown';
  }
}

function detectLanguage(projectPath: string): Language {
  const indicators: Array<[string, Language]> = [
    ['tsconfig.json', 'typescript'],
    ['package.json', 'javascript'], // checked after tsconfig
    ['Gemfile', 'ruby'],
    ['Cargo.toml', 'rust'],
    ['requirements.txt', 'python'],
    ['pyproject.toml', 'python'],
    ['go.mod', 'go'],
    ['composer.json', 'php'],
  ];

  for (const [file, lang] of indicators) {
    if (fs.existsSync(path.join(projectPath, file))) {
      // For package.json, check if tsconfig also exists (TypeScript wins)
      if (lang === 'javascript' && fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
        return 'typescript';
      }
      return lang;
    }
  }

  return 'unknown';
}
