import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';
import { extractDataModelDetailed } from '../../utils/datamodel.js';
import { initAstLoader } from '../loader.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length) await fs.remove(tmpDirs.pop()!);
});

describe('ast-python', () => {
  it('F-03: FastAPI @router.get multi-line', async () => {
    const status = await initAstLoader();
    if (!status.available) return;

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-ast-py-'));
    tmpDirs.push(dir);
    await fs.copy(path.join(FIXTURES, 'fastapi-multiline.py'), path.join(dir, 'app.py'));

    const { model } = await extractDataModelDetailed(dir, { ast: true });
    const routes = model.endpoints.map((e) => `${e.method} ${e.route}`);
    expect(routes).toContain('GET /items');
  });
});
