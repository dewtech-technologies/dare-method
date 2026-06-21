import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { extractDataModel, extractDataModelDetailed } from '../utils/datamodel.js';

const tmpDirs: string[] = [];

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-ast-reg-'));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, content);
  }
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length) await fs.remove(tmpDirs.pop()!);
});

describe('brownfield-ast-regression', () => {
  it('default extractDataModel without opts matches regex-only counts (F-06)', async () => {
    const root = await makeProject({
      'prisma/schema.prisma': `model User {\n  id Int @id\n  email String\n}\n`,
      'migrations/001.sql': `CREATE TABLE orders (id INT PRIMARY KEY);\n`,
      'src/routes.ts': `router.get('/users', h);\n`,
    });
    const baseline = await extractDataModel(root);
    const again = await extractDataModel(root, {});
    expect(again.entities.length).toBe(baseline.entities.length);
    expect(again.endpoints.length).toBe(baseline.endpoints.length);
  });

  it('extractDataModelDetailed with ast:true returns extraction meta', async () => {
    const root = await makeProject({ 'src/routes.ts': `router.get('/x', h);\n` });
    const detailed = await extractDataModelDetailed(root, { ast: true });
    expect(detailed.extraction).toBeDefined();
    expect(detailed.extraction!.mode).toBe('hybrid');
    expect(detailed.extraction!.astEnabled).toBe(true);
  });

  it('Prisma + SQL parsers unchanged under hybrid mode', async () => {
    const root = await makeProject({
      'prisma/schema.prisma': `model Item {\n  id Int @id\n}\n`,
      'db/init.sql': `CREATE TABLE stock (id INT PRIMARY KEY, qty INT);\n`,
    });
    const regexOnly = await extractDataModel(root);
    const hybrid = (await extractDataModelDetailed(root, { ast: true })).model;
    expect(hybrid.entities.filter((e) => e.name === 'Item').length).toBeGreaterThan(0);
    expect(hybrid.entities.filter((e) => e.name === 'stock').length).toBeGreaterThan(0);
    expect(regexOnly.entities.length).toBeLessThanOrEqual(hybrid.entities.length);
  });
});
