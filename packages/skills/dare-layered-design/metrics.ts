/**
 * dare-layered-design — LayeredDesignMetrics
 * Collects M-01 to M-04 metrics for a project.
 * License: MIT
 */

import fs from 'fs';
import path from 'path';
import { MetricResult } from './types.js';
import { LayeredDesignLinter } from './linter.js';

export class LayeredDesignMetrics {
  private readonly linter: LayeredDesignLinter;

  constructor() {
    this.linter = new LayeredDesignLinter();
  }

  /**
   * Collects all four layered-design metrics.
   */
  collect(projectPath: string): MetricResult[] {
    return [
      this.collectM01(projectPath),
      this.collectM02(projectPath),
      this.collectM03(projectPath),
      this.collectM04(projectPath),
    ];
  }

  /**
   * M-01: Services have unit tests (test files exist for services).
   * Checks that every service file has a corresponding test file.
   */
  collectM01(projectPath: string): MetricResult {
    const serviceFiles = findServiceFiles(projectPath);

    if (serviceFiles.length === 0) {
      return {
        id: 'M-01',
        pass: false,
        description: '100% of Services have unit tests',
        detail: 'No service files found in services/ directories. Create services first.',
      };
    }

    const servicesWithoutTests: string[] = [];

    for (const serviceFile of serviceFiles) {
      if (!hasTestFile(serviceFile, projectPath)) {
        servicesWithoutTests.push(path.relative(projectPath, serviceFile));
      }
    }

    if (servicesWithoutTests.length > 0) {
      return {
        id: 'M-01',
        pass: false,
        description: '100% of Services have unit tests',
        detail:
          `${servicesWithoutTests.length} service(s) have no corresponding test file: ` +
          servicesWithoutTests.slice(0, 5).join(', ') +
          (servicesWithoutTests.length > 5 ? ` ... (${servicesWithoutTests.length - 5} more)` : ''),
      };
    }

    return {
      id: 'M-01',
      pass: true,
      description: '100% of Services have unit tests',
      detail: `All ${serviceFiles.length} service file(s) have corresponding test files.`,
    };
  }

  /**
   * M-02: 0% Handler→Repository direct calls.
   * Uses the LayeredDesignLinter to detect violations.
   */
  collectM02(projectPath: string): MetricResult {
    const result = this.linter.lint(projectPath);

    if (result.filesScanned === 0) {
      return {
        id: 'M-02',
        pass: true,
        description: '0% Handler→Repository direct calls',
        detail: 'No handler files found to scan.',
      };
    }

    if (result.violations.length > 0) {
      const summary = result.violations
        .slice(0, 3)
        .map(
          (v) =>
            `${path.relative(projectPath, v.file)}:${v.line} — ${v.message}`
        )
        .join('; ');

      return {
        id: 'M-02',
        pass: false,
        description: '0% Handler→Repository direct calls',
        detail:
          `Found ${result.violations.length} violation(s) in ${result.filesScanned} handler files scanned. ` +
          `First violations: ${summary}`,
      };
    }

    return {
      id: 'M-02',
      pass: true,
      description: '0% Handler→Repository direct calls',
      detail: `No violations found across ${result.filesScanned} handler file(s) scanned.`,
    };
  }

  /**
   * M-03: 100% of Handlers use dependency injection (no `new Service()` inside handlers).
   * Checks handler files for direct service instantiation.
   */
  collectM03(projectPath: string): MetricResult {
    const handlerDirs = findLayerDirs(projectPath, ['handlers', 'controllers']);

    if (handlerDirs.length === 0) {
      return {
        id: 'M-03',
        pass: true,
        description: '100% of Handlers use dependency injection',
        detail: 'No handler directories found.',
      };
    }

    const violations: Array<{ file: string; line: number; content: string }> = [];

    for (const dir of handlerDirs) {
      const files = collectFilesRecursive(dir, ['.ts', '.js', '.rb', '.rs', '.py', '.go', '.php'], 4);
      for (const file of files) {
        findDIViolations(file, violations);
      }
    }

    if (violations.length > 0) {
      const summary = violations
        .slice(0, 3)
        .map((v) => `${path.relative(projectPath, v.file)}:${v.line}`)
        .join(', ');
      return {
        id: 'M-03',
        pass: false,
        description: '100% of Handlers use dependency injection',
        detail: `Found ${violations.length} handler(s) that instantiate services directly (e.g., new XService()). Violations: ${summary}. Use constructor injection instead.`,
      };
    }

    const totalFiles = handlerDirs.reduce(
      (sum, d) => sum + collectFilesRecursive(d, ['.ts', '.js', '.rb', '.rs', '.py', '.go'], 4).length,
      0
    );

    return {
      id: 'M-03',
      pass: true,
      description: '100% of Handlers use dependency injection',
      detail: `No direct service instantiation found in ${totalFiles} handler file(s).`,
    };
  }

