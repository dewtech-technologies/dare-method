import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';
import { detectPatternsDetailed } from '../../../utils/pattern-detector.js';
import { initAstLoader } from '../../loader.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const tmpDirs: string[] = [];

async function projectWith(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-pat-ast-'));
  tmpDirs.push(dir);
  for (const [name, rel] of Object.entries(files)) {
    await fs.ensureDir(path.dirname(path.join(dir, rel)));
    await fs.copy(path.join(FIXTURES, name), path.join(dir, rel));
  }
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length) await fs.remove(tmpDirs.pop()!);
});

describe('patterns-ast', () => {
  it('F-P01: controller-service from multi-line constructor', async () => {
    const status = await initAstLoader();
    if (!status.available) return;

    const root = await projectWith({ 'nest-controller-di.ts': 'src/users.controller.ts' });
    const { facts } = await detectPatternsDetailed(root, null, { ast: true });
    expect(facts.patterns.some((p) => p.id === 'call-idiom:controller-service')).toBe(true);
  });

  it('F-P02: z.object validation idiom', async () => {
    const status = await initAstLoader();
    if (!status.available) return;

    const root = await projectWith({ 'zod-object.ts': 'src/schema.ts' });
    const { facts } = await detectPatternsDetailed(root, null, { ast: true });
    expect(facts.patterns.some((p) => p.id === 'call-idiom:schema-validation')).toBe(true);
  });

  it('F-P03: nest-module structural idiom', async () => {
    const status = await initAstLoader();
    if (!status.available) return;

    const root = await projectWith({ 'nest-module.ts': 'src/app.module.ts' });
    const { facts } = await detectPatternsDetailed(root, null, { ast: true });
    expect(facts.patterns.some((p) => p.id === 'structural-idiom:nest-module')).toBe(true);
  });
});
