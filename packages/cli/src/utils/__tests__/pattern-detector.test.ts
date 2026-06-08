import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { detectPatterns, PATTERN_RULES } from '../pattern-detector.js';
import type { DnaFacts } from '../dna-detector.js';

async function writeFixture(root: string): Promise<void> {
  await fs.ensureDir(path.join(root, 'src', 'auth'));
  await fs.ensureDir(path.join(root, 'src', 'users'));
  const files: Array<[string, string]> = [
    ['src/auth/auth.service.ts', 'export class AuthService {}'],
    ['src/auth/auth.controller.ts', 'import { AuthService } from "./auth.service";'],
    ['src/users/users.service.ts', 'export class UsersService {}'],
    ['src/users/users.controller.ts', 'import { UsersService } from "./users.service";'],
    ['src/index.ts', 'export * from "./auth/auth.service";\nexport * from "./users/users.service";'],
    ['src/validate.ts', 'import { z } from "zod";\nexport const s = z.string();'],
    ['src/parse.ts', 'import { z } from "zod";\nexport const s = z.number();'],
    ['src/db.ts', 'import { PrismaClient } from "@prisma/client";\nexport const db = new PrismaClient();'],
    ['src/repo.ts', 'import { PrismaClient } from "@prisma/client";\nexport const db2 = new PrismaClient();'],
  ];
  for (const [rel, body] of files) {
    await fs.ensureDir(path.dirname(path.join(root, rel)));
    await fs.writeFile(path.join(root, rel), body);
  }
}

describe('pattern-detector', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pattern-det-'));
    await writeFixture(projectRoot);
  });

  afterEach(async () => {
    await fs.remove(projectRoot).catch(() => undefined);
  });

  const dna: DnaFacts = {
    generatedAt: '2026-06-07T12:00:00.000Z',
    fileInventorySource: 'module-detector',
    tooling: { linters: [], formatters: [] },
    naming: [],
    architecture: { detectedLayers: [], guess: '' },
    testing: { testFiles: 0, prodFiles: 9, ratio: 0 },
    libraries: { orm: 'prisma' },
    commits: null,
  };

  it('exports at least 5 pattern rules covering each PatternKind', () => {
    expect(PATTERN_RULES.length).toBeGreaterThanOrEqual(5);
    const kinds = new Set(PATTERN_RULES.map((r) => r.kind));
    expect(kinds.has('naming-idiom')).toBe(true);
    expect(kinds.has('inferred-layer')).toBe(true);
    expect(kinds.has('structural-idiom')).toBe(true);
    expect(kinds.has('call-idiom')).toBe(true);
    expect(kinds.has('implicit-decision')).toBe(true);
  });

  it('detects naming, call and implicit patterns on fixture', async () => {
    const facts = await detectPatterns(projectRoot, dna);
    expect(facts.patterns.length).toBeGreaterThan(0);
    const kinds = facts.patterns.map((p) => p.kind);
    expect(kinds).toContain('naming-idiom');
    expect(kinds).toContain('call-idiom');
    for (const p of facts.patterns) {
      expect(p.evidence.length).toBeGreaterThanOrEqual(1);
      expect(p.frequency).toBeGreaterThanOrEqual(1);
      expect(p.coverage).toBeGreaterThanOrEqual(0);
      expect(p.coverage).toBeLessThanOrEqual(1);
      expect(p.marker).toBe('confirmed');
    }
  });

  it('is deterministic (same input => identical JSON)', async () => {
    const a = await detectPatterns(projectRoot, dna);
    const b = await detectPatterns(projectRoot, dna);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sorts patterns by kind then id', async () => {
    const facts = await detectPatterns(projectRoot, dna);
    const sorted = [...facts.patterns].sort((x, y) => {
      const k = x.kind.localeCompare(y.kind);
      return k !== 0 ? k : x.id.localeCompare(y.id);
    });
    expect(facts.patterns.map((p) => p.id)).toEqual(sorted.map((p) => p.id));
  });
});
