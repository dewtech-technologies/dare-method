import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';
import { detectDnaDetailed } from '../../../utils/dna-detector.js';
import { initAstLoader } from '../../loader.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const tmpDirs: string[] = [];

async function projectWith(name: string, rel: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-dna-ast-'));
  tmpDirs.push(dir);
  await fs.ensureDir(path.dirname(path.join(dir, rel)));
  await fs.copy(path.join(FIXTURES, name), path.join(dir, rel));
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length) await fs.remove(tmpDirs.pop()!);
});

describe('dna-ast', () => {
  it('F-D01: detects nestjs-module layer from multi-line @Module', async () => {
    const status = await initAstLoader();
    if (!status.available) return;

    const root = await projectWith('nest-module.ts', 'src/app.module.ts');
    const { facts } = await detectDnaDetailed(root, new Date().toISOString(), { ast: true });
    expect(facts.architecture.detectedLayers).toContain('nestjs-module');
  });

  it('F-D02: detects TypeORM from multi-line import', async () => {
    const status = await initAstLoader();
    if (!status.available) return;

    const root = await projectWith('typeorm-import.ts', 'src/entity.ts');
    const { facts } = await detectDnaDetailed(root, new Date().toISOString(), { ast: true });
    expect(facts.libraries.orm).toBe('TypeORM');
  });

  it('F-D03: detects constructor DI pattern', async () => {
    const status = await initAstLoader();
    if (!status.available) return;

    const root = await projectWith('nest-controller-di.ts', 'src/users.controller.ts');
    const { facts, extraction } = await detectDnaDetailed(root, new Date().toISOString(), { ast: true });
    expect(extraction?.mode).toBe('hybrid');
    expect(facts.architecture.guess).toMatch(/NestJS|DI|injection/i);
  });
});
