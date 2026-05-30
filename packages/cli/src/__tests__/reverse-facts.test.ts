import { describe, it, expect } from 'vitest';
import type { DetectedProject } from '../utils/project-detector.js';
import type { ModuleGraph } from '../utils/module-detector.js';
import {
  buildFacts,
  renderIdeiaSkeleton,
  renderModuleSpecSkeleton,
  renderArchitectureExcalidraw,
  moduleSpecFilename,
} from '../utils/reverse-facts.js';

const detected: DetectedProject = {
  name: 'demo',
  structure: 'backend',
  backend: 'node-nestjs',
  hasDare: false,
  hasClaudeCode: false,
  confidence: 'high',
  evidence: ['package.json found (name: demo)'],
};

const graph: ModuleGraph = {
  root: '/tmp/demo',
  strategy: 'src-subdirs',
  modules: [
    {
      id: 'src-auth', name: 'auth', path: 'src/auth',
      files: ['src/auth/login.ts'], fileCount: 1, testFileCount: 0,
      loc: 40, size: 'LOW', languages: ['.ts'], depends_on: ['src-users'],
    },
    {
      id: 'src-users', name: 'users', path: 'src/users',
      files: ['src/users/user.ts'], fileCount: 1, testFileCount: 0,
      loc: 20, size: 'LOW', languages: ['.ts'], depends_on: [],
    },
  ],
};

const facts = () => buildFacts(detected, graph, '2026-01-01T00:00:00.000Z');

describe('buildFacts', () => {
  it('aggregates summary totals across modules', () => {
    const f = facts();
    expect(f.summary.moduleCount).toBe(2);
    expect(f.summary.totalFiles).toBe(2);
    expect(f.summary.totalLoc).toBe(60);
    expect(f.project.backend).toBe('node-nestjs');
  });
});

describe('moduleSpecFilename', () => {
  it('produces zero-padded numbered filenames', () => {
    expect(moduleSpecFilename(0, graph.modules[0])).toBe('module-01-src-auth.md');
    expect(moduleSpecFilename(1, graph.modules[1])).toBe('module-02-src-users.md');
  });
});

describe('renderIdeiaSkeleton', () => {
  it('embeds the mermaid module map, a table, and AGENT placeholders', () => {
    const md = renderIdeiaSkeleton(facts(), true);
    expect(md).toContain('# IDEIA — demo');
    expect(md).toContain('```mermaid');
    expect(md).toMatch(/style src_auth fill:/); // inline module-map styling
    expect(md).toContain('| auth | `src/auth` |'); // module table row
    expect(md).toContain('<!-- AGENT'); // semantic placeholders remain for the skill
    expect(md).toContain('[module-01-src-auth.md](./REVERSE/module-01-src-auth.md)');
  });

  it('adjusts the next-steps line when excalidraw is skipped', () => {
    expect(renderIdeiaSkeleton(facts(), false)).toContain('--no-excalidraw');
  });
});

describe('renderModuleSpecSkeleton', () => {
  it('renders deterministic facts and a sequenceDiagram placeholder', () => {
    const md = renderModuleSpecSkeleton(graph.modules[0], 0, 2, '2026-01-01T00:00:00.000Z');
    expect(md).toContain('# Módulo: auth');
    expect(md).toContain('`src/auth`');
    expect(md).toContain('sequenceDiagram');
    expect(md).toContain('src-users'); // depends_on surfaced
  });
});

describe('renderArchitectureExcalidraw', () => {
  it('produces valid Excalidraw JSON tagged with the reverse source', () => {
    const json = renderArchitectureExcalidraw(facts());
    const data = JSON.parse(json);
    expect(data.type).toBe('excalidraw');
    expect(data.source).toBe('dare-reverse');
    // 2 module rectangles + 1 dependency arrow
    expect(data.elements.filter((e: { type: string }) => e.type === 'rectangle')).toHaveLength(2);
    expect(data.elements.filter((e: { type: string }) => e.type === 'arrow')).toHaveLength(1);
  });
});
