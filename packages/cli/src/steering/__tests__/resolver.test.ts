import { describe, it, expect } from 'vitest';
import { resolveSteeringForFile } from '../resolver.js';
import type { SteeringFile } from '../types.js';

function makeFile(
  path: string,
  opts: {
    isBase?: boolean;
    scope?: 'project' | 'glob';
    glob?: string;
    priority?: number;
  },
): SteeringFile {
  const scope = opts.scope ?? (opts.isBase ? 'project' : 'glob');
  return {
    path,
    frontMatter: {
      scope,
      glob: opts.glob,
      priority: opts.priority,
    },
    body: `# ${path}`,
    isBase: opts.isBase ?? false,
  };
}

describe('resolveSteeringForFile', () => {
  const base = makeFile('DARE/PROJECT-DNA.md', { isBase: true, priority: 0 });
  const project = makeFile('.dare/steering/project.md', {
    scope: 'project',
    priority: 0,
  });
  const globAuth = makeFile('.dare/steering/auth.md', {
    scope: 'glob',
    glob: 'src/auth/**',
    priority: 10,
  });
  const globSrc = makeFile('.dare/steering/src.md', {
    scope: 'glob',
    glob: 'src/**',
    priority: 5,
  });

  const files = [globAuth, project, base, globSrc];

  it('orders by bucket then priority for matching file', () => {
    const res = resolveSteeringForFile(files, 'src/auth/login.ts');
    expect(res.blocks.map((b) => b.path)).toEqual([
      'DARE/PROJECT-DNA.md',
      '.dare/steering/project.md',
      '.dare/steering/src.md',
      '.dare/steering/auth.md',
    ]);
    expect(res.blocks[0]!.isBase).toBe(true);
  });

  it('excludes non-matching globs', () => {
    const res = resolveSteeringForFile(files, 'src/other.ts');
    expect(res.blocks.map((b) => b.path)).toEqual([
      'DARE/PROJECT-DNA.md',
      '.dare/steering/project.md',
      '.dare/steering/src.md',
    ]);
  });

  it('breaks ties by path lexicographic order (O-07)', () => {
    const a = makeFile('.dare/steering/a.md', {
      scope: 'glob',
      glob: 'lib/**',
      priority: 1,
    });
    const b = makeFile('.dare/steering/b.md', {
      scope: 'glob',
      glob: 'lib/**',
      priority: 1,
    });
    const res = resolveSteeringForFile([a, b], 'lib/x.ts');
    expect(res.blocks.map((f) => f.path)).toEqual([
      '.dare/steering/a.md',
      '.dare/steering/b.md',
    ]);
  });

  it('produces deterministic block order (ignoring resolvedAt)', () => {
    const r1 = resolveSteeringForFile(files, 'src/auth/login.ts');
    const r2 = resolveSteeringForFile(files, 'src/auth/login.ts');
    expect(r1.blocks.map((b) => b.path)).toEqual(r2.blocks.map((b) => b.path));
    expect(r1.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