  /**
   * M-04: 100% of Repositories are agnostic to upper layers.
   * Checks repository files for HTTP-specific code (status codes, response objects).
   */
  collectM04(projectPath: string): MetricResult {
    const repoDirs = findLayerDirs(projectPath, ['repositories', 'repos', 'data_access']);

    if (repoDirs.length === 0) {
      return {
        id: 'M-04',
        pass: true,
        description: '100% of Repositories are agnostic to upper layers',
        detail: 'No repository directories found.',
      };
    }

    const violations: Array<{ file: string; line: number; content: string }> = [];

    for (const dir of repoDirs) {
      const files = collectFilesRecursive(dir, ['.ts', '.js', '.rb', '.rs', '.py', '.go', '.php'], 4);
      for (const file of files) {
        findHTTPInRepoViolations(file, violations);
      }
    }

    if (violations.length > 0) {
      const summary = violations
        .slice(0, 3)
        .map((v) => `${path.relative(projectPath, v.file)}:${v.line} — "${v.content.slice(0, 60)}"`)
        .join('; ');
      return {
        id: 'M-04',
        pass: false,
        description: '100% of Repositories are agnostic to upper layers',
        detail: `Found ${violations.length} HTTP concern(s) in repository files. Repositories must not return HTTP status codes or DTOs. Violations: ${summary}`,
      };
    }

    return {
      id: 'M-04',
      pass: true,
      description: '100% of Repositories are agnostic to upper layers',
      detail: 'No HTTP concerns found in repository files.',
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', '.git', 'vendor', '__pycache__', 'coverage']);

/** Patterns that indicate direct service instantiation in a handler (DI violation) */
const DI_VIOLATION_PATTERNS: RegExp[] = [
  /new\s+\w+Service\s*\(/,
  /new\s+\w+UseCase\s*\(/,
  /new\s+Create\w+\s*\(/,
  /new\s+Update\w+\s*\(/,
  /new\s+Delete\w+\s*\(/,
  /\w+Service\.new\b/,      // Ruby style
  /\w+UseCase\.new\b/,      // Ruby style
];

/** Patterns that indicate HTTP knowledge inside a repository (layer violation) */
const HTTP_IN_REPO_PATTERNS: RegExp[] = [
  /status\s*[:=]\s*[45]\d\d/,          // status: 404, status = 500
  /http_status|httpStatus|HttpStatus/i,
  /res\.status\s*\(/,                   // res.status(404)
  /raise\s+.*NotFound.*Error.*HTTP/i,  // raise HTTP::NotFoundError
  /NotFoundException.*\(\s*[45]\d\d/,  // NotFoundException(404)
  /render\s+json.*status:/i,            // Rails: render json: ..., status:
  /Response\.\w+\(\s*[45]\d\d/,        // Response.notFound(404)
  /throw new HttpException/i,           // NestJS
];

function findServiceFiles(projectPath: string): string[] {
  const dirs = findLayerDirs(projectPath, ['services', 'use_cases', 'interactors', 'commands']);
  const results: string[] = [];
  const extensions = ['.ts', '.js', '.rb', '.rs', '.py', '.go', '.php'];

  for (const dir of dirs) {
    collectFilesRecursive(dir, extensions, 4).forEach((f) => {
      // Exclude test files
      if (!isTestFile(f)) results.push(f);
    });
  }

  return results;
}

function findLayerDirs(projectPath: string, layerNames: string[]): string[] {
  const results: string[] = [];
  const searchRoots = [projectPath, ...['src', 'app', 'lib'].map((r) => path.join(projectPath, r))];

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    for (const name of layerNames) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate)) results.push(candidate);
    }
  }

  return results;
}

function collectFilesRecursive(dir: string, extensions: string[], maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(fp, extensions, maxDepth, depth + 1));
    } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
      results.push(fp);
    }
  }
  return results;
}

function hasTestFile(serviceFile: string, projectPath: string): boolean {
  const basename = path.basename(serviceFile, path.extname(serviceFile));
  const ext = path.extname(serviceFile);

  // Possible test file patterns
  const testPatterns = [
    `${basename}.spec${ext}`,
    `${basename}.test${ext}`,
    `${basename}_spec${ext}`,
    `${basename}_test${ext}`,
    `test_${basename}${ext}`,
  ];

  // Search in common test directories
  const testRoots = [
    path.join(projectPath, 'tests'),
    path.join(projectPath, 'test'),
    path.join(projectPath, 'spec'),
    path.join(projectPath, '__tests__'),
    path.join(projectPath, 'src', '__tests__'),
    path.dirname(serviceFile), // Co-located tests
  ];

  for (const testRoot of testRoots) {
    if (!fs.existsSync(testRoot)) continue;
    for (const pattern of testPatterns) {
      const candidate = path.join(testRoot, pattern);
      if (fs.existsSync(candidate)) return true;
    }
    // Also search recursively for the test file
    const found = findFileByName(testRoot, testPatterns, 4);
    if (found) return true;
  }

  return false;
}

function findFileByName(dir: string, names: string[], maxDepth: number, depth = 0): string | null {
  if (depth > maxDepth) return null;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const fp = path.join(dir, entry.name);
    if (entry.isFile() && names.includes(entry.name)) return fp;
    if (entry.isDirectory()) {
      const found = findFileByName(fp, names, maxDepth, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function isTestFile(file: string): boolean {
  return /\.(spec|test)\.[a-z]+$/.test(file) || /_spec\.[a-z]+$/.test(file) || /_test\.[a-z]+$/.test(file);
}

function findDIViolations(
  file: string,
  out: Array<{ file: string; line: number; content: string }>
): void {
  let content: string;
  try {
    content = fs.readFileSync(file, 'utf-8');
  } catch {
    return;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) continue;

    for (const pattern of DI_VIOLATION_PATTERNS) {
      if (pattern.test(line)) {
        out.push({ file, line: i + 1, content: trimmed });
        break;
      }
    }
  }
}

function findHTTPInRepoViolations(
  file: string,
  out: Array<{ file: string; line: number; content: string }>
): void {
  let content: string;
  try {
    content = fs.readFileSync(file, 'utf-8');
  } catch {
    return;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) continue;

    for (const pattern of HTTP_IN_REPO_PATTERNS) {
      if (pattern.test(line)) {
        out.push({ file, line: i + 1, content: trimmed });
        break;
      }
    }
  }
}
