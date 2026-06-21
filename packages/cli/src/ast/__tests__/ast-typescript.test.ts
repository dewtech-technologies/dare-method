import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';
import { extractDataModelDetailed } from '../../utils/datamodel.js';
import { initAstLoader } from '../loader.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const tmpDirs: string[] = [];

async function projectWith(fixtureName: string, rel = `src/${fixtureName}`): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-ast-ts-'));
  tmpDirs.push(dir);
  await fs.ensureDir(path.dirname(path.join(dir, rel)));
  await fs.copy(path.join(FIXTURES, fixtureName), path.join(dir, rel));
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length) await fs.remove(tmpDirs.pop()!);
});

describe('ast-typescript', () => {
  it('F-01: NestJS @Get() + @Controller prefix on separate lines', async () => {
    const status = await initAstLoader();
    if (!status.available) return;

    const root = await projectWith('nest-multiline.ts', 'src/users.controller.ts');
    const { model } = await extractDataModelDetailed(root, { ast: true });
    const routes = model.endpoints.map((e) => `${e.method} ${e.route}`);
    expect(routes).toContain('GET /api/v1');
  });

  it('F-02: Express router.get multi-line', async () => {
    const status = await initAstLoader();
    if (!status.available) return;

    const root = await projectWith('express-multiline.ts', 'src/routes.ts');
    const { model } = await extractDataModelDetailed(root, { ast: true });
    const routes = model.endpoints.map((e) => `${e.method} ${e.route}`);
    expect(routes).toContain('GET /users/:id');
  });

  it('F-05: TypeORM @Entity with fields', async () => {
    const status = await initAstLoader();
    if (!status.available) return;

    const root = await projectWith('typeorm-entity.ts', 'src/models/product.entity.ts');
    const { model } = await extractDataModelDetailed(root, { ast: true });
    const product = model.entities.find((e) => e.name === 'Product');
    expect(product).toBeDefined();
    expect(product!.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['id', 'name']));
  });
});
