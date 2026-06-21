import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { extractDataModelDetailed } from '../../utils/datamodel.js';
import { initAstLoader } from '../loader.js';

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await fs.remove(tmpDirs.pop()!);
});

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-ast-p2-'));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, content);
  }
  return dir;
}

describe('ast-go', () => {
  it('parses Gin r.GET route', async () => {
    const status = await initAstLoader();
    if (!status.available) return;
    const root = await makeProject({ 'main.go': 'r.GET("/ping", handler)\n' });
    const { model } = await extractDataModelDetailed(root, { ast: true });
    expect(model.endpoints.some((e) => e.method === 'GET' && e.route === '/ping')).toBe(true);
  });
});

describe('ast-ruby', () => {
  it('parses get route helper', async () => {
    const status = await initAstLoader();
    if (!status.available) return;
    const root = await makeProject({ 'config/routes.rb': "get '/health', to: 'health#show'\n" });
    const { model } = await extractDataModelDetailed(root, { ast: true });
    expect(model.endpoints.some((e) => e.method === 'GET' && e.route === '/health')).toBe(true);
  });
});

describe('ast-rust', () => {
  it('parses Axum .route path', async () => {
    const status = await initAstLoader();
    if (!status.available) return;
    const root = await makeProject({ 'src/main.rs': 'Router::new().route("/users", get(list_users));\n' });
    const { model } = await extractDataModelDetailed(root, { ast: true });
    expect(model.endpoints.some((e) => e.method === 'GET' && e.route === '/users')).toBe(true);
  });
});
