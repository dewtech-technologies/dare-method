import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { detectPatterns } from '../utils/pattern-detector.js';
import { renderPatternsSkeleton } from '../utils/pattern-facts.js';
import {
  buildDesignQuestionnaire,
  buildBlueprintQuestionnaire,
} from '../utils/design-questionnaire.js';
import { JsonGraph } from '../graphrag/json-graph.js';
import { ingestPatterns } from '../graphrag/pattern-ingest.js';
import type { DnaFacts } from '../utils/dna-detector.js';

async function writeBrownfieldFixture(root: string, eol: '\n' | '\r\n' = '\n'): Promise<void> {
  const w = async (rel: string, body: string) => {
    const full = path.join(root, rel);
    await fs.ensureDir(path.dirname(full));
    await fs.writeFile(full, body.split('\n').join(eol));
  };
  await w('src/auth/auth.service.ts', 'export class AuthService {}');
  await w('src/auth/auth.controller.ts', 'import { AuthService } from "./auth.service";');
  await w('src/users/users.service.ts', 'export class UsersService {}');
  await w('src/users/users.controller.ts', 'import { UsersService } from "./users.service";');
  await w('src/index.ts', 'export * from "./auth/auth.service";');
  await w('src/validate.ts', 'import { z } from "zod";\nexport const s = z.string();');
  await w('.env', 'SUPER_SECRET_TOKEN=must-not-leak-xyz');
  await w('.env.local', 'API_KEY=also-secret');
}

const dna: DnaFacts = {
  generatedAt: '2026-06-07T12:00:00.000Z',
  fileInventorySource: 'module-detector',
  tooling: { linters: [], formatters: [] },
  naming: [],
  architecture: { detectedLayers: [], guess: '' },
  testing: { testFiles: 0, prodFiles: 6, ratio: 0 },
  libraries: { orm: 'prisma' },
  commits: null,
};

describe('patterns integrated suite (O-01…O-07)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'patterns-int-'));
    await writeBrownfieldFixture(projectRoot);
  });

  afterEach(async () => {
    await fs.remove(projectRoot).catch(() => undefined);
  });

  it('O-01: ≥90% of patterns have evidence.length>=1', async () => {
    const facts = await detectPatterns(projectRoot, dna);
    expect(facts.patterns.length).toBeGreaterThan(0);
    const withEvidence = facts.patterns.filter((p) => p.evidence.length >= 1);
    expect(withEvidence.length / facts.patterns.length).toBeGreaterThanOrEqual(0.9);
  });

  it('O-03: ingestPatterns enables graph query --type pattern', async () => {
    const facts = await detectPatterns(projectRoot, dna);
    const graph = new JsonGraph(path.join(projectRoot, '.dare', 'graph.json'));
    await graph.init();
    ingestPatterns(graph, facts, projectRoot);
    const patternNodes = graph.queryNodes('pattern', 100);
    expect(patternNodes.length).toBeGreaterThan(0);
    graph.close();
  });

  it('O-07: gaps appear in PATTERNS.md skeleton and questionnaire', async () => {
    const facts = await detectPatterns(projectRoot, dna);
    const md = renderPatternsSkeleton(facts);
    expect(md).toContain('## ⚠️ Incertezas');

    const emptyPatterns = { ...facts, patterns: [] };
    const q = buildDesignQuestionnaire(dna, emptyPatterns);
    expect(q.questions.some((x) => x.kind === 'gap')).toBe(true);
    expect(buildBlueprintQuestionnaire(facts).questions.every((x) => x.anchoredOn.length >= 1)).toBe(
      true,
    );
  });

  it('RNF-02: detectPatterns and renderPatternsSkeleton are byte-stable', async () => {
    const a = await detectPatterns(projectRoot, dna);
    const b = await detectPatterns(projectRoot, dna);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const md1 = renderPatternsSkeleton(a);
    const md2 = renderPatternsSkeleton(a);
    expect(md1).toBe(md2);
  });

  it('RNF-05: CRLF and LF fixtures produce identical JSON', async () => {
    const lfRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'patterns-lf-'));
    const crlfRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'patterns-crlf-'));
    try {
      await writeBrownfieldFixture(lfRoot, '\n');
      await writeBrownfieldFixture(crlfRoot, '\r\n');
      const lf = await detectPatterns(lfRoot, dna);
      const crlf = await detectPatterns(crlfRoot, dna);
      expect(JSON.stringify(lf)).toBe(JSON.stringify(crlf));
    } finally {
      await fs.remove(lfRoot).catch(() => undefined);
      await fs.remove(crlfRoot).catch(() => undefined);
    }
  });

  it('RS-02/RS-04: .env secrets never appear in facts or questionnaire', async () => {
    const facts = await detectPatterns(projectRoot, dna);
    const blob = JSON.stringify(facts) + renderPatternsSkeleton(facts);
    const q = buildDesignQuestionnaire(dna, facts);
    const qBlob = JSON.stringify(q);
    expect(blob).not.toContain('SUPER_SECRET_TOKEN');
    expect(blob).not.toContain('must-not-leak');
    expect(blob).not.toMatch(/\.env/);
    expect(qBlob).not.toContain('SUPER_SECRET_TOKEN');
  });
});
