/**
 * dare-quality-telemetry — DareAx collector
 * Collects M-01 to M-04 metrics for a project that should comply with dare-ax.
 * License: MIT
 */

import fs from 'fs';
import path from 'path';
import { MetricResult } from '../types.js';

/** Required sections that must appear in a valid llms.txt */
const REQUIRED_LLMS_SECTIONS = [
  'Project Overview',
  'Tech Stack',
  'Architecture',
  'Getting Started',
  'For AI Agents',
];

/** Rate-limit patterns to detect */
const RATE_LIMIT_PATTERNS: RegExp[] = [
  /rack-attack/i,
  /express-rate-limit/i,
  /tower-governor/i,
  /throttler/i,
  /RateLimiter/i,
  /rate[_-]?limit/i,
  /slowapi/i,
  /django-ratelimit/i,
  /ulule\/limiter/i,
  /golang\.org\/x\/time\/rate/i,
];

/** Source file extensions for grep operations */
const SOURCE_EXTENSIONS = ['.ts', '.js', '.mjs', '.rb', '.rs', '.py', '.go', '.php'];

const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', '.git', 'vendor', '__pycache__', 'coverage']);

export function collectDareAx(projectPath: string): Promise<MetricResult[]> {
  return Promise.resolve([
    collectM01(projectPath),
    collectM02(projectPath),
    collectM03(projectPath),
    collectM04(projectPath),
  ]);
}

/**
 * M-01: llms.txt exists and has the 5 required sections.
 */
function collectM01(projectPath: string): MetricResult {
  const llmsTxtPath = path.join(projectPath, 'llms.txt');

  if (!fs.existsSync(llmsTxtPath)) {
    return {
      id: 'M-01',
      pass: false,
      description: 'llms.txt exists and has 5 required sections',
      details: `llms.txt not found at ${llmsTxtPath}`,
    };
  }

  let content: string;
  try {
    content = fs.readFileSync(llmsTxtPath, 'utf-8');
  } catch (err) {
    return {
      id: 'M-01',
      pass: false,
      description: 'llms.txt exists and has 5 required sections',
      details: `Failed to read llms.txt: ${(err as Error).message}`,
    };
  }

  const missingSections = REQUIRED_LLMS_SECTIONS.filter(
    (section) => !content.includes(section)
  );

  if (missingSections.length > 0) {
    return {
      id: 'M-01',
      pass: false,
      description: 'llms.txt exists and has 5 required sections',
      details: `Missing required sections: ${missingSections.join(', ')}`,
    };
  }

  return {
    id: 'M-01',
    pass: true,
    description: 'llms.txt exists and has 5 required sections',
    details: 'All 5 required sections present in llms.txt',
  };
}

/**
 * M-02: openapi.json or public/openapi.json exists.
 */
function collectM02(projectPath: string): MetricResult {
  const candidates = [
    path.join(projectPath, 'openapi.json'),
    path.join(projectPath, 'public', 'openapi.json'),
    path.join(projectPath, 'static', 'openapi.json'),
    path.join(projectPath, 'docs', 'openapi.json'),
    path.join(projectPath, 'api', 'openapi.json'),
    path.join(projectPath, 'openapi.yaml'),
    path.join(projectPath, 'openapi.yml'),
    path.join(projectPath, 'public', 'openapi.yaml'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return {
        id: 'M-02',
        pass: true,
        description: 'OpenAPI specification exists (openapi.json or public/openapi.json)',
        details: `Found at ${path.relative(projectPath, candidate)}`,
      };
    }
  }

  return {
    id: 'M-02',
    pass: false,
    description: 'OpenAPI specification exists (openapi.json or public/openapi.json)',
    details:
      'No openapi.json or openapi.yaml found in project root, public/, static/, docs/, or api/ directories.',
  };
}

/**
 * M-03: CLI supports --json flag.
 * Greps for --json in bin/, cli.ts, cli.js, dare.ts.
 */
