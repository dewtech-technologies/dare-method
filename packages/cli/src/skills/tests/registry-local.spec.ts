/**
 * Unit tests for LocalRegistry.
 *
 * Covers: list, find, publish, install — all using temp dirs.
 * Uses DARE_LOCAL_REGISTRY env var to override the default ~/.dare/registry path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import { LocalRegistry, type LocalRegistrySkill } from '../registry-local.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let registryRoot: string;

function makeRegistry(): LocalRegistry {
  return new LocalRegistry(registryRoot);
}

const BASE_META: Omit<LocalRegistrySkill, 'version'> = {
  name: 'dare-ax',
  description: 'Test skill',
  author: 'Tester',
  license: 'MIT',
  dare_version: '>=3.0.0',
  source: 'local',
};

function makeSkillDir(name: string, version: string): string {
  const dir = path.join(tmpDir, 'skills', name);
  fs.ensureDirSync(dir);
  fs.writeFileSync(
    path.join(dir, 'skill.yml'),
    `name: ${name}\nversion: ${version}\n`,
    'utf-8',
  );
  fs.writeFileSync(path.join(dir, 'index.ts'), 'export {};\n', 'utf-8');
  return dir;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  const base = path.join(
    os.tmpdir(),
    `dare-reg-local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  tmpDir = base;
  registryRoot = path.join(base, 'registry');
  await fs.ensureDir(tmpDir);
});

afterEach(async () => {
  await fs.remove(tmpDir).catch(() => undefined);
});

// ---------------------------------------------------------------------------
// list()
// ---------------------------------------------------------------------------

describe('LocalRegistry.list()', () => {
  it('returns empty array when index.json does not exist', () => {
    const reg = makeRegistry();
    expect(reg.list()).toEqual([]);
  });

  it('returns empty array when index.json has empty skills array', () => {
    fs.ensureDirSync(registryRoot);
    fs.writeFileSync(
      path.join(registryRoot, 'index.json'),
      JSON.stringify({ skills: [] }),
      'utf-8',
    );
    const reg = makeRegistry();
    expect(reg.list()).toEqual([]);
  });

  it('returns published skills', () => {
    const reg = makeRegistry();
    const skillDir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(skillDir, { ...BASE_META, version: '1.0.0' });
    expect(reg.list()).toHaveLength(1);
    expect(reg.list()[0]?.name).toBe('dare-ax');
  });

  it('returns multiple skills', () => {
    const reg = makeRegistry();
    const d1 = makeSkillDir('dare-ax', '1.0.0');
    const d2 = makeSkillDir('dare-llm', '1.0.0');
    reg.publish(d1, { ...BASE_META, name: 'dare-ax', version: '1.0.0' });
    reg.publish(d2, { ...BASE_META, name: 'dare-llm', version: '1.0.0' });
    expect(reg.list()).toHaveLength(2);
  });

  it('all items have source: local', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });
    expect(reg.list()[0]?.source).toBe('local');
  });
});

// ---------------------------------------------------------------------------
// find()
// ---------------------------------------------------------------------------

describe('LocalRegistry.find()', () => {
  it('returns null when registry is empty', () => {
    expect(makeRegistry().find('dare-ax')).toBeNull();
  });

  it('returns null for unknown skill name', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });
    expect(reg.find('does-not-exist')).toBeNull();
  });

  it('returns skill when found by name', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });
    const found = reg.find('dare-ax');
    expect(found?.name).toBe('dare-ax');
    expect(found?.version).toBe('1.0.0');
  });

  it('returns skill when found by name + version', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });
    expect(reg.find('dare-ax', '1.0.0')).not.toBeNull();
    expect(reg.find('dare-ax', '9.9.9')).toBeNull();
  });

  it('returns latest when multiple versions exist', () => {
    const reg = makeRegistry();
    const d1 = makeSkillDir('dare-ax', '1.0.0');
    const d2 = makeSkillDir('dare-ax', '2.0.0');
    reg.publish(d1, { ...BASE_META, version: '1.0.0', published_at: '2026-01-01T00:00:00Z' });
    reg.publish(d2, { ...BASE_META, version: '2.0.0', published_at: '2026-06-01T00:00:00Z' });
    // find() without version returns the one with the lexicographically latest published_at
    const found = reg.find('dare-ax');
    expect(found?.version).toBe('2.0.0');
  });
});

// ---------------------------------------------------------------------------
// publish()
// ---------------------------------------------------------------------------

describe('LocalRegistry.publish()', () => {
  it('creates registry root if it does not exist', () => {
    expect(fs.pathExistsSync(registryRoot)).toBe(false);
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });
    expect(fs.pathExistsSync(registryRoot)).toBe(true);
  });

  it('creates skill version directory', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });
    expect(fs.pathExistsSync(path.join(registryRoot, 'dare-ax', '1.0.0'))).toBe(true);
  });

  it('copies skill.yml to registry directory', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });
    expect(
      fs.pathExistsSync(path.join(registryRoot, 'dare-ax', '1.0.0', 'skill.yml')),
    ).toBe(true);
  });

  it('copies index.ts to registry directory', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });
    expect(
      fs.pathExistsSync(path.join(registryRoot, 'dare-ax', '1.0.0', 'index.ts')),
    ).toBe(true);
  });

  it('does NOT copy node_modules/', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    fs.ensureDirSync(path.join(dir, 'node_modules', 'pkg'));
    fs.writeFileSync(path.join(dir, 'node_modules', 'pkg', 'a.js'), '', 'utf-8');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });
    expect(
      fs.pathExistsSync(path.join(registryRoot, 'dare-ax', '1.0.0', 'node_modules')),
    ).toBe(false);
  });

  it('does NOT copy dist/', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    fs.ensureDirSync(path.join(dir, 'dist'));
    fs.writeFileSync(path.join(dir, 'dist', 'index.js'), '', 'utf-8');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });
    expect(
      fs.pathExistsSync(path.join(registryRoot, 'dare-ax', '1.0.0', 'dist')),
    ).toBe(false);
  });

  it('does NOT copy .git/', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    fs.ensureDirSync(path.join(dir, '.git'));
    fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf-8');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });
    expect(
      fs.pathExistsSync(path.join(registryRoot, 'dare-ax', '1.0.0', '.git')),
    ).toBe(false);
  });

  it('creates/updates index.json after publish', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });
    expect(fs.pathExistsSync(path.join(registryRoot, 'index.json'))).toBe(true);
  });

  it('upserts same name+version in index.json', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(dir, { ...BASE_META, version: '1.0.0', description: 'v1' });
    reg.publish(dir, { ...BASE_META, version: '1.0.0', description: 'v1-updated' });
    const skills = reg.list();
    const entries = skills.filter((s) => s.name === 'dare-ax' && s.version === '1.0.0');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.description).toBe('v1-updated');
  });

  it('appends new version without removing older version', () => {
    const reg = makeRegistry();
    const d1 = makeSkillDir('dare-ax', '1.0.0');
    const d2 = makeSkillDir('dare-ax', '2.0.0');
    reg.publish(d1, { ...BASE_META, version: '1.0.0' });
    reg.publish(d2, { ...BASE_META, version: '2.0.0' });
    const skills = reg.list().filter((s) => s.name === 'dare-ax');
    expect(skills).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// install()
// ---------------------------------------------------------------------------

describe('LocalRegistry.install()', () => {
  it('throws when skill is not in the registry', () => {
    const reg = makeRegistry();
    expect(() => reg.install('dare-ax', '1.0.0', tmpDir)).toThrow('Local registry does not have');
  });

  it('installs skill into packages/skills/<name>/', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });

    const projectDir = path.join(tmpDir, 'project');
    fs.ensureDirSync(projectDir);
    reg.install('dare-ax', '1.0.0', projectDir);

    const installDest = path.join(projectDir, 'packages', 'skills', 'dare-ax');
    expect(fs.pathExistsSync(installDest)).toBe(true);
    expect(fs.pathExistsSync(path.join(installDest, 'skill.yml'))).toBe(true);
  });

  it('creates target directory if it does not exist', () => {
    const reg = makeRegistry();
    const dir = makeSkillDir('dare-ax', '1.0.0');
    reg.publish(dir, { ...BASE_META, version: '1.0.0' });

    const projectDir = path.join(tmpDir, 'new-project');
    // Do not pre-create projectDir
    expect(fs.pathExistsSync(projectDir)).toBe(false);
    reg.install('dare-ax', '1.0.0', projectDir);
    expect(fs.pathExistsSync(path.join(projectDir, 'packages', 'skills', 'dare-ax'))).toBe(true);
  });
});
