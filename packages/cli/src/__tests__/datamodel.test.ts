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

// ── Fase 3.1: framework-agnostic por linguagem ──────────────────────────────

describe('framework-agnostic — legacy PHP (no Laravel)', () => {
  it('extracts inline SQL DDL, query-only tables, plain model classes and Slim routes', async () => {
    const root = await makeProject({
      'db/install.php': `<?php\n$pdo->exec("CREATE TABLE clientes (id INT PRIMARY KEY, nome VARCHAR(120));");\n$rows = $pdo->query("SELECT * FROM produtos WHERE ativo = 1");\n`,
      'models/Cliente.php': `<?php\nclass Cliente {\n  public int $id;\n  private ?string $email;\n}\n`,
      'public/index.php': `<?php\n$app->get('/clientes', 'h');\n$app->post('/pedidos', 'h');\n`,
    });
    const dm = await extractDataModel(root);
    const names = dm.entities.map((e) => e.name);
    expect(names).toContain('clientes'); // inline CREATE TABLE
    expect(names).toContain('produtos'); // referenced only in a SELECT
    expect(names).toContain('Cliente'); // plain typed class in models/
    const cliente = dm.entities.find((e) => e.name === 'Cliente')!;
    expect(cliente.fields.map((f) => f.name)).toEqual(['id', 'email']);
    const routes = dm.endpoints.map((e) => `${e.method} ${e.route}`);
    expect(routes).toContain('GET /clientes');
    expect(routes).toContain('POST /pedidos');
  });
});

describe('framework-agnostic — multi-dialect routing', () => {
  it('parses Flask (methods array), Django (any), Go stdlib (any), Rust/Axum and Ruby', async () => {
    const root = await makeProject({
      'app.py': `@app.route('/items', methods=['GET', 'POST'])\ndef items(): pass\n@app.route('/health')\ndef health(): pass\n`,
      'urls.py': `urlpatterns = [\n  path('admin/', admin),\n]\n`,
      'main.go': `mux.HandleFunc("/go-route", handler)\n`,
      'routes.rs': `let app = Router::new().route("/users", get(list_users));\n`,
      'config/routes.rb': `Rails.application.routes.draw do\n  get '/ruby-route', to: 'x#y'\nend\n`,
    });
    const dm = await extractDataModel(root);
    const routes = dm.endpoints.map((e) => `${e.method} ${e.route}`);
    expect(routes).toContain('GET /items');
    expect(routes).toContain('POST /items'); // expanded from methods array
    expect(routes).toContain('GET /health'); // Flask route without methods → GET
    expect(routes).toContain('ANY admin/'); // Django path (method-less)
    expect(routes).toContain('ANY /go-route'); // Go stdlib HandleFunc
    expect(routes).toContain('GET /users'); // Rust/Axum (path then method)
    expect(routes).toContain('GET /ruby-route'); // Rails/Sinatra
  });
});

describe('framework-agnostic — type extraction across languages', () => {
  it('extracts Go structs and Python dataclasses in data dirs', async () => {
    const root = await makeProject({
      'models/user.go': `type User struct {\n  ID int\n  Name string\n}\n`,
      'domain/order.py': `@dataclass\nclass Order:\n    id: int\n    total: float\n`,
    });
    const dm = await extractDataModel(root);
    const go = dm.entities.find((e) => e.name === 'User')!;
    expect(go.fields.map((f) => f.name)).toEqual(['ID', 'Name']);
    const py = dm.entities.find((e) => e.name === 'Order')!;
    expect(py.fields.map((f) => f.name)).toEqual(['id', 'total']);
  });
});
