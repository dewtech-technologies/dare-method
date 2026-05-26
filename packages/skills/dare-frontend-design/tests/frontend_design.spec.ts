/**
 * dare-frontend-design — test suite
 * 35+ tests covering linter, generator, and metrics.
 * License: MIT
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import { FrontendLinter } from '../linter.js';
import { FrontendGenerator } from '../generator.js';
import { collectFrontendMetrics } from '../metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dare-fe-'));
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(dir: string, relPath: string, content: string): string {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

function makeLargeComponent(lineCount: number): string {
  const lines = ['import React from "react";', '', 'export function BigComponent() {', '  return (', '    <div>'];
  for (let i = 0; i < lineCount - 8; i++) {
    lines.push(`      <p>Line ${i}</p>`);
  }
  lines.push('    </div>', '  );', '}');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// FrontendLinter — component-too-large
// ---------------------------------------------------------------------------

describe('FrontendLinter — component-too-large', () => {
  let tmpDir: string;
  let linter: FrontendLinter;

  beforeEach(() => {
    tmpDir = createTempDir();
    linter = new FrontendLinter();
  });

  afterEach(() => removeTempDir(tmpDir));

  it('passes for a small component (< 300 lines)', () => {
    const content = 'import React from "react";\nexport function Small() { return <div/>; }';
    const file = writeFile(tmpDir, 'Small.tsx', content);
    const violations = linter.lintFile(file);
    expect(violations.filter((v) => v.rule === 'component-too-large')).toHaveLength(0);
  });

  it('flags component with exactly 301 lines', () => {
    const file = writeFile(tmpDir, 'Big.tsx', makeLargeComponent(301));
    const violations = linter.lintFile(file);
    const large = violations.filter((v) => v.rule === 'component-too-large');
    expect(large).toHaveLength(1);
    expect(large[0].severity).toBe('error');
    expect(large[0].message).toContain('301 lines');
  });

  it('does not flag non-component files (.ts)', () => {
    const file = writeFile(tmpDir, 'utils.ts', makeLargeComponent(500));
    const violations = linter.lintFile(file);
    expect(violations).toHaveLength(0);
  });

  it('lintDirectory finds violations in nested .tsx files', () => {
    writeFile(tmpDir, 'src/Big.tsx', makeLargeComponent(400));
    writeFile(tmpDir, 'src/Small.tsx', 'export function S() { return null; }');
    const result = linter.lintDirectory(tmpDir);
    expect(result.filesChecked).toBe(2);
    expect(result.violations.some((v) => v.rule === 'component-too-large')).toBe(true);
    expect(result.pass).toBe(false);
  });

  it('lintDirectory passes when all components are small', () => {
    writeFile(tmpDir, 'A.tsx', 'export function A() { return null; }');
    writeFile(tmpDir, 'B.tsx', 'export function B() { return null; }');
    const result = linter.lintDirectory(tmpDir);
    expect(result.pass).toBe(true);
  });

  it('lintFiles returns 0 violations for non-component files', () => {
    const file = writeFile(tmpDir, 'utils.ts', makeLargeComponent(500));
    const result = linter.lintFiles([file]);
    expect(result.filesChecked).toBe(0);
    expect(result.violations).toHaveLength(0);
  });

  it('returns empty for non-existent file', () => {
    const violations = linter.lintFile('/tmp/nonexistent.tsx');
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FrontendLinter — fetch-in-jsx
// ---------------------------------------------------------------------------

describe('FrontendLinter — fetch-in-jsx', () => {
  let tmpDir: string;
  let linter: FrontendLinter;

  beforeEach(() => {
    tmpDir = createTempDir();
    linter = new FrontendLinter();
  });

  afterEach(() => removeTempDir(tmpDir));

  it('flags fetch() in a non-hook .tsx file with JSX context', () => {
    const content = `import React from 'react';

export function UserCard() {
  const data = fetch('/api/users').then(r => r.json());
  return <div>{JSON.stringify(data)}</div>;
}`;
    const file = writeFile(tmpDir, 'UserCard.tsx', content);
    const violations = linter.lintFile(file);
    const fetchViolations = violations.filter((v) => v.rule === 'fetch-in-jsx');
    expect(fetchViolations.length).toBeGreaterThan(0);
  });

  it('does NOT flag fetch() in a useXxx hook file', () => {
    const content = `export function useUserData(id: string) {
  const data = fetch(\`/api/users/\${id}\`).then(r => r.json());
  return data;
}`;
    const file = writeFile(tmpDir, 'useUserData.ts', content);
    const violations = linter.lintFile(file);
    const fetchViolations = violations.filter((v) => v.rule === 'fetch-in-jsx');
    expect(fetchViolations).toHaveLength(0);
  });

  it('does NOT flag axios in a useXxx composable .ts file', () => {
    const content = `export function useApi() {
  return axios.get('/api').then(r => r.data);
}`;
    const file = writeFile(tmpDir, 'useApi.ts', content);
    const violations = linter.lintFile(file);
    expect(violations.filter((v) => v.rule === 'fetch-in-jsx')).toHaveLength(0);
  });

  it('flags fetch in Vue <template> section', () => {
    const content = `<template>
  <div>{{ fetch('/api') }}</div>
</template>

<script setup lang="ts">
</script>`;
    const file = writeFile(tmpDir, 'Bad.vue', content);
    const violations = linter.lintFile(file);
    // template fetch is flagged
    expect(violations.some((v) => v.rule === 'fetch-in-jsx')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FrontendGenerator — React
// ---------------------------------------------------------------------------

describe('FrontendGenerator — React', () => {
  let tmpDir: string;
  let generator: FrontendGenerator;

  beforeEach(() => {
    tmpDir = createTempDir();
    generator = new FrontendGenerator();
  });

  afterEach(() => removeTempDir(tmpDir));

  it('creates React scaffold with all expected directories', () => {
    const result = generator.scaffold({ framework: 'react', outputDir: tmpDir });
    const expectedDirs = ['components', 'hooks', 'pages', 'store', 'api'];
    for (const dir of expectedDirs) {
      expect(result.dirsCreated.some((d) => d.includes(dir))).toBe(true);
    }
  });

  it('creates ErrorBoundary.tsx', () => {
    const result = generator.scaffold({ framework: 'react', outputDir: tmpDir });
    expect(result.filesCreated.some((f) => f.includes('ErrorBoundary.tsx'))).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, 'src/components/ErrorBoundary.tsx'), 'utf-8');
    expect(content).toContain('ErrorBoundary');
    expect(content).toContain('hasError');
  });

  it('creates useFetch.ts hook', () => {
    generator.scaffold({ framework: 'react', outputDir: tmpDir });
    const content = fs.readFileSync(path.join(tmpDir, 'src/hooks/useFetch.ts'), 'utf-8');
    expect(content).toContain('useFetch');
    expect(content).toContain("status: 'loading'");
  });

  it('creates NotFoundPage.tsx with ErrorBoundary import', () => {
    generator.scaffold({ framework: 'react', outputDir: tmpDir });
    const content = fs.readFileSync(path.join(tmpDir, 'src/pages/NotFoundPage.tsx'), 'utf-8');
    expect(content).toContain('ErrorBoundary');
    expect(content).toContain('404');
  });

  it('creates API client with auth headers', () => {
    generator.scaffold({ framework: 'react', outputDir: tmpDir });
    const content = fs.readFileSync(path.join(tmpDir, 'src/api/client.ts'), 'utf-8');
    expect(content).toContain('apiGet');
    expect(content).toContain('Authorization');
  });

  it('creates App.tsx with ErrorBoundary', () => {
    generator.scaffold({ framework: 'react', outputDir: tmpDir, projectName: 'MyApp' });
    const content = fs.readFileSync(path.join(tmpDir, 'src/App.tsx'), 'utf-8');
    expect(content).toContain('ErrorBoundary');
    expect(content).toContain('MyApp');
  });

  it('returns framework in result', () => {
    const result = generator.scaffold({ framework: 'react', outputDir: tmpDir });
    expect(result.framework).toBe('react');
  });

  it('creates LoadingSpinner.tsx', () => {
    generator.scaffold({ framework: 'react', outputDir: tmpDir });
    const content = fs.readFileSync(path.join(tmpDir, 'src/components/LoadingSpinner.tsx'), 'utf-8');
    expect(content).toContain('LoadingSpinner');
    expect(content).toContain('aria-label');
  });
});

// ---------------------------------------------------------------------------
// FrontendGenerator — Vue
// ---------------------------------------------------------------------------

describe('FrontendGenerator — Vue', () => {
  let tmpDir: string;
  let generator: FrontendGenerator;

  beforeEach(() => {
    tmpDir = createTempDir();
    generator = new FrontendGenerator();
  });

  afterEach(() => removeTempDir(tmpDir));

  it('creates Vue scaffold with all expected directories', () => {
    const result = generator.scaffold({ framework: 'vue', outputDir: tmpDir });
    const expectedDirs = ['components', 'composables', 'pages', 'stores', 'api'];
    for (const dir of expectedDirs) {
      expect(result.dirsCreated.some((d) => d.includes(dir))).toBe(true);
    }
  });

  it('creates ErrorBoundary.vue with onErrorCaptured', () => {
    generator.scaffold({ framework: 'vue', outputDir: tmpDir });
    const content = fs.readFileSync(path.join(tmpDir, 'src/components/ErrorBoundary.vue'), 'utf-8');
    expect(content).toContain('onErrorCaptured');
    expect(content).toContain('hasError');
  });

  it('creates useFetch.ts composable', () => {
    generator.scaffold({ framework: 'vue', outputDir: tmpDir });
    const content = fs.readFileSync(path.join(tmpDir, 'src/composables/useFetch.ts'), 'utf-8');
    expect(content).toContain('useFetch');
    expect(content).toContain('watchEffect');
  });

  it('creates NotFoundPage.vue with ErrorBoundary', () => {
    generator.scaffold({ framework: 'vue', outputDir: tmpDir });
    const content = fs.readFileSync(path.join(tmpDir, 'src/pages/NotFoundPage.vue'), 'utf-8');
    expect(content).toContain('ErrorBoundary');
    expect(content).toContain('404');
  });

  it('creates Pinia store', () => {
    generator.scaffold({ framework: 'vue', outputDir: tmpDir, projectName: 'MyVueApp' });
    const content = fs.readFileSync(path.join(tmpDir, 'src/stores/app.ts'), 'utf-8');
    expect(content).toContain('defineStore');
    expect(content).toContain('MyVueApp');
  });

  it('throws for unknown framework', () => {
    expect(() =>
      generator.scaffold({ framework: 'svelte' as never, outputDir: tmpDir })
    ).toThrow('unknown framework');
  });
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe('collectFrontendMetrics', () => {
  it('M-01 passes when no large components', () => {
    const results = collectFrontendMetrics({
      largeComponentCount: 0,
      totalComponentsChecked: 10,
      inlineFetchCount: 0,
      pagesWithErrorBoundary: 3,
      totalPages: 3,
      bundleConfigExists: true,
    });
    expect(results.find((r) => r.id === 'M-01')!.pass).toBe(true);
  });

  it('M-01 fails when large components exist', () => {
    const results = collectFrontendMetrics({
      largeComponentCount: 2,
      totalComponentsChecked: 10,
      inlineFetchCount: 0,
      pagesWithErrorBoundary: 3,
      totalPages: 3,
      bundleConfigExists: true,
    });
    const m01 = results.find((r) => r.id === 'M-01')!;
    expect(m01.pass).toBe(false);
    expect(m01.detail).toContain('2/10');
  });

  it('M-02 passes with 0 inline fetch', () => {
    const results = collectFrontendMetrics({
      largeComponentCount: 0,
      totalComponentsChecked: 5,
      inlineFetchCount: 0,
      pagesWithErrorBoundary: 2,
      totalPages: 2,
      bundleConfigExists: true,
    });
    expect(results.find((r) => r.id === 'M-02')!.pass).toBe(true);
  });

  it('M-02 fails with inline fetch', () => {
    const results = collectFrontendMetrics({
      largeComponentCount: 0,
      totalComponentsChecked: 5,
      inlineFetchCount: 3,
      pagesWithErrorBoundary: 2,
      totalPages: 2,
      bundleConfigExists: true,
    });
    const m02 = results.find((r) => r.id === 'M-02')!;
    expect(m02.pass).toBe(false);
    expect(m02.detail).toContain('3 inline');
  });

  it('M-03 passes when all pages have error boundaries', () => {
    const results = collectFrontendMetrics({
      largeComponentCount: 0,
      totalComponentsChecked: 5,
      inlineFetchCount: 0,
      pagesWithErrorBoundary: 4,
      totalPages: 4,
      bundleConfigExists: true,
    });
    expect(results.find((r) => r.id === 'M-03')!.pass).toBe(true);
  });

  it('M-03 fails when some pages missing error boundary', () => {
    const results = collectFrontendMetrics({
      largeComponentCount: 0,
      totalComponentsChecked: 5,
      inlineFetchCount: 0,
      pagesWithErrorBoundary: 2,
      totalPages: 4,
      bundleConfigExists: true,
    });
    expect(results.find((r) => r.id === 'M-03')!.pass).toBe(false);
  });

  it('M-04 passes when bundle config exists', () => {
    const results = collectFrontendMetrics({
      largeComponentCount: 0,
      totalComponentsChecked: 3,
      inlineFetchCount: 0,
      pagesWithErrorBoundary: 1,
      totalPages: 1,
      bundleConfigExists: true,
    });
    expect(results.find((r) => r.id === 'M-04')!.pass).toBe(true);
  });

  it('M-04 fails when no bundle config', () => {
    const results = collectFrontendMetrics({
      largeComponentCount: 0,
      totalComponentsChecked: 3,
      inlineFetchCount: 0,
      pagesWithErrorBoundary: 1,
      totalPages: 1,
      bundleConfigExists: false,
    });
    expect(results.find((r) => r.id === 'M-04')!.pass).toBe(false);
  });

  it('returns exactly 4 metrics', () => {
    const results = collectFrontendMetrics({
      largeComponentCount: 0,
      totalComponentsChecked: 0,
      inlineFetchCount: 0,
      pagesWithErrorBoundary: 0,
      totalPages: 0,
      bundleConfigExists: true,
    });
    expect(results).toHaveLength(4);
  });

  it('all pass with ideal config', () => {
    const results = collectFrontendMetrics({
      largeComponentCount: 0,
      totalComponentsChecked: 10,
      inlineFetchCount: 0,
      pagesWithErrorBoundary: 5,
      totalPages: 5,
      bundleConfigExists: true,
    });
    for (const r of results) {
      expect(r.pass).toBe(true);
    }
  });
});
