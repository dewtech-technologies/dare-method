/**
 * Static analyzer for `dare review` — scans source files for "fake
 * completeness" patterns: TODO markers, empty function bodies, explicit
 * stubs, mocks leaked into production code, etc.
 *
 * Detectors are deliberately line-based with regexes. We don't pull in a
 * full multi-language AST stack: the CLI ships across Rust/Go/Python/PHP/
 * Node/TS projects and a precise AST per language explodes the dependency
 * tree. The cost is a small false-positive rate on string-literal hits like
 * `const msg = "TODO: ..."`, which we mitigate by ignoring matches inside
 * string literals at line-scope (single-line heuristic, see `inString`).
 *
 * Each detector is pure: `(line, idx, ctx) -> Violation | null`. Callers
 * (`runStaticAnalysis`) iterate files, classify them as test/production, and
 * skip rules that don't apply to tests.
 */

import fs from 'fs-extra';
import path from 'path';
import type {
  FileReport,
  Violation,
  ViolationKind,
  ViolationSeverity,
} from '../types/Review.types.js';

// ── File classification ──────────────────────────────────────────────────────

/** Substrings that mark a path as test/spec/fixture code (mocks allowed there). */
const TEST_PATH_MARKERS = [
  '/__tests__/',
  '\\__tests__\\',
  '/tests/',
  '\\tests\\',
  '/test/',
  '\\test\\',
  '/spec/',
  '\\spec\\',
  '/__mocks__/',
  '\\__mocks__\\',
  '/fixtures/',
  '\\fixtures\\',
  '/seeders/',
  '\\seeders\\',
  '/factories/',
  '\\factories\\',
];

/** Filename suffixes that mark a file as test/spec code. */
const TEST_FILE_SUFFIXES = [
  '.test.ts',
  '.test.tsx',
  '.test.js',
  '.test.jsx',
  '.spec.ts',
  '.spec.tsx',
  '.spec.js',
  '.spec.jsx',
  '_test.go',
  '_test.py',
  'Test.php',
  'Spec.php',
  '.test.rs',
];

/** Python uses a `test_` *prefix* convention. Match basename, not suffix. */
const TEST_FILE_BASENAME_PREFIXES = ['test_'];

export function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1);

  if (
    TEST_PATH_MARKERS.some((marker) => {
      const lower = marker.toLowerCase().replace(/\\/g, '/');
      // Match both `/tests/foo.py` and `tests/foo.py` at path start.
      return normalized.includes(lower) || normalized.startsWith(lower.replace(/^\//, ''));
    })
  ) {
    return true;
  }
  if (TEST_FILE_SUFFIXES.some((suffix) => filePath.endsWith(suffix))) return true;
  if (TEST_FILE_BASENAME_PREFIXES.some((prefix) => basename.startsWith(prefix))) return true;
  return false;
}

/** File extensions we analyze. Anything else is silently skipped. */
export const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rs',
  '.go',
  '.php',
  '.rb',
  '.java',
  '.kt',
  '.cs',
]);

