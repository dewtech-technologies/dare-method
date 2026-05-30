import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { detectModules } from '../utils/module-detector.js';

const tmpDirs: string[] = [];

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-modet-'));
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

describe('detectModules — src-subdirs strategy', () => {
  it('detects subdirectories of src/ as modules and resolves relative-import edges', async () => {
    const root = await makeProject({
      'package.json': '{"name":"app","version":"1.0.0"}',
      'src/auth/login.ts': "import { findUser } from '../users/user';\nexport const login = () => findUser();\n",
      'src/users/user.ts': 'export const findUser = () => ({});\n',
      'src/core/util.ts': 'export const noop = () => {};\n',
    });

    const graph = await detectModules(root);
    expect(graph.strategy).toBe('src-subdirs');

    const ids = graph.modules.map((m) => m.id).sort();
    expect(ids).toEqual(['src-auth', 'src-core', 'src-users']);

    const auth = graph.modules.find((m) => m.id === 'src-auth')!;
    expect(auth.depends_on).toContain('src-users');
    expect(auth.depends_on).not.toContain('src-core');
  });
});

describe('detectModules — pnpm workspace strategy', () => {
  it('detects packages/* and resolves edges by workspace package name', async () => {
    const root = await makeProject({
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
      'packages/alpha/package.json': '{"name":"@x/alpha","version":"1.0.0"}',
      'packages/alpha/index.ts': 'export const a = 1;\n',
      'packages/beta/package.json': '{"name":"@x/beta","version":"1.0.0"}',
      'packages/beta/index.ts': "import { a } from '@x/alpha';\nexport const b = a + 1;\n",
    });

    const graph = await detectModules(root);
    expect(graph.strategy).toBe('pnpm-workspace');

    const beta = graph.modules.find((m) => m.id === 'packages-beta')!;
    expect(beta.depends_on).toContain('packages-alpha');
  });
});

describe('detectModules — size buckets and ignores', () => {
  it('buckets a large module as MED/HIGH and ignores node_modules', async () => {
    const bigFile = Array.from({ length: 600 }, (_, i) => `export const v${i} = ${i};`).join('\n');
    const root = await makeProject({
      'src/big/data.ts': bigFile,
      'src/small/x.ts': 'export const x = 1;\n',
      'node_modules/junk/index.ts': 'export const junk = 1;\n',
    });

    const graph = await detectModules(root);
    const ids = graph.modules.map((m) => m.id).sort();
    expect(ids).toEqual(['src-big', 'src-small']); // node_modules excluded

    const big = graph.modules.find((m) => m.id === 'src-big')!;
    expect(big.size).not.toBe('LOW');
    const small = graph.modules.find((m) => m.id === 'src-small')!;
    expect(small.size).toBe('LOW');
  });
});

describe('detectModules — --only filter', () => {
  it('keeps only the requested modules and prunes dangling edges', async () => {
    const root = await makeProject({
      'src/auth/login.ts': "import '../users/user';\nexport const login = 1;\n",
      'src/users/user.ts': 'export const findUser = 1;\n',
      'src/core/util.ts': 'export const noop = 1;\n',
    });

    const graph = await detectModules(root, { only: ['auth'] });
    expect(graph.modules.map((m) => m.id)).toEqual(['src-auth']);
    // The edge to src-users is pruned because that module was filtered out.
    expect(graph.modules[0].depends_on).toEqual([]);
  });
});
