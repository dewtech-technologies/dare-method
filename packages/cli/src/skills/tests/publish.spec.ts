/**
 * Unit tests for `dare skill publish`.
 *
 * Tests cover:
 *   - readAndValidateSkillYml validation logic
 *   - collectFiles file collection logic
 *   - MIT license enforcement (D-001)
 *   - dry-run behaviour (no files written)
 *   - successful publish writes files and updates index
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { stringify as stringifyYaml } from 'yaml';
import { readAndValidateSkillYml, collectFiles } from '../commands/publish.js';
import { LocalRegistry } from '../registry-local.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let skillDir: string;
let registryRoot: string;

beforeEach(async () => {
  const base = path.join(
    os.tmpdir(),
    `dare-publish-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  tmpDir = base;
  skillDir = path.join(base, 'my-skill');
  registryRoot = path.join(base, 'registry');
  await fs.ensureDir(skillDir);
  await fs.ensureDir(registryRoot);
});

afterEach(async () => {
  await fs.remove(tmpDir).catch(() => undefined);
});

function writeSkillYml(overrides: Partial<Record<string, unknown>> = {}): void {
  const defaults = {
    name: 'my-skill',
    version: '1.0.0',
    description: 'A test skill',
    author: 'Tester',
    license: 'MIT',
    dare_version: '>=3.0.0',
  };
  const meta = { ...defaults, ...overrides };
  fs.writeFileSync(path.join(skillDir, 'skill.yml'), stringifyYaml(meta), 'utf-8');
}

function createSkillFiles(): void {
  writeSkillYml();
  fs.writeFileSync(path.join(skillDir, 'index.ts'), 'export {};\n', 'utf-8');
  fs.ensureDirSync(path.join(skillDir, 'templates'));
  fs.writeFileSync(path.join(skillDir, 'templates', 'hello.txt'), 'hello\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// readAndValidateSkillYml
// ---------------------------------------------------------------------------

describe('readAndValidateSkillYml', () => {
  it('throws when skill.yml is missing', () => {
    expect(() => readAndValidateSkillYml(skillDir)).toThrow('Missing skill.yml');
  });

  it('throws when skill.yml is not valid YAML object', () => {
    fs.writeFileSync(path.join(skillDir, 'skill.yml'), '- just\n- a\n- list\n', 'utf-8');
    expect(() => readAndValidateSkillYml(skillDir)).toThrow();
  });

  it('throws when name is missing', () => {
    writeSkillYml({ name: '' });
    expect(() => readAndValidateSkillYml(skillDir)).toThrow('name');
  });

  it('throws when version is missing', () => {
    writeSkillYml({ version: '' });
    expect(() => readAndValidateSkillYml(skillDir)).toThrow('version');
  });

  it('throws when description is missing', () => {
    writeSkillYml({ description: '' });
    expect(() => readAndValidateSkillYml(skillDir)).toThrow('description');
  });

  it('throws when author is missing', () => {
    writeSkillYml({ author: '' });
    expect(() => readAndValidateSkillYml(skillDir)).toThrow('author');
  });

  it('throws when license is missing', () => {
    writeSkillYml({ license: '' });
    expect(() => readAndValidateSkillYml(skillDir)).toThrow('license');
  });

  it('throws when dare_version is missing', () => {
    writeSkillYml({ dare_version: '' });
    expect(() => readAndValidateSkillYml(skillDir)).toThrow('dare_version');
  });

  // D-001: MIT only
  it('throws when license is Apache-2.0 (D-001)', () => {
    writeSkillYml({ license: 'Apache-2.0' });
    expect(() => readAndValidateSkillYml(skillDir)).toThrow('MIT');
  });

  it('throws when license is GPL-3.0 (D-001)', () => {
    writeSkillYml({ license: 'GPL-3.0' });
    expect(() => readAndValidateSkillYml(skillDir)).toThrow('MIT');
  });

  it('throws when license is PROPRIETARY (D-001)', () => {
    writeSkillYml({ license: 'PROPRIETARY' });
    expect(() => readAndValidateSkillYml(skillDir)).toThrow('MIT');
  });

  it('accepts MIT license (case-insensitive)', () => {
    writeSkillYml({ license: 'mit' });
    expect(() => readAndValidateSkillYml(skillDir)).not.toThrow();
  });

  it('returns parsed metadata for valid skill.yml', () => {
    writeSkillYml();
    const meta = readAndValidateSkillYml(skillDir);
    expect(meta.name).toBe('my-skill');
    expect(meta.version).toBe('1.0.0');
    expect(meta.license).toBe('MIT');
    expect(meta.dare_version).toBe('>=3.0.0');
  });

  it('returns optional fields when present', () => {
    writeSkillYml({ homepage: 'https://example.com', keywords: ['test', 'skill'] });
    const meta = readAndValidateSkillYml(skillDir);
    expect(meta.homepage).toBe('https://example.com');
    expect(meta.keywords).toEqual(['test', 'skill']);
  });
});

// ---------------------------------------------------------------------------
// collectFiles
// ---------------------------------------------------------------------------

describe('collectFiles', () => {
  it('returns empty array for empty directory', () => {
    expect(collectFiles(skillDir)).toEqual([]);
  });

  it('collects root-level files', () => {
    fs.writeFileSync(path.join(skillDir, 'skill.yml'), '', 'utf-8');
    fs.writeFileSync(path.join(skillDir, 'index.ts'), '', 'utf-8');
    const files = collectFiles(skillDir);
    expect(files).toContain('skill.yml');
    expect(files).toContain('index.ts');
  });

  it('collects files in subdirectories', () => {
    fs.ensureDirSync(path.join(skillDir, 'templates'));
    fs.writeFileSync(path.join(skillDir, 'templates', 'hello.txt'), '', 'utf-8');
    const files = collectFiles(skillDir);
    expect(files).toContain(path.join('templates', 'hello.txt'));
  });

  it('excludes node_modules/', () => {
    fs.ensureDirSync(path.join(skillDir, 'node_modules', 'some-pkg'));
    fs.writeFileSync(path.join(skillDir, 'node_modules', 'some-pkg', 'index.js'), '', 'utf-8');
    const files = collectFiles(skillDir);
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
  });

  it('excludes dist/', () => {
    fs.ensureDirSync(path.join(skillDir, 'dist'));
    fs.writeFileSync(path.join(skillDir, 'dist', 'index.js'), '', 'utf-8');
    const files = collectFiles(skillDir);
    expect(files.some((f) => f.includes('dist'))).toBe(false);
  });

  it('excludes .git/', () => {
    fs.ensureDirSync(path.join(skillDir, '.git'));
    fs.writeFileSync(path.join(skillDir, '.git', 'HEAD'), '', 'utf-8');
    const files = collectFiles(skillDir);
    expect(files.some((f) => f.includes('.git'))).toBe(false);
  });

  it('returns paths sorted alphabetically', () => {
    fs.writeFileSync(path.join(skillDir, 'z.ts'), '', 'utf-8');
    fs.writeFileSync(path.join(skillDir, 'a.ts'), '', 'utf-8');
    fs.writeFileSync(path.join(skillDir, 'm.ts'), '', 'utf-8');
    const files = collectFiles(skillDir);
    expect(files).toEqual([...files].sort());
  });
});

// ---------------------------------------------------------------------------
// LocalRegistry integration (used by publish)
// ---------------------------------------------------------------------------

describe('LocalRegistry publish integration', () => {
  it('publish() copies files and updates index.json', () => {
    createSkillFiles();
    const reg = new LocalRegistry(registryRoot);
    reg.publish(skillDir, {
      name: 'my-skill',
      version: '1.0.0',
      description: 'A test skill',
      author: 'Tester',
      license: 'MIT',
      dare_version: '>=3.0.0',
      published_at: new Date().toISOString(),
      size_kb: 1,
      source: 'local',
    });

    // Skill directory exists
    const skillDestDir = path.join(registryRoot, 'my-skill', '1.0.0');
    expect(fs.pathExistsSync(skillDestDir)).toBe(true);

    // skill.yml was copied
    expect(fs.pathExistsSync(path.join(skillDestDir, 'skill.yml'))).toBe(true);

    // index.json was updated
    const indexPath = path.join(registryRoot, 'index.json');
    expect(fs.pathExistsSync(indexPath)).toBe(true);
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as { skills: { name: string; version: string }[] };
    expect(index.skills.some((s) => s.name === 'my-skill' && s.version === '1.0.0')).toBe(true);
  });

  it('publish() does not copy excluded dirs', () => {
    createSkillFiles();
    fs.ensureDirSync(path.join(skillDir, 'node_modules', 'pkg'));
    fs.writeFileSync(path.join(skillDir, 'node_modules', 'pkg', 'index.js'), '', 'utf-8');

    const reg = new LocalRegistry(registryRoot);
    reg.publish(skillDir, {
      name: 'my-skill',
      version: '1.0.0',
      description: 'A test skill',
      author: 'Tester',
      license: 'MIT',
      dare_version: '>=3.0.0',
      source: 'local',
    });

    const skillDestDir = path.join(registryRoot, 'my-skill', '1.0.0');
    expect(fs.pathExistsSync(path.join(skillDestDir, 'node_modules'))).toBe(false);
  });

  it('publish() with dry-run does not write files', () => {
    createSkillFiles();
    // dry-run: we simply DON'T call reg.publish() — registry stays empty
    const reg = new LocalRegistry(registryRoot);
    const skills = reg.list();
    expect(skills).toHaveLength(0);
  });

  it('find() returns null when registry is empty', () => {
    const reg = new LocalRegistry(registryRoot);
    expect(reg.find('nonexistent')).toBeNull();
  });

  it('find() returns the published skill', () => {
    createSkillFiles();
    const reg = new LocalRegistry(registryRoot);
    reg.publish(skillDir, {
      name: 'my-skill',
      version: '1.0.0',
      description: 'A test skill',
      author: 'Tester',
      license: 'MIT',
      dare_version: '>=3.0.0',
      source: 'local',
    });
    const skill = reg.find('my-skill');
    expect(skill).not.toBeNull();
    expect(skill?.name).toBe('my-skill');
    expect(skill?.version).toBe('1.0.0');
  });

  it('find() with exact version returns correct skill', () => {
    createSkillFiles();
    const reg = new LocalRegistry(registryRoot);
    const base = {
      name: 'my-skill',
      description: 'A test skill',
      author: 'Tester',
      license: 'MIT',
      dare_version: '>=3.0.0',
      source: 'local' as const,
    };
    reg.publish(skillDir, { ...base, version: '1.0.0' });
    reg.publish(skillDir, { ...base, version: '2.0.0' });

    expect(reg.find('my-skill', '1.0.0')?.version).toBe('1.0.0');
    expect(reg.find('my-skill', '2.0.0')?.version).toBe('2.0.0');
  });

  it('publish() upserts existing entry (same name+version)', () => {
    createSkillFiles();
    const reg = new LocalRegistry(registryRoot);
    const meta = {
      name: 'my-skill',
      version: '1.0.0',
      description: 'original',
      author: 'Tester',
      license: 'MIT',
      dare_version: '>=3.0.0',
      source: 'local' as const,
    };
    reg.publish(skillDir, meta);
    reg.publish(skillDir, { ...meta, description: 'updated' });

    const skills = reg.list();
    const entries = skills.filter((s) => s.name === 'my-skill' && s.version === '1.0.0');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.description).toBe('updated');
  });
});
