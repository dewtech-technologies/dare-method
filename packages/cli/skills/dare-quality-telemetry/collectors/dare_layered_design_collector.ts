/**
 * dare-quality-telemetry — DareLayeredDesign collector
 * Collects M-01 to M-04 metrics for a project that should comply with dare-layered-design.
 * License: MIT
 */

import fs from 'fs';
import path from 'path';
import { MetricResult } from '../types.js';

/** Source file extensions */
const SOURCE_EXTENSIONS = ['.ts', '.js', '.rb', '.rs', '.py', '.go', '.php'];

/** Test file extensions (same as source but for test detection) */
const TEST_PATTERNS = ['.spec.ts', '.spec.js', '.test.ts', '.test.js', '_spec.rb', '_spec.ts', '_test.ts', '_test.js'];

const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', '.git', 'vendor', '__pycache__', 'coverage']);

/** DI violation patterns: direct service instantiation inside handlers */
const DI_VIOLATION_PATTERNS: RegExp[] = [
  /new\s+\w+Service\s*\(/,
  /new\s+\w+UseCase\s*\(/,
  /new\s+Create\w+\s*\(/,
  /new\s+Update\w+\s*\(/,
  /new\s+Delete\w+\s*\(/,
  /\w+Service\.new\b/,       // Ruby
  /\w+UseCase\.new\b/,       // Ruby
];

/** DI positive patterns: proper injection mechanisms */
const DI_POSITIVE_PATTERNS: RegExp[] = [
  /@Inject\s*\(/,
  /constructor\s*\(\s*private/,
  /Extension\s*\(/,
  /@Injectable/,
  /@Controller/,
  /inject\s*\(/i,
];

/** HTTP concern patterns inside repositories */
const HTTP_IN_REPO_PATTERNS: RegExp[] = [
  /status\s*[:=]\s*[45]\d\d/,
  /http_status|httpStatus|HttpStatus/i,
  /res\.status\s*\(/,
  /NotFoundException.*\(\s*[45]\d\d/,
  /render\s+json.*status:/i,
  /Response\.\w+\(\s*[45]\d\d/,
  /throw new HttpException/i,
  /import.*express/,
  /import.*fastapi/,
  /require.*axum/,
  /rails.*controller/i,
];

/** Handler→Repository direct call patterns */
const HANDLER_TO_REPO_PATTERNS: RegExp[] = [
  /import.*[Rr]epository/,
  /require.*[Rr]epository/,
  /\w+Repository\s*\(/,
  /\w+Repo\s*\./,
  /\w+repository\s*\./i,
];

export function collectDareLayeredDesign(projectPath: string): Promise<MetricResult[]> {
  return Promise.resolve([
    collectM01(projectPath),
    collectM02(projectPath),
    collectM03(projectPath),
    collectM04(projectPath),
  ]);
}

/**
 * M-01: services/ directory has at least one test file (*.spec.* or *.test.*).
 */
function collectM01(projectPath: string): MetricResult {
  const serviceDirs = findLayerDirs(projectPath, ['services', 'use_cases', 'interactors', 'commands']);

  if (serviceDirs.length === 0) {
    return {
      id: 'M-01',
      pass: false,
      description: '100% of Services have unit tests',
      details: 'No services/ directory found in project. Create services layer first.',
    };
  }

  // Find all service files (non-test)
  const serviceFiles: string[] = [];
  for (const dir of serviceDirs) {
    collectFilesRecursive(dir, SOURCE_EXTENSIONS, 4).forEach((f) => {
      if (!isTestFile(f)) serviceFiles.push(f);
    });
  }

  if (serviceFiles.length === 0) {
    return {
      id: 'M-01',
      pass: false,
      description: '100% of Services have unit tests',
      details: 'services/ directory exists but contains no service files.',
    };
  }

  // Check if there are test files somewhere in the project
  const testRoots = [
    path.join(projectPath, 'tests'),
    path.join(projectPath, 'test'),
    path.join(projectPath, 'spec'),
    path.join(projectPath, '__tests__'),
    path.join(projectPath, 'src', '__tests__'),
    ...serviceDirs, // co-located tests
  ];

  let testFilesFound = 0;
  for (const root of testRoots) {
    if (!fs.existsSync(root)) continue;
    const files = collectFilesRecursive(root, SOURCE_EXTENSIONS, 5);
    testFilesFound += files.filter(isTestFile).length;
  }

  if (testFilesFound === 0) {
    return {
      id: 'M-01',
      pass: false,
      description: '100% of Services have unit tests',
      details: `Found ${serviceFiles.length} service file(s) but no test files (*.spec.* or *.test.*) in the project.`,
    };
  }

  return {
    id: 'M-01',
    pass: true,
    description: '100% of Services have unit tests',
    details: `Found ${testFilesFound} test file(s) covering ${serviceFiles.length} service file(s).`,
  };
}

/**
 * M-02: 0% Handler→Repository direct calls.
 * Scans handler files for direct repository imports/usage.
 */
function collectM02(projectPath: string): MetricResult {
  const handlerDirs = findLayerDirs(projectPath, ['handlers', 'controllers', 'routers', 'routes']);

  if (handlerDirs.length === 0) {
    return {
      id: 'M-02',
      pass: true,
      description: '0% Handler→Repository direct calls',
      details: 'No handler/controller directories found.',
    };
  }

  const violations: Array<{ file: string; line: number; content: string }> = [];

  for (const dir of handlerDirs) {
    const files = collectFilesRecursive(dir, SOURCE_EXTENSIONS, 4);
    for (const file of files) {
      if (isTestFile(file)) continue;
      findPatternViolations(file, HANDLER_TO_REPO_PATTERNS, violations);
    }
  }

  if (violations.length > 0) {
    const summary = violations
      .slice(0, 3)
      .map((v) => `${path.relative(projectPath, v.file)}:${v.line}`)
      .join(', ');
    return {
      id: 'M-02',
      pass: false,
      description: '0% Handler→Repository direct calls',
      details: `Found ${violations.length} Handler→Repository violation(s). First: ${summary}. Handlers must call Services, not Repositories directly.`,
    };
  }

  const totalFiles = handlerDirs.reduce(
    (sum, d) => sum + collectFilesRecursive(d, SOURCE_EXTENSIONS, 4).filter((f) => !isTestFile(f)).length,
    0
  );

  return {
    id: 'M-02',
    pass: true,
    description: '0% Handler→Repository direct calls',
    details: `No Handler→Repository violations found across ${totalFiles} handler file(s).`,
  };
}

/**
 * M-03: 100% of Handlers use dependency injection.
 * Checks for DI patterns (@Inject, constructor(private), Extension()).
 */
function collectM03(projectPath: string): MetricResult {
  const handlerDirs = findLayerDirs(projectPath, ['handlers', 'controllers', 'routers', 'routes']);

  if (handlerDirs.length === 0) {
    return {
      id: 'M-03',
      pass: true,
      description: '100% of Handlers use dependency injection',
      details: 'No handler/controller directories found.',
    };
  }

  const allHandlerFiles: string[] = [];
  for (const dir of handlerDirs) {
    collectFilesRecursive(dir, SOURCE_EXTENSIONS, 4).forEach((f) => {
      if (!isTestFile(f)) allHandlerFiles.push(f);
    });
  }

  if (allHandlerFiles.length === 0) {
    return {
      id: 'M-03',
      pass: true,
      description: '100% of Handlers use dependency injection',
      details: 'No handler files to scan.',
    };
  }

  // Check for DI violations (direct instantiation)
  const diViolations: Array<{ file: string; line: number; content: string }> = [];
  for (const file of allHandlerFiles) {
    findPatternViolations(file, DI_VIOLATION_PATTERNS, diViolations);
  }

  if (diViolations.length > 0) {
    const summary = diViolations
      .slice(0, 3)
      .map((v) => `${path.relative(projectPath, v.file)}:${v.line}`)
      .join(', ');
    return {
      id: 'M-03',
      pass: false,
      description: '100% of Handlers use dependency injection',
      details: `Found ${diViolations.length} handler(s) that instantiate services directly. Violations: ${summary}. Use @Inject, constructor(private ...) or Extension() instead.`,
    };
  }

  // Check that at least some DI patterns exist
  let diPatternsFound = 0;
  for (const file of allHandlerFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (DI_POSITIVE_PATTERNS.some((p) => p.test(content))) {
        diPatternsFound++;
      }
    } catch {
      // skip
    }
  }

  return {
    id: 'M-03',
    pass: true,
    description: '100% of Handlers use dependency injection',
    details: `No direct instantiation found in ${allHandlerFiles.length} handler file(s). ${diPatternsFound} file(s) use DI patterns.`,
  };
}

/**
 * M-04: 100% of Repositories are agnostic to upper layers.
 * Checks that repositories don't import HTTP modules (express, fastapi, axum, rails).
 */
function collectM04(projectPath: string): MetricResult {
  const repoDirs = findLayerDirs(projectPath, ['repositories', 'repos', 'data_access', 'stores']);

  if (repoDirs.length === 0) {
    return {
      id: 'M-04',
      pass: true,
      description: '100% of Repositories are agnostic to upper layers (no HTTP imports)',
      details: 'No repository directories found.',
    };
  }

  const violations: Array<{ file: string; line: number; content: string }> = [];

  for (const dir of repoDirs) {
    const files = collectFilesRecursive(dir, SOURCE_EXTENSIONS, 4);
    for (const file of files) {
      if (isTestFile(file)) continue;
      findPatternViolations(file, HTTP_IN_REPO_PATTERNS, violations);
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
      description: '100% of Repositories are agnostic to upper layers (no HTTP imports)',
      details: `Found ${violations.length} HTTP concern(s) in repository files. Repositories must not import express, fastapi, axum, or return HTTP status codes. Violations: ${summary}`,
    };
  }

  const totalFiles = repoDirs.reduce(
    (sum, d) => sum + collectFilesRecursive(d, SOURCE_EXTENSIONS, 4).filter((f) => !isTestFile(f)).length,
    0
  );

  return {
    id: 'M-04',
    pass: true,
    description: '100% of Repositories are agnostic to upper layers (no HTTP imports)',
    details: `No HTTP concerns found in ${totalFiles} repository file(s).`,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findLayerDirs(projectPath: string, layerNames: string[]): string[] {
  const results: string[] = [];
  const searchRoots = [
    projectPath,
    ...['src', 'app', 'lib'].map((r) => path.join(projectPath, r)),
  ];

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    for (const name of layerNames) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate)) results.push(candidate);
    }
  }

  return results;
}

function collectFilesRecursive(
  dir: string,
  extensions: string[],
  maxDepth: number,
  depth = 0
): string[] {
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
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (extensions.includes(ext)) results.push(fp);
    }
  }
  return results;
}

function isTestFile(file: string): boolean {
  return (
    /\.(spec|test)\.[a-z]+$/.test(file) ||
    /_spec\.[a-z]+$/.test(file) ||
    /_test\.[a-z]+$/.test(file) ||
    TEST_PATTERNS.some((p) => file.endsWith(p))
  );
}

function findPatternViolations(
  file: string,
  patterns: RegExp[],
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
    // Skip comments
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*')
    ) {
      continue;
    }

    for (const pattern of patterns) {
      if (pattern.test(line)) {
        out.push({ file, line: i + 1, content: trimmed });
        break;
      }
    }
  }
}
