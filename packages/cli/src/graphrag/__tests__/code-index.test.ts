import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractSymbolsFromFile,
  extractSymbolsFromPaths,
  toQualifiedName,
} from '../code-index.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'code-index');

describe('code-index', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'code-index-'));
    for (const name of await fs.promises.readdir(fixturesDir)) {
      if (name.endsWith('.json')) continue;
      await fs.promises.copyFile(path.join(fixturesDir, name), path.join(projectRoot, name));
    }
  });

  afterEach(async () => {
    await fs.promises.rm(projectRoot, { recursive: true, force: true });
  });
  it('toQualifiedName normalizes posix paths', () => {
    expect(toQualifiedName('src\\math.ts', 'add')).toBe('src/math.ts::add');
  });

  it('should_extract_ts_function_and_class', () => {
    const syms = extractSymbolsFromFile(path.join(projectRoot, 'sample.ts'), projectRoot);
    const names = syms.map((s) => s.qualifiedName);
    expect(names).toContain('sample.ts::add');
    expect(names).toContain('sample.ts::Calc');
    expect(names).toContain('sample.ts::multiply');
    expect(names).not.toContain('sample.ts::fake');
  });

  it('should_extract_python_def_and_class_top_level', () => {
    const syms = extractSymbolsFromFile(path.join(projectRoot, 'sample.py'), projectRoot);
    const names = syms.map((s) => s.qualifiedName);
    expect(names).toContain('sample.py::top_level');
    expect(names).toContain('sample.py::Widget');
    expect(names).toContain('sample.py::render');
  });

  it('should_extract_go_func_and_receiver_method', () => {
    const syms = extractSymbolsFromFile(path.join(projectRoot, 'sample.go'), projectRoot);
    const names = syms.map((s) => s.qualifiedName);
    expect(names).toContain('sample.go::TopLevel');
    expect(names).toContain('sample.go::Handle');
  });

  it('should_extract_rust_pub_fn', () => {
    const syms = extractSymbolsFromFile(path.join(projectRoot, 'sample.rs'), projectRoot);
    const names = syms.map((s) => s.qualifiedName);
    expect(names).toContain('sample.rs::compute');
    expect(names).toContain('sample.rs::fetch_data');
  });

  it('should_skip_test_files', async () => {
    const testFile = path.join(projectRoot, 'foo.test.ts');
    await fs.promises.writeFile(testFile, 'export function secret() {}');
    expect(extractSymbolsFromFile(testFile, projectRoot)).toEqual([]);
  });

  it('should_skip_symbol_inside_string_literal', () => {
    const syms = extractSymbolsFromFile(path.join(projectRoot, 'sample.ts'), projectRoot);
    expect(syms.some((s) => s.symbol === 'fake')).toBe(false);
  });

  it('should_be_deterministic_snapshot', () => {
    const paths = ['sample.ts', 'sample.py', 'sample.go', 'sample.rs', 'sample.php'];
    const syms = extractSymbolsFromPaths(paths, projectRoot);
    expect(syms).toMatchSnapshot();
  });

  it('meta O-01: extracts >=90% expected top-level symbols', () => {
    const expected = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'multi-lang-expected.json'), 'utf8'),
    ) as { expectedSymbols: string[] };
    const paths = ['sample.ts', 'sample.py', 'sample.go', 'sample.rs', 'sample.php'];
    const syms = extractSymbolsFromPaths(paths, projectRoot);
    const found = new Set(syms.map((s) => s.qualifiedName));
    const hits = expected.expectedSymbols.filter((q) => found.has(q)).length;
    const ratio = hits / expected.expectedSymbols.length;
    expect(ratio).toBeGreaterThanOrEqual(0.9);
  });
});
