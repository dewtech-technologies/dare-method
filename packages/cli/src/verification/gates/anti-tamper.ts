import path from 'node:path';
import fs from 'fs-extra';
import type { AspectResult } from '../types.js';

export interface TamperSnapshot {
  readonly assertionCount: number;
  readonly testFiles: ReadonlyArray<string>;
  readonly coveragePct?: number;
}

const SKIP_PATTERNS = [
  /\bit\.skip\s*\(/,
  /\bit\.only\s*\(/,
  /\bdescribe\.only\s*\(/,
  /\bdescribe\.skip\s*\(/,
  /\bxit\s*\(/,
  /\bxdescribe\s*\(/,
  /@pytest\.mark\.skip/,
];

function stripJsComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function hasSkipMarker(content: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(content));
}

function countAssertions(content: string, ext: string): number {
  if (ext === '.py') {
    const assertKw = (content.match(/\bassert\b/g) ?? []).length;
    const selfAssert = (content.match(/\bself\.assert\w+/g) ?? []).length;
    const pytestRaises = (content.match(/pytest\.raises\s*\(/g) ?? []).length;
    return assertKw + selfAssert + pytestRaises;
  }

  if (ext === '.rs') {
    return (content.match(/\bassert(?:_eq|_ne)?!\s*\(/g) ?? []).length;
  }

  if (ext === '.php') {
    return (content.match(/\$this->assert\w+/g) ?? []).length;
  }

  const stripped = stripJsComments(content);
  const expect = (stripped.match(/\bexpect\s*\(/g) ?? []).length;
  const assertCalls = (stripped.match(/\bassert\s*\(/g) ?? []).length;
  const matchers = (
    stripped.match(/\.to(?:Be|Equal|StrictEqual|Throw|Match|Contain)\s*\(/g) ??
    []
  ).length;
  return expect + assertCalls + matchers;
}

function fileExt(file: string): string {
  return path.extname(file).toLowerCase();
}

async function collectTestFiles(
  cwd: string,
  testGlob: string,
): Promise<string[]> {
  const direct = path.join(cwd, testGlob);
  if (await fs.pathExists(direct)) {
    const stat = await fs.stat(direct);
    if (stat.isFile()) return [testGlob.replace(/\\/g, '/')];
  }

  const found: string[] = [];
  const suffixes = [
    '.test.ts',
    '.test.js',
    '.spec.ts',
    '.spec.js',
    '_test.py',
    '_test.rs',
  ];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      const rel = path.relative(cwd, abs).replace(/\\/g, '/');
      if (suffixes.some((s) => rel.endsWith(s))) found.push(rel);
    }
  }

  await walk(cwd);
  return [...new Set(found)].sort();
}

export async function snapshotTests(args: {
  readonly cwd: string;
  readonly testGlob: string;
}): Promise<TamperSnapshot> {
  const testFiles = await collectTestFiles(args.cwd, args.testGlob);
  let assertionCount = 0;

  for (const file of testFiles) {
    const content = await fs.readFile(path.join(args.cwd, file), 'utf8');
    assertionCount += countAssertions(content, fileExt(file));
  }

  return { assertionCount, testFiles };
}

export async function checkAntiTamper(args: {
  readonly baseline: TamperSnapshot;
  readonly cwd: string;
  readonly testGlob: string;
}): Promise<AspectResult> {
  const start = Date.now();
  const current = await snapshotTests({
    cwd: args.cwd,
    testGlob: args.testGlob,
  });

  for (const file of args.baseline.testFiles) {
    if (!current.testFiles.includes(file)) {
      return {
        aspect: 'anti-tamper',
        verdict: 'FAIL',
        reason: `test file removed: ${file}`,
        durationMs: Date.now() - start,
      };
    }

    const content = await fs.readFile(path.join(args.cwd, file), 'utf8');
    if (hasSkipMarker(content)) {
      return {
        aspect: 'anti-tamper',
        verdict: 'FAIL',
        reason: `test weakened with skip/only in ${file}`,
        durationMs: Date.now() - start,
      };
    }
  }

  if (current.assertionCount < args.baseline.assertionCount) {
    return {
      aspect: 'anti-tamper',
      verdict: 'FAIL',
      reason: `assertion count dropped: ${args.baseline.assertionCount} → ${current.assertionCount}`,
      durationMs: Date.now() - start,
    };
  }

  if (
    args.baseline.coveragePct !== undefined &&
    current.coveragePct !== undefined &&
    current.coveragePct < args.baseline.coveragePct - 1
  ) {
    return {
      aspect: 'anti-tamper',
      verdict: 'FAIL',
      reason: `coverage dropped: ${args.baseline.coveragePct}% → ${current.coveragePct}%`,
      durationMs: Date.now() - start,
    };
  }

  return {
    aspect: 'anti-tamper',
    verdict: 'PASS',
    reason: 'test suite not weakened',
    durationMs: Date.now() - start,
  };
}