function isSupported(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Crude check for "is this column inside a string literal?". We count
 * unescaped quotes before `col` on the same line; an odd count means we're
 * inside a string. Imperfect across multi-line strings but good enough to
 * suppress comments-in-strings noise without an AST.
 */
export function inString(line: string, col: number): boolean {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < col && i < line.length; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : '';
    if (prev === '\\') continue;
    if (ch === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (ch === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;
  }
  return inSingle || inDouble || inBacktick;
}

function snippet(line: string): string {
  return line.trim().slice(0, 200);
}

function pushViolation(
  out: Violation[],
  kind: ViolationKind,
  severity: ViolationSeverity,
  file: string,
  lineIdx: number,
  line: string,
  message: string,
): void {
  out.push({
    kind,
    severity,
    file,
    line: lineIdx + 1,
    snippet: snippet(line),
    message,
  });
}

// ── Detectors ────────────────────────────────────────────────────────────────

/**
 * Match `TODO`/`FIXME`/`XXX`/`HACK` markers that look like comments. We
 * require them to follow `//`, `#`, `--`, `/*` or `*` to avoid hitting
 * variable names like `todoList`. Identifiers with these substrings inside
 * a longer word (e.g. `pseudohack`) are skipped via word-boundary anchors.
 */
const TODO_MARKER_RE = /(\/\/|#|--|\/\*|\*)\s*(TODO|FIXME|XXX|HACK)\b/i;

function detectTodoMarkers(line: string, lineIdx: number, file: string, out: Violation[]): void {
  const match = TODO_MARKER_RE.exec(line);
  if (!match) return;
  if (inString(line, match.index)) return;
  const marker = match[2].toUpperCase();
  pushViolation(
    out,
    'todo-marker',
    'error',
    file,
    lineIdx,
    line,
    `${marker} marker found — resolve or remove before marking task as DONE.`,
  );
}

/**
 * Stub patterns the agent leans on when it doesn't know what to write.
 * Matched across languages — each entry is a regex + a human-readable name.
 */
const STUB_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /throw\s+new\s+Error\(\s*['"`]not[\s-]?implemented['"`]/i, label: "throw new Error('not implemented')" },
  { re: /throw\s+new\s+Error\(\s*['"`]todo['"`]/i, label: "throw new Error('todo')" },
  { re: /\bunimplemented!\s*\(/, label: 'unimplemented!()' },
  { re: /\btodo!\s*\(/, label: 'todo!()' },
  { re: /\braise\s+NotImplementedError\b/, label: 'raise NotImplementedError' },
  { re: /\bpanic!\s*\(\s*['"]not[\s-]?implemented['"]/i, label: "panic!('not implemented')" },
];

function detectStubs(line: string, lineIdx: number, file: string, out: Violation[]): void {
  for (const { re, label } of STUB_PATTERNS) {
    const m = re.exec(line);
    if (!m) continue;
    if (inString(line, m.index)) continue;
    pushViolation(
      out,
      'not-implemented-stub',
      'error',
      file,
      lineIdx,
      line,
      `${label} — replace with real implementation.`,
    );
    return;
  }
}

/**
 * Empty function detector. Matches common single-line empty bodies across
 * languages. Multi-line empty bodies are handled by `detectEmptyBlocks`.
 */
/**
 * Optional trailing block matched at end-of-line — tolerates `// comment`,
 * `# comment` or just whitespace. Without this, a perfectly valid stub like
 * `function x() {} // empty` would slip past the detector.
 */
const TRAIL = String.raw`\s*;?\s*(?:\/\/.*|#.*|\/\*.*?\*\/)?\s*$`;

const EMPTY_FN_SINGLE_LINE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // TS/JS: function foo() {} | () => {} | foo() {} | async foo() {}
  { re: new RegExp(String.raw`\b(function\s+\w+|=>|\b\w+\s*\([^)]*\))\s*\{\s*\}` + TRAIL), label: 'empty function body' },
  // Python: def foo(...): pass
  { re: new RegExp(String.raw`\bdef\s+\w+\s*\([^)]*\)\s*(->[^:]+)?:\s*pass` + TRAIL), label: 'def foo(...): pass' },
  // Python: def foo(...): ...
  { re: new RegExp(String.raw`\bdef\s+\w+\s*\([^)]*\)\s*(->[^:]+)?:\s*\.\.\.` + TRAIL), label: 'def foo(...): ...' },
  // Rust: fn foo() {}
  { re: new RegExp(String.raw`\bfn\s+\w+\s*\([^)]*\)\s*(->[^{]+)?\{\s*\}` + TRAIL), label: 'fn foo() {}' },
  // Go: func foo() {}
  { re: new RegExp(String.raw`\bfunc\s+\w+\s*\([^)]*\)\s*[^{]*\{\s*\}` + TRAIL), label: 'func foo() {}' },
];

function detectEmptyFunctionsSingleLine(
  line: string,
  lineIdx: number,
  file: string,
  out: Violation[],
): void {
  for (const { re, label } of EMPTY_FN_SINGLE_LINE_PATTERNS) {
    if (re.test(line)) {
      pushViolation(
        out,
        'empty-function',
        'error',
        file,
        lineIdx,
        line,
        `${label} — function must do real work.`,
      );
      return;
    }
  }
}

/** Placeholder comments — explicit "I'll write this later" intent. */
const PLACEHOLDER_COMMENT_RE =
  /(\/\/|#)\s*(implement\s+later|placeholder|stub|fixme\s+implement|to\s+be\s+implemented|tbd)\b/i;

function detectPlaceholderComments(
  line: string,
  lineIdx: number,
  file: string,
  out: Violation[],
): void {
  const m = PLACEHOLDER_COMMENT_RE.exec(line);
  if (!m) return;
  if (inString(line, m.index)) return;
  pushViolation(
    out,
    'placeholder-comment',
    'error',
    file,
    lineIdx,
    line,
    'Placeholder comment — implement the real behavior.',
  );
}

/**
 * Mock library / spy calls that should never appear in production code.
 * Test files are filtered out by the caller before this runs.
 */
const PRODUCTION_MOCK_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bjest\.(fn|mock|spyOn)\s*\(/, label: 'jest.fn / jest.mock / jest.spyOn' },
  { re: /\bvi\.(fn|mock|spyOn)\s*\(/, label: 'vi.fn / vi.mock / vi.spyOn (vitest)' },
  { re: /\bsinon\.(stub|spy|mock|fake)\s*\(/, label: 'sinon.stub / sinon.spy' },
  { re: /\bmockReturnValue(Once)?\s*\(/, label: 'mockReturnValue' },
  { re: /\bmockResolvedValue(Once)?\s*\(/, label: 'mockResolvedValue' },
  { re: /\bMock\s*<[^>]+>\s*\(/, label: 'Mock<T>() (Moq/.NET)' },
  { re: /\bMockito\.(mock|when|verify)\s*\(/, label: 'Mockito (Java)' },
  { re: /\bunittest\.mock\.|@patch\b|MagicMock\s*\(/, label: 'unittest.mock / @patch' },
];

function detectProductionMocks(
  line: string,
  lineIdx: number,
  file: string,
  out: Violation[],
): void {
  for (const { re, label } of PRODUCTION_MOCK_PATTERNS) {
    const m = re.exec(line);
    if (!m) continue;
    if (inString(line, m.index)) continue;
    pushViolation(
      out,
      'production-mock',
      'error',
      file,
      lineIdx,
      line,
      `${label} — mocks belong in test files, not production code.`,
    );
    return;
  }
}

// ── Multi-line detectors ─────────────────────────────────────────────────────

/**
 * Multi-line empty block detector — catches:
 *   function foo() {
 *   }
 *
 *   def foo():
 *       pass
 *
 *   fn foo() -> X {
 *       todo!()
 *   }
 *
 * Walks the file looking for a function/method declaration followed only by
 * whitespace and an opening brace/colon, then checks if the body is empty
 * or contains only a single stub statement.
 */
function detectEmptyBlocks(lines: string[], file: string, out: Violation[]): void {
  const fnDeclRe =
    /\b(function|fn|func|def|method)\s+(\w+)\s*\([^)]*\)\s*(->[^{:]+)?\s*([{:])\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const decl = fnDeclRe.exec(lines[i]);
    if (!decl) continue;

    const opener = decl[4];
    const fnName = decl[2];

    if (opener === '{') {
      // C-style: scan for the matching close brace and check body is empty/trivial.
      let depth = 1;
      let bodyLines: string[] = [];
      for (let j = i + 1; j < lines.length && depth > 0; j++) {
        const ln = lines[j];
        for (const ch of ln) {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
          if (depth === 0) break;
        }
        if (depth > 0) bodyLines.push(ln);
      }
      const nonBlank = bodyLines.filter((l) => l.trim() && !l.trim().startsWith('//'));
      if (nonBlank.length === 0) {
        pushViolation(
          out,
          'empty-function',
          'error',
          file,
          i,
          lines[i],
          `Function ${fnName}() has an empty body — function must do real work.`,
        );
      }
    } else if (opener === ':') {
      // Python-style: next non-blank line is the body.
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length) {
        const body = lines[j].trim();
        if (body === 'pass' || body === '...') {
          pushViolation(
            out,
            'empty-function',
            'error',
            file,
            i,
            lines[i],
            `Function ${fnName}() body is just \`${body}\` — implement real behavior.`,
          );
        }
      }
    }
  }
}

/**
 * Phantom-return detector. Catches functions whose body is just
 * `return null|undefined|{}|[]`. We require a multi-line scan because the
 * function signature is on one line and the return on another.
 */
function detectPhantomReturns(lines: string[], file: string, out: Violation[]): void {
  const fnOpenRe =
    /\b(function|fn|func|def)\s+(\w+)\s*\([^)]*\)\s*(->[^{:]+)?\s*([{:])\s*$/;
  const phantomRe = /^\s*return\s+(null|undefined|\{\s*\}|\[\s*\])\s*;?\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const decl = fnOpenRe.exec(lines[i]);
    if (!decl) continue;
    if (decl[4] !== '{') continue; // python phantoms are rarer; skip for now

    let depth = 1;
    let statements = 0;
    let phantomFound = false;
    let phantomLine = -1;
    for (let j = i + 1; j < lines.length && depth > 0; j++) {
      const ln = lines[j];
      const depthBefore = depth;
      for (const ch of ln) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        if (depth === 0) break;
      }
      // Skip the closing-brace line itself — it would otherwise count as a
      // statement and defeat the "only one statement" check below.
      if (depthBefore > 0 && depth === 0) {
        const trimmed = ln.trim();
        // A line that's just `}` is the closer; ignore it. But a line like
        // `return x; }` (closer combined with code) still counts.
        if (trimmed === '}' || trimmed === '};') continue;
      }
      const trimmed = ln.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      statements++;
      if (phantomRe.test(ln)) {
        phantomFound = true;
        phantomLine = j;
      }
    }

    if (phantomFound && statements === 1) {
      pushViolation(
        out,
        'phantom-return',
        'error',
        file,
        phantomLine,
        lines[phantomLine],
        `Function ${decl[2]}() only returns a phantom value — no real logic.`,
      );
    }
  }
}

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * Analyze a single file. Returns the per-file report. Files that can't be
 * read or are unsupported produce a clean report (no violations).
 */
export async function analyzeFile(
  absolutePath: string,
  projectRelativePath: string,
): Promise<FileReport> {
  const report: FileReport = {
    file: projectRelativePath,
    isTestFile: isTestFile(projectRelativePath),
    violations: [],
  };

  if (!isSupported(absolutePath)) return report;
  if (!(await fs.pathExists(absolutePath))) return report;

  const content = await fs.readFile(absolutePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detectors that fire on every file:
    detectTodoMarkers(line, i, projectRelativePath, report.violations);
    detectStubs(line, i, projectRelativePath, report.violations);
    detectEmptyFunctionsSingleLine(line, i, projectRelativePath, report.violations);
    detectPlaceholderComments(line, i, projectRelativePath, report.violations);

    // Production-only detectors:
    if (!report.isTestFile) {
      detectProductionMocks(line, i, projectRelativePath, report.violations);
    }
  }

  // Multi-line detectors run once over the full buffer.
  detectEmptyBlocks(lines, projectRelativePath, report.violations);
  detectPhantomReturns(lines, projectRelativePath, report.violations);

  return report;
}

/**
 * Run static analysis on a list of files. Files are scanned in parallel —
 * I/O is the bottleneck, CPU work per file is negligible.
 */
export async function runStaticAnalysis(
  projectRoot: string,
  projectRelativeFiles: string[],
): Promise<FileReport[]> {
  return Promise.all(
    projectRelativeFiles.map((rel) => analyzeFile(path.join(projectRoot, rel), rel)),
  );
}
