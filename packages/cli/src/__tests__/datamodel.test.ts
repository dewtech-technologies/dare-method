import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { extractDataModel, renderErd, renderApiSurface } from '../utils/datamodel.js';

const tmpDirs: string[] = [];

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-dm-'));
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

describe('extractDataModel — Prisma', () => {
  it('parses models, scalar fields, and relations (scalars are not relations)', async () => {
    const root = await makeProject({
      'prisma/schema.prisma': `model User {\n  id Int @id\n  email String\n  posts Post[]\n}\nmodel Post {\n  id Int @id\n  title String\n  author User\n}\n`,
    });
    const dm = await extractDataModel(root);
    const user = dm.entities.find((e) => e.name === 'User')!;
    expect(user.fields.map((f) => f.name)).toEqual(['id', 'email']); // Int/String are scalars
    expect(user.relations).toContainEqual({ to: 'Post', kind: 'has-many' });
    const post = dm.entities.find((e) => e.name === 'Post')!;
    expect(post.relations.some((r) => r.to === 'User')).toBe(true);
  });
});

describe('extractDataModel — SQL', () => {
  it('parses CREATE TABLE columns and FOREIGN KEY references', async () => {
    const root = await makeProject({
      'migrations/001.sql': `CREATE TABLE orders (\n  id INT PRIMARY KEY,\n  user_id INT,\n  total DECIMAL,\n  FOREIGN KEY (user_id) REFERENCES users\n);`,
    });
    const dm = await extractDataModel(root);
    const orders = dm.entities.find((e) => e.name === 'orders')!;
    expect(orders.fields.map((f) => f.name)).toEqual(['id', 'user_id', 'total']);
    expect(orders.relations).toContainEqual({ to: 'users', kind: 'references' });
    expect(orders.source).toMatch(/001\.sql:1/);
  });
});

describe('extractDataModel — endpoints', () => {
  it('parses routes across frameworks with source refs', async () => {
    const root = await makeProject({
      'src/routes.ts': `router.get('/users', h);\nrouter.post('/orders', h);\n@Get('/health')\n`,
      'app/routes.php': `Route::get('/ping', 'C@m');\n`,
    });
    const dm = await extractDataModel(root);
    const keys = dm.endpoints.map((e) => `${e.method} ${e.route}`);
    expect(keys).toContain('GET /users');
    expect(keys).toContain('POST /orders');
    expect(keys).toContain('GET /health');
    expect(keys).toContain('GET /ping');
  });
});

describe('renderErd / renderApiSurface', () => {
  it('renders a Mermaid erDiagram with entities and relations', async () => {
    const root = await makeProject({
      'prisma/schema.prisma': `model User {\n  id Int @id\n  posts Post[]\n}\nmodel Post {\n  id Int @id\n}\n`,
    });
    const dm = await extractDataModel(root);
    const md = renderErd(dm, '2026-01-01T00:00:00.000Z');
    expect(md).toContain('erDiagram');
    expect(md).toContain('USER ||--o{ POST');
    expect(md).toMatch(/\| User \| /);
  });

  it('renders an empty-state ERD gracefully', async () => {
    const root = await makeProject({ 'src/x.ts': 'export const x = 1;\n' });
    const dm = await extractDataModel(root);
    expect(renderErd(dm, 'now')).toContain('nenhuma entidade detectada');
    expect(renderApiSurface(dm, 'now')).toContain('nenhum endpoint detectado');
  });
});
