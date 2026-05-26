/**
 * dare-ax — DareAxMetrics
 * Collects M-01 to M-04 metrics for a project.
 * License: MIT
 */

import fs from 'fs';
import path from 'path';
import { MetricResult } from './types.js';
import { DareAxValidator } from './validator.js';

/**
 * Known rate-limit library identifiers, checked in:
 * - package.json / Gemfile / Cargo.toml / go.mod / requirements.txt / composer.json
 * - Source files (middleware setup patterns)
 */
const RATE_LIMIT_LIBRARIES: Array<{ name: string; pattern: RegExp }> = [
  // Ruby / Rails
  { name: 'rack-attack', pattern: /rack-attack/i },
  // Node.js
  { name: 'express-rate-limit', pattern: /express-rate-limit/i },
  { name: '@nestjs/throttler', pattern: /@nestjs\/throttler/i },
  { name: 'rate-limiter-flexible', pattern: /rate-limiter-flexible/i },
  { name: 'limiter', pattern: /["']limiter["']/ },
  // Rust
  { name: 'tower-governor', pattern: /tower-governor/i },
  { name: 'axum-ratelimit', pattern: /axum-ratelimit/i },
  // Python
  { name: 'slowapi', pattern: /slowapi/i },
  { name: 'limits', pattern: /["']limits["']/ },
  { name: 'django-ratelimit', pattern: /django-ratelimit/i },
  // Go
  { name: 'golang.org/x/time/rate', pattern: /golang\.org\/x\/time\/rate/i },
  { name: 'ulule/limiter', pattern: /ulule\/limiter/i },
  // PHP
  { name: 'laravel-rate-limiting', pattern: /throttle:/i },
  // Generic middleware patterns in source
  { name: 'RateLimit middleware', pattern: /rate[_-]?limit/i },
];

/** Known CLI JSON flag patterns to look for in source code */
const JSON_FLAG_PATTERNS: RegExp[] = [
  /--json/,
  /['"]json['"]\s*,.*flag/i,
  /\.option\(['"]-?-?json/i,
  /jsonOutput/i,
  /output.*json/i,
  /format.*json/i,
];

export class DareAxMetrics {
  private readonly validator: DareAxValidator;

  constructor() {
    this.validator = new DareAxValidator();
  }

  /**
   * Collects all four metrics for the given project path.
   *
   * @param projectPath - Absolute path to the project root.
   * @returns Array of MetricResult for M-01 to M-04.
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
   * M-01: llms.txt exists and is valid (no secrets, required sections present).
   */
  collectM01(projectPath: string): MetricResult {
    const llmsTxtPath = path.join(projectPath, 'llms.txt');

    if (!fs.existsSync(llmsTxtPath)) {
      return {
        id: 'M-01',
        pass: false,
        description: 'llms.txt exists and is valid',
        detail: `llms.txt not found at ${llmsTxtPath}`,
      };
    }

    const result = this.validator.validate(llmsTxtPath);

    if (!result.valid) {
      const errorSummary = result.errors.map((e) => e.message).join('; ');
      return {
        id: 'M-01',
        pass: false,
        description: 'llms.txt exists and is valid',
        detail: `Validation failed: ${errorSummary}`,
      };
    }

    const warningSummary =
      result.warnings.length > 0
        ? ` (${result.warnings.length} warnings: ${result.warnings.map((w) => w.code).join(', ')})`
        : '';

    return {
      id: 'M-01',
      pass: true,
      description: 'llms.txt exists and is valid',
      detail: `Valid${warningSummary}`,
    };
  }

  /**
   * M-02: openapi.json exists (checks public/openapi.json and openapi.json).
   */
  collectM02(projectPath: string): MetricResult {
    const candidates = [
      path.join(projectPath, 'public', 'openapi.json'),
      path.join(projectPath, 'openapi.json'),
      path.join(projectPath, 'static', 'openapi.json'),
      path.join(projectPath, 'docs', 'openapi.json'),
      path.join(projectPath, 'api', 'openapi.json'),
      // Also support YAML variants
      path.join(projectPath, 'openapi.yaml'),
      path.join(projectPath, 'openapi.yml'),
      path.join(projectPath, 'public', 'openapi.yaml'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return {
          id: 'M-02',
          pass: true,
          description: 'OpenAPI specification exists',
          detail: `Found at ${path.relative(projectPath, candidate)}`,
        };
      }
    }

    return {
      id: 'M-02',
      pass: false,
      description: 'OpenAPI specification exists',
      detail:
        'No openapi.json or openapi.yaml found in project root, public/, static/, docs/, or api/ directories.',
    };
  }

  /**
   * M-03: CLI supports --json flag.
   * Searches source code for --json flag definitions.
   */
  collectM03(projectPath: string): MetricResult {
    const sourceExtensions = ['.ts', '.js', '.mjs', '.rb', '.rs', '.py', '.go', '.php'];
    const searchDirs = [
      path.join(projectPath, 'src'),
      path.join(projectPath, 'lib'),
      path.join(projectPath, 'app'),
      path.join(projectPath, 'cmd'),
      path.join(projectPath, 'bin'),
      path.join(projectPath, 'cli'),
    ];

    // Search for --json pattern in CLI-related source files
    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;

      const found = searchDirectoryForPattern(dir, JSON_FLAG_PATTERNS, sourceExtensions, 3);
      if (found) {
        return {
          id: 'M-03',
          pass: true,
          description: 'CLI supports --json flag',
          detail: `Found --json flag pattern in ${path.relative(projectPath, found)}`,
        };
      }
    }

    // Also check root-level bin files
    const rootBinCandidates = findFilesWithPattern(projectPath, /^(cli|main|index|app)\.(ts|js|rb|rs|py|go)$/, 1);
    for (const file of rootBinCandidates) {
      if (fileMatchesAnyPattern(file, JSON_FLAG_PATTERNS)) {
        return {
          id: 'M-03',
          pass: true,
          description: 'CLI supports --json flag',
          detail: `Found --json flag pattern in ${path.relative(projectPath, file)}`,
        };
      }
    }

    return {
      id: 'M-03',
      pass: false,
      description: 'CLI supports --json flag',
      detail:
        'No --json flag detected in CLI source files. Add --json output flag to CLI commands (see dare-ax ADR-04).',
    };
  }

  /**
   * M-04: Rate limit configuration detected.
   * Checks package manifests and source code.
   */
  collectM04(projectPath: string): MetricResult {
    // Check package manifests
    const manifests = [
      { file: path.join(projectPath, 'package.json'), key: 'dependencies' },
      { file: path.join(projectPath, 'package.json'), key: 'devDependencies' },
      { file: path.join(projectPath, 'Gemfile'), key: null },
      { file: path.join(projectPath, 'Cargo.toml'), key: null },
      { file: path.join(projectPath, 'go.mod'), key: null },
      { file: path.join(projectPath, 'requirements.txt'), key: null },
      { file: path.join(projectPath, 'composer.json'), key: null },
      { file: path.join(projectPath, 'pyproject.toml'), key: null },
    ];

    for (const { file } of manifests) {
      if (!fs.existsSync(file)) continue;

      try {
        const content = fs.readFileSync(file, 'utf-8');
        for (const { name, pattern } of RATE_LIMIT_LIBRARIES) {
          if (pattern.test(content)) {
            return {
              id: 'M-04',
              pass: true,
              description: 'Rate limit configuration detected',
              detail: `Found rate limit library "${name}" in ${path.relative(projectPath, file)}`,
            };
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Search source directories for rate limit patterns
    const sourceDirs = [
      path.join(projectPath, 'src'),
      path.join(projectPath, 'lib'),
      path.join(projectPath, 'app'),
      path.join(projectPath, 'config'),
    ];

    const rateLimitPatterns = RATE_LIMIT_LIBRARIES.map((l) => l.pattern);

    for (const dir of sourceDirs) {
      if (!fs.existsSync(dir)) continue;

      const found = searchDirectoryForPattern(
        dir,
        rateLimitPatterns,
        ['.ts', '.js', '.rb', '.rs', '.py', '.go', '.php'],
        4
      );

      if (found) {
        return {
          id: 'M-04',
          pass: true,
          description: 'Rate limit configuration detected',
          detail: `Found rate limit pattern in ${path.relative(projectPath, found)}`,
        };
      }
    }

    return {
      id: 'M-04',
      pass: false,
      description: 'Rate limit configuration detected',
      detail:
        'No rate limit library or middleware detected. ' +
        'Add rate limiting (rack-attack, express-rate-limit, tower-governor, etc.) to protect public endpoints.',
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively searches a directory for files matching given patterns.
 * Returns the first matching file path, or null.
 */
function searchDirectoryForPattern(
  dir: string,
  patterns: RegExp[],
  extensions: string[],
  maxDepth: number,
  currentDepth = 0
): string | null {
  if (currentDepth > maxDepth) return null;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'dist') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const found = searchDirectoryForPattern(fullPath, patterns, extensions, maxDepth, currentDepth + 1);
      if (found) return found;
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!extensions.includes(ext)) continue;

      if (fileMatchesAnyPattern(fullPath, patterns)) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Reads a file and returns true if any of the patterns match its content.
 */
function fileMatchesAnyPattern(filePath: string, patterns: RegExp[]): boolean {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return false;
  }

  return patterns.some((p) => p.test(content));
}

/**
 * Returns files in a directory (non-recursive) whose names match the given pattern.
 */
function findFilesWithPattern(dir: string, namePattern: RegExp, _maxDepth: number): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.isFile() && namePattern.test(e.name))
    .map((e) => path.join(dir, e.name));
}
