import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  analyzeFile,
  isTestFile,
  runStaticAnalysis,
} from '../utils/static-analyzer.js';
import {
  parseFilesFromSpec,
  runReview,
} from '../utils/ReviewRunner.js';
import type { ViolationKind } from '../types/Review.types.js';

// Temp dir helper — each test gets its own sandbox.
async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'dare-review-test-'));
}

async function writeFile(dir: string, rel: string, content: string): Promise<void> {
  const abs = path.join(dir, rel);
  await fs.ensureDir(path.dirname(abs));
  await fs.writeFile(abs, content);
}

// ── isTestFile ────────────────────────────────────────────────────────────────

describe('isTestFile', () => {
  it('matches *.test.ts', () => {
    expect(isTestFile('src/foo.test.ts')).toBe(true);
    expect(isTestFile('src/foo.spec.ts')).toBe(true);
  });

  it('matches __tests__ directories', () => {
    expect(isTestFile('src/__tests__/foo.ts')).toBe(true);
    expect(isTestFile('src\\__tests__\\foo.ts')).toBe(true);
  });

  it('matches Go/Python test conventions', () => {
    expect(isTestFile('pkg/auth/auth_test.go')).toBe(true);
    expect(isTestFile('tests/test_auth.py')).toBe(true);
  });

  it('rejects production files', () => {
    expect(isTestFile('src/auth/login.ts')).toBe(false);
    expect(isTestFile('src/controllers/users.go')).toBe(false);
  });
});

// ── parseFilesFromSpec ────────────────────────────────────────────────────────

describe('parseFilesFromSpec', () => {
  it('extracts files from a CRIAR/MODIFICAR table', () => {
    const md = `
## 3. ARQUIVOS

| Ação | Caminho | Descrição |
|------|---------|-----------|
| CRIAR | \`src/auth/login.ts\` | Login handler |
| MODIFICAR | \`src/routes.ts\` | Wire route |
| CRIAR | \`tests/auth.test.ts\` | Tests |
`;
    expect(parseFilesFromSpec(md)).toEqual([
      'src/auth/login.ts',
      'src/routes.ts',
      'tests/auth.test.ts',
    ]);
  });

  it('accepts English actions too', () => {
    const md = `
| Action | Path |
| CREATE | \`a.ts\` |
| MODIFY | \`b.ts\` |
| UPDATE | \`c.ts\` |
`;
    expect(parseFilesFromSpec(md)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('de-duplicates paths', () => {
    const md = `
| MODIFICAR | \`src/a.ts\` |
| MODIFICAR | \`src/a.ts\` |
`;
    expect(parseFilesFromSpec(md)).toEqual(['src/a.ts']);
  });

  it('ignores rows without a backtick path', () => {
    const md = `
| CRIAR | descrição sem path | x |
| MODIFICAR | \`src/real.ts\` | x |
`;
    expect(parseFilesFromSpec(md)).toEqual(['src/real.ts']);
  });
});

// ── Static analyzer detectors ─────────────────────────────────────────────────

describe('static-analyzer: detectors', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await makeTempDir();
  });
  afterEach(async () => {
    await fs.remove(tmp);
  });

  async function analyze(rel: string, content: string) {
    await writeFile(tmp, rel, content);
    return analyzeFile(path.join(tmp, rel), rel);
  }

  function kinds(report: { violations: { kind: ViolationKind }[] }): ViolationKind[] {
    return report.violations.map((v) => v.kind);
  }

  it('detects TODO/FIXME/XXX/HACK in comments', async () => {
    const r = await analyze(
      'src/a.ts',
      `// TODO: implement\nconst x = 1; // FIXME later\n// XXX broken\n/* HACK */`,
    );
    const found = kinds(r);
    expect(found.filter((k) => k === 'todo-marker').length).toBeGreaterThanOrEqual(4);
  });

  it('ignores TODO inside string literals', async () => {
    const r = await analyze(
      'src/a.ts',
      `const msg = "TODO: not a real comment";\nconst real = 1;`,
    );
    expect(kinds(r)).not.toContain('todo-marker');
  });

  it('detects throw new Error("not implemented") and friends', async () => {
    const r = await analyze(
      'src/b.ts',
      `function x() { throw new Error('not implemented'); }\nfunction y() { throw new Error('todo'); }`,
    );
    const stubs = r.violations.filter((v) => v.kind === 'not-implemented-stub');
    expect(stubs.length).toBeGreaterThanOrEqual(2);
  });

  it('detects Rust unimplemented!() and todo!()', async () => {
    const r = await analyze(
      'src/lib.rs',
      `fn a() { unimplemented!() }\nfn b() { todo!() }`,
    );
    expect(kinds(r)).toContain('not-implemented-stub');
  });

  it('detects Python raise NotImplementedError', async () => {
    const r = await analyze('src/x.py', `def foo():\n    raise NotImplementedError\n`);
    expect(kinds(r)).toContain('not-implemented-stub');
  });

  it('detects empty function single-line (TS)', async () => {
    const r = await analyze(
      'src/c.ts',
      `function foo() {}\nconst bar = () => {};\nfunction baz() { /* real */ return 1; }`,
    );
    const empties = r.violations.filter((v) => v.kind === 'empty-function');
    expect(empties.length).toBeGreaterThanOrEqual(1);
  });

  it('detects empty multi-line function (TS)', async () => {
    const r = await analyze(
      'src/d.ts',
      `function alpha() {\n}\nfunction beta() {\n  const x = 1;\n  return x;\n}`,
    );
    const empties = r.violations.filter((v) => v.kind === 'empty-function');
    expect(empties.length).toBe(1);
  });

  it('detects Python def x(): pass', async () => {
    const r = await analyze('src/e.py', `def foo():\n    pass\n`);
    expect(kinds(r)).toContain('empty-function');
  });

  it('detects phantom returns (only stmt is return null)', async () => {
    const r = await analyze(
      'src/f.ts',
      `function getUser(id: string) {\n  return null;\n}\nfunction getOther() {\n  const x = compute();\n  return x;\n}`,
    );
    const phantoms = r.violations.filter((v) => v.kind === 'phantom-return');
    expect(phantoms.length).toBe(1);
  });

  it('detects placeholder comments', async () => {
    const r = await analyze(
      'src/g.ts',
      `// implement later\n// stub\n# placeholder\n// fixme implement\nconst real = 1;`,
    );
    const placeholders = r.violations.filter(
      (v) => v.kind === 'placeholder-comment',
    );
    expect(placeholders.length).toBeGreaterThanOrEqual(3);
  });

  it('detects production mocks (jest.fn, sinon.stub, vi.mock)', async () => {
    const r = await analyze(
      'src/h.ts',
      `const x = jest.fn();\nconst y = sinon.stub();\nvi.mock('foo');`,
    );
    const mocks = r.violations.filter((v) => v.kind === 'production-mock');
    expect(mocks.length).toBeGreaterThanOrEqual(3);
  });

  it('does NOT flag mocks in test files', async () => {
    const r = await analyze(
      'src/h.test.ts',
      `const x = jest.fn();\nvi.mock('foo');`,
    );
    expect(r.isTestFile).toBe(true);
    expect(kinds(r)).not.toContain('production-mock');
  });

  it('runs clean on a real-looking implementation', async () => {
    const r = await analyze(
      'src/auth/login.ts',
      `
import { hash } from 'crypto';

export async function login(email: string, password: string) {
  if (!email || !password) {
    throw new Error('email and password are required');
  }
  const user = await db.users.findOne({ email });
  if (!user) return { ok: false, code: 401 };
  const ok = await verify(user.passwordHash, password);
  if (!ok) return { ok: false, code: 401 };
  return { ok: true, token: signToken(user.id) };
}
      `.trim(),
    );
    expect(r.violations).toEqual([]);
  });
});

