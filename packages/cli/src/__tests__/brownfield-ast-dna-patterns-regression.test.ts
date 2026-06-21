import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { detectDna, detectDnaDetailed } from '../utils/dna-detector.js';
import { detectPatterns, detectPatternsDetailed } from '../utils/pattern-detector.js';

const tmpDirs: string[] = [];

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-ast-dp-reg-'));
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

describe('brownfield-ast-dna-patterns-regression', () => {
  it('F-R01: detectDna without opts matches detailed without ast', async () => {
    const root = await makeProject({
      'src/app.service.ts': 'export class AppService {}\n',
      'package.json': JSON.stringify({ dependencies: { express: '^4.0.0' } }),
    });
    const at = new Date().toISOString();
    const baseline = await detectDna(root, at);
    const again = (await detectDnaDetailed(root, at)).facts;
    expect(again.libraries).toEqual(baseline.libraries);
    expect(again.architecture.guess).toBe(baseline.architecture.guess);
  });

  it('detectDnaDetailed with ast returns extraction meta', async () => {
    const root = await makeProject({ 'src/x.ts': 'export const x = 1;\n' });
    const detailed = await detectDnaDetailed(root, new Date().toISOString(), { ast: true });
    expect(detailed.extraction?.astEnabled).toBe(true);
  });

  it('detectPatterns default unchanged vs hybrid superset', async () => {
    const root = await makeProject({
      'src/index.ts': "export * from './a';\n",
      'src/a.ts': 'export const a = 1;\n',
    });
    const baseline = await detectPatterns(root, null);
    const hybrid = (await detectPatternsDetailed(root, null, { ast: true })).facts;
    expect(hybrid.patterns.length).toBeGreaterThanOrEqual(baseline.patterns.length);
  });
});
