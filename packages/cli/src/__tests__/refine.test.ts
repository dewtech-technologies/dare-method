import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  analyzeTaskComplexity,
  proposeSplit,
  levelFromScore,
  DEFAULT_THRESHOLDS,
} from '../utils/complexity-analyzer.js';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'dare-refine-test-'));
}

async function writeFile(dir: string, rel: string, content: string): Promise<void> {
  const abs = path.join(dir, rel);
  await fs.ensureDir(path.dirname(abs));
  await fs.writeFile(abs, content);
}

// ── levelFromScore ────────────────────────────────────────────────────────────

describe('levelFromScore', () => {
  it('maps scores to default buckets', () => {
    expect(levelFromScore(0)).toBe('LOW');
    expect(levelFromScore(5)).toBe('LOW');
    expect(levelFromScore(6)).toBe('MED');
    expect(levelFromScore(12)).toBe('MED');
    expect(levelFromScore(13)).toBe('HIGH');
    expect(levelFromScore(20)).toBe('HIGH');
    expect(levelFromScore(21)).toBe('CRITICAL');
    expect(levelFromScore(50)).toBe('CRITICAL');
  });

  it('respects custom thresholds', () => {
    const t = { low: 2, med: 4, high: 6 };
    expect(levelFromScore(2, t)).toBe('LOW');
    expect(levelFromScore(3, t)).toBe('MED');
    expect(levelFromScore(4, t)).toBe('MED');
    expect(levelFromScore(5, t)).toBe('HIGH');
    expect(levelFromScore(6, t)).toBe('HIGH');
    expect(levelFromScore(7, t)).toBe('CRITICAL');
  });
});

// ── analyzeTaskComplexity ─────────────────────────────────────────────────────

describe('analyzeTaskComplexity', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await makeTempDir();
  });
  afterEach(async () => {
    await fs.remove(tmp);
  });

  it('returns no-spec signal when spec is missing', async () => {
    const r = await analyzeTaskComplexity('task-ghost', tmp);
    expect(r).not.toBeNull();
    expect(r?.specPath).toBeNull();
    expect(r?.signals[0].kind).toBe('no-spec');
  });

  it('scores a tiny task as LOW', async () => {
    await writeFile(
      tmp,
      'DARE/EXECUTION/task-001.md',
      `
# Task 001

## 3. Arquivos

| Ação | Caminho |
|------|---------|
| CRIAR | \`src/foo.ts\` |

## 4. Implementação

- [ ] Teste do caminho feliz
`,
    );
    const r = await analyzeTaskComplexity('task-001', tmp);
    expect(r?.level).toBe('LOW');
    expect(r?.recommendsSplit).toBe(false);
  });

  it('scores a big task as HIGH/CRITICAL', async () => {
    await writeFile(
      tmp,
      'DARE/EXECUTION/task-002.md',
      `
# Task 002

> **Complexidade:** HIGH

## 3. Arquivos

| Ação | Caminho |
|------|---------|
| CRIAR | \`src/a.ts\` |
| CRIAR | \`src/b.ts\` |
| CRIAR | \`src/c.ts\` |
| CRIAR | \`src/d.ts\` |
| CRIAR | \`src/e.ts\` |
| CRIAR | \`src/f.ts\` |
| CRIAR | \`src/g.ts\` |
| MODIFICAR | \`tests/a.test.ts\` |

## 4. Implementação

Implementar:
- \`POST /auth/register\`
- \`POST /auth/login\`
- \`POST /auth/refresh\`
- \`POST /auth/logout\`
- \`GET /auth/me\`

Vamos refactor o UserService e migrate o schema para suportar profile_settings.
Precisamos integrate com o serviço externo de email também.

- [ ] Teste do happy path
- [ ] Teste de email inválido
- [ ] Teste de senha fraca
- [ ] Teste de email duplicado
- [ ] Teste de rate limit
- [ ] Teste de refresh expirado
- [ ] Teste de logout idempotente
`,
    );
    const r = await analyzeTaskComplexity('task-002', tmp);
    expect(['HIGH', 'CRITICAL']).toContain(r?.level);
    expect(r?.recommendsSplit).toBe(true);
    // Should attribute weight to multiple signal kinds
    const kinds = r?.signals.map((s) => s.kind) ?? [];
    expect(kinds).toContain('files');
    expect(kinds).toContain('functions');
    expect(kinds).toContain('tests');
    expect(kinds).toContain('keywords');
    expect(kinds).toContain('author-high');
  });

  it('counts depends_on when caller provides it', async () => {
    await writeFile(tmp, 'DARE/EXECUTION/task-003.md', `## 3. Arquivos\n| CRIAR | \`a.ts\` |`);
    const r0 = await analyzeTaskComplexity('task-003', tmp, { dependsOnCount: 0 });
    const r4 = await analyzeTaskComplexity('task-003', tmp, { dependsOnCount: 4 });
    expect((r4?.score ?? 0)).toBeGreaterThan(r0?.score ?? 0);
    expect(r4?.signals.some((s) => s.kind === 'dependencies')).toBe(true);
  });

  it('honors custom thresholds from options', async () => {
    await writeFile(tmp, 'DARE/EXECUTION/task-004.md', `| CRIAR | \`a.ts\` |\n| CRIAR | \`b.ts\` |`);
    const r = await analyzeTaskComplexity('task-004', tmp, {
      thresholds: { low: 0.5, med: 1, high: 1.5 },
    });
    expect(r?.level).toBe('CRITICAL'); // tiny score still tripped by aggressive thresholds
  });
});

// ── proposeSplit ──────────────────────────────────────────────────────────────

describe('proposeSplit', () => {
  it('returns empty proposal when no files listed', () => {
    const p = proposeSplit('task-001', []);
    expect(p.subtasks).toHaveLength(0);
    expect(p.notes).toContain('Nenhum arquivo listado');
  });

  it('groups by top-level directory', () => {
    const p = proposeSplit('task-002', [
      'src/auth/login.ts',
      'src/auth/register.ts',
      'src/users/profile.ts',
      'tests/auth/login.test.ts',
    ]);
    // 3 groups: src/auth, src/users, tests/auth
    expect(p.subtasks).toHaveLength(3);
    expect(p.subtasks.map((s) => s.id)).toEqual([
      'task-002a',
      'task-002b',
      'task-002c',
    ]);
  });

  it('splits overlarge groups by maxFilesPerSubtask', () => {
    const files = Array.from({ length: 9 }, (_, i) => `src/auth/file${i}.ts`);
    const p = proposeSplit('task-003', files, { maxFilesPerSubtask: 3 });
    // 9 files / 3 per chunk = 3 chunks (all from same group)
    expect(p.subtasks).toHaveLength(3);
    expect(p.subtasks.every((s) => s.files.length <= 3)).toBe(true);
  });

  it('assigns sequential letter suffixes', () => {
    const p = proposeSplit('task-004', [
      'a/one.ts',
      'b/one.ts',
      'c/one.ts',
      'd/one.ts',
    ]);
    const ids = p.subtasks.map((s) => s.id);
    expect(ids[0]).toBe('task-004a');
    expect(ids[1]).toBe('task-004b');
    expect(ids[2]).toBe('task-004c');
    expect(ids[3]).toBe('task-004d');
  });

  it('preserves files within each sub-task', () => {
    const p = proposeSplit('task-005', [
      'src/auth/a.ts',
      'src/auth/b.ts',
      'src/users/c.ts',
    ]);
    const authSub = p.subtasks.find((s) => s.title.includes('src/auth'));
    expect(authSub?.files).toEqual(['src/auth/a.ts', 'src/auth/b.ts']);
  });
});