function collectM03(projectPath: string): MetricResult {
  const JSON_FLAG_PATTERN = /--json/;

  // Priority CLI files to check
  const cliFileCandidates = [
    path.join(projectPath, 'cli.ts'),
    path.join(projectPath, 'cli.js'),
    path.join(projectPath, 'dare.ts'),
    path.join(projectPath, 'dare.js'),
  ];

  for (const candidate of cliFileCandidates) {
    if (fs.existsSync(candidate) && fileMatchesPattern(candidate, JSON_FLAG_PATTERN)) {
      return {
        id: 'M-03',
        pass: true,
        description: 'CLI supports --json flag',
        details: `Found --json flag in ${path.relative(projectPath, candidate)}`,
      };
    }
  }

  // Search in bin/ directory
  const binDir = path.join(projectPath, 'bin');
  if (fs.existsSync(binDir)) {
    const found = searchDirForPattern(binDir, JSON_FLAG_PATTERN, SOURCE_EXTENSIONS, 3);
    if (found) {
      return {
        id: 'M-03',
        pass: true,
        description: 'CLI supports --json flag',
        details: `Found --json flag in ${path.relative(projectPath, found)}`,
      };
    }
  }

  // Search in src/ and lib/ directories
  for (const dir of ['src', 'lib', 'app', 'cmd', 'cli']) {
    const fullDir = path.join(projectPath, dir);
    if (!fs.existsSync(fullDir)) continue;
    const found = searchDirForPattern(fullDir, JSON_FLAG_PATTERN, SOURCE_EXTENSIONS, 3);
    if (found) {
      return {
        id: 'M-03',
        pass: true,
        description: 'CLI supports --json flag',
        details: `Found --json flag in ${path.relative(projectPath, found)}`,
      };
    }
  }

  return {
    id: 'M-03',
    pass: false,
    description: 'CLI supports --json flag',
    details:
      'No --json flag detected in CLI source files (bin/, cli.ts, cli.js, dare.ts). Add --json output flag to CLI commands.',
  };
}

/**
 * M-04: Rate limit configuration detected.
 * Greps for known rate limit patterns in package manifests and source files.
 */
function collectM04(projectPath: string): MetricResult {
  // Check package manifests first
  const manifests = [
    path.join(projectPath, 'package.json'),
    path.join(projectPath, 'Gemfile'),
    path.join(projectPath, 'Cargo.toml'),
    path.join(projectPath, 'go.mod'),
    path.join(projectPath, 'requirements.txt'),
    path.join(projectPath, 'pyproject.toml'),
    path.join(projectPath, 'composer.json'),
  ];

  for (const manifest of manifests) {
    if (!fs.existsSync(manifest)) continue;
    try {
      const content = fs.readFileSync(manifest, 'utf-8');
      for (const pattern of RATE_LIMIT_PATTERNS) {
        if (pattern.test(content)) {
          const matchedLib = content.match(pattern)?.[0] ?? 'rate-limit';
          return {
            id: 'M-04',
            pass: true,
            description: 'Rate limit configuration detected',
            details: `Found rate limit pattern "${matchedLib}" in ${path.relative(projectPath, manifest)}`,
          };
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Search source directories
  for (const dir of ['src', 'lib', 'app', 'config']) {
    const fullDir = path.join(projectPath, dir);
    if (!fs.existsSync(fullDir)) continue;

    for (const pattern of RATE_LIMIT_PATTERNS) {
      const found = searchDirForPattern(fullDir, pattern, SOURCE_EXTENSIONS, 4);
      if (found) {
        return {
          id: 'M-04',
          pass: true,
          description: 'Rate limit configuration detected',
          details: `Found rate limit pattern in ${path.relative(projectPath, found)}`,
        };
      }
    }
  }

  return {
    id: 'M-04',
    pass: false,
    description: 'Rate limit configuration detected',
    details:
      'No rate limit library or middleware detected. Add rate limiting (rack-attack, express-rate-limit, tower-governor, etc.) to protect public endpoints.',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fileMatchesPattern(filePath: string, pattern: RegExp): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return pattern.test(content);
  } catch {
    return false;
  }
}

function searchDirForPattern(
  dir: string,
  pattern: RegExp,
  extensions: string[],
  maxDepth: number,
  depth = 0
): string | null {
  if (depth > maxDepth) return null;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const found = searchDirForPattern(fullPath, pattern, extensions, maxDepth, depth + 1);
      if (found) return found;
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!extensions.includes(ext)) continue;
      if (fileMatchesPattern(fullPath, pattern)) return fullPath;
    }
  }

  return null;
}