// ── runStaticAnalysis + runReview end-to-end ──────────────────────────────────

describe('runStaticAnalysis', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await makeTempDir();
  });
  afterEach(async () => {
    await fs.remove(tmp);
  });

  it('scans multiple files in parallel', async () => {
    await writeFile(tmp, 'src/a.ts', `function x() {} // empty`);
    await writeFile(tmp, 'src/b.ts', `// TODO\nconst y = 1;`);
    await writeFile(tmp, 'src/c.ts', `export const PI = 3.14;`);

    const reports = await runStaticAnalysis(tmp, ['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(reports).toHaveLength(3);
    expect(reports[0].violations.length).toBeGreaterThan(0);
    expect(reports[1].violations.length).toBeGreaterThan(0);
    expect(reports[2].violations).toEqual([]);
  });

  it('returns clean report for missing files', async () => {
    const reports = await runStaticAnalysis(tmp, ['does/not/exist.ts']);
    expect(reports[0].violations).toEqual([]);
  });
});

describe('runReview end-to-end', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await makeTempDir();
  });
  afterEach(async () => {
    await fs.remove(tmp);
  });

  it('parses spec, scans listed files, fails on errors', async () => {
    await writeFile(
      tmp,
      'DARE/EXECUTION/task-001.md',
      `
## 3. ARQUIVOS

| Ação | Caminho | Descrição |
|------|---------|-----------|
| CRIAR | \`src/foo.ts\` | Foo handler |
`,
    );
    await writeFile(tmp, 'src/foo.ts', `function foo() { throw new Error('not implemented'); }`);

    const report = await runReview('task-001', { projectRoot: tmp });
    expect(report.taskId).toBe('task-001');
    expect(report.filesScanned).toEqual(['src/foo.ts']);
    expect(report.failed).toBe(true);
    expect(report.totals.errors).toBeGreaterThan(0);
  });

  it('passes when nothing is found', async () => {
    await writeFile(
      tmp,
      'DARE/EXECUTION/task-002.md',
      `| MODIFICAR | \`src/clean.ts\` | x |`,
    );
    await writeFile(tmp, 'src/clean.ts', `export const X = 1;`);

    const report = await runReview('task-002', { projectRoot: tmp });
    expect(report.failed).toBe(false);
    expect(report.totals.errors).toBe(0);
  });

  it('merges --from-agent semantic verdict', async () => {
    await writeFile(
      tmp,
      'DARE/EXECUTION/task-003.md',
      `| MODIFICAR | \`src/clean.ts\` | x |`,
    );
    await writeFile(tmp, 'src/clean.ts', `export const X = 1;`);
    await writeFile(
      tmp,
      'verdict.json',
      JSON.stringify({
        passed: false,
        unmetCriteria: ['Missing password regex'],
        notes: 'Stub-free but spec not satisfied',
      }),
    );

    const report = await runReview('task-003', {
      projectRoot: tmp,
      fromAgent: path.join(tmp, 'verdict.json'),
    });
    expect(report.semantic?.passed).toBe(false);
    expect(report.failed).toBe(true); // semantic failure flips it
  });

  it('returns empty report when no files can be resolved', async () => {
    const report = await runReview('task-ghost', { projectRoot: tmp });
    expect(report.filesScanned).toHaveLength(0);
    expect(report.failed).toBe(false);
  });
});
