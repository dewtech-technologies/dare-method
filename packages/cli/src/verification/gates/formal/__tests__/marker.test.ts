import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { resolveFormalTargets } from '../marker.js';
import { FORMAL_DEFAULTS } from '../../../config.js';

describe('resolveFormalTargets', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'formal-marker-'));
    await fs.ensureDir(path.join(cwd, 'src'));
  });

  afterEach(async () => {
    await fs.remove(cwd).catch(() => undefined);
  });

  it('une tag + config e deduplica por (file,symbol)', async () => {
    await fs.writeFile(
      path.join(cwd, 'src', 'a.ts'),
      '// @dare-formal\nexport function add(x: number) { return x + 1; }\n',
    );
    const config = {
      ...FORMAL_DEFAULTS,
      enabled: true,
      modules: ['src/b.ts::mul'],
    };
    const targets = await resolveFormalTargets({
      cwd,
      changedFiles: ['src/a.ts'],
      config,
    });
    expect(targets).toContainEqual({ file: 'src/a.ts', symbol: 'add', source: 'tag' });
    expect(targets).toContainEqual({ file: 'src/b.ts', symbol: 'mul', source: 'config' });
  });

  it('nenhum módulo marcado ⇒ [] (origem do SKIP — O-03)', async () => {
    await fs.writeFile(path.join(cwd, 'src', 'plain.ts'), 'export const x = 1;\n');
    const targets = await resolveFormalTargets({
      cwd,
      changedFiles: ['src/plain.ts'],
      config: { ...FORMAL_DEFAULTS, enabled: true, modules: [] },
    });
    expect(targets).toEqual([]);
  });

  it('file com ../ ⇒ reprova (assertRelativeSafe, RS-01)', async () => {
    await expect(
      resolveFormalTargets({
        cwd,
        changedFiles: [],
        config: { ...FORMAL_DEFAULTS, modules: ['../escape.ts::f'] },
      }),
    ).rejects.toThrow(/\.\./);
  });

  it('file absoluto na config ⇒ reprova', async () => {
    await expect(
      resolveFormalTargets({
        cwd,
        changedFiles: [],
        config: { ...FORMAL_DEFAULTS, modules: ['/etc/passwd::f'] },
      }),
    ).rejects.toThrow(/absolute/);
  });
});
