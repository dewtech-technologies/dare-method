import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { PathEscapeError } from '../../utils/path-safety.js';
import { resolveSteeringForFile } from '../resolver.js';
import { loadSteeringFiles } from '../loader.js';

describe('resolveSteeringForFile security', () => {
  it('rejects path traversal in relFile', () => {
    expect(() =>
      resolveSteeringForFile([], '../../etc/passwd'),
    ).toThrow(PathEscapeError);
    expect(() => resolveSteeringForFile([], '/abs/path')).toThrow(
      PathEscapeError,
    );
    expect(() => resolveSteeringForFile([], 'src/../../x')).toThrow(
      PathEscapeError,
    );
  });
});

describe('steering loader .env blocklist (RS-04)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'steering-sec-'));
  });

  afterEach(async () => {
    await fs.remove(projectRoot).catch(() => undefined);
  });

  it('never loads .env* as steering sources', async () => {
    const dir = path.join(projectRoot, '.dare', 'steering');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, '.env'), 'SECRET=leak');
    await fs.writeFile(path.join(dir, '.env.local'), 'TOKEN=x');
    await fs.writeFile(
      path.join(dir, 'ok.md'),
      `---
scope: project
---
# ok
`,
    );

    const files = loadSteeringFiles(projectRoot);
    expect(files.map((f) => f.path)).not.toContain('.dare/steering/.env');
    expect(files.map((f) => f.path)).not.toContain('.dare/steering/.env.local');

    const resolution = resolveSteeringForFile(files, 'src/app.ts');
    const bodies = resolution.blocks.map((b) => b.body).join('\n');
    expect(bodies).not.toContain('SECRET=leak');
    expect(bodies).not.toContain('TOKEN=x');
  });
});
