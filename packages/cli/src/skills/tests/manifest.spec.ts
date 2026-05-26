/**
 * Unit tests for ManifestReader and ManifestWriter.
 *
 * Uses the filesystem exclusively via temp directories — no network, no
 * external dependencies.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ManifestReader, ManifestWriter, type SkillEntry } from '../manifest.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

const manifestRelPath = '.dare/skills.yml';

function manifestAbs(): string {
  return path.join(tmpDir, manifestRelPath);
}

async function writeRaw(content: string): Promise<void> {
  await fs.ensureDir(path.dirname(manifestAbs()));
  await fs.writeFile(manifestAbs(), content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `dare-manifest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(tmpDir);
});

afterEach(async () => {
  await fs.remove(tmpDir).catch(() => undefined);
});

// ---------------------------------------------------------------------------
// ManifestReader
// ---------------------------------------------------------------------------

describe('ManifestReader', () => {
  const reader = new ManifestReader();

  it('exists() returns false when manifest is absent', () => {
    expect(reader.exists(tmpDir)).toBe(false);
  });

  it('exists() returns true when manifest is present', async () => {
    await writeRaw('skills: []');
    expect(reader.exists(tmpDir)).toBe(true);
  });

  it('read() throws when manifest is absent', () => {
    expect(() => reader.read(tmpDir)).toThrow('Manifest not found');
  });

  it('read() parses a minimal valid manifest', async () => {
    await writeRaw(`
skills:
  - name: dare-ax
    version: "1.0.0"
    enabled: true
`);
    const manifest = reader.read(tmpDir);
    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills[0]).toMatchObject({ name: 'dare-ax', version: '1.0.0', enabled: true });
  });

  it('read() parses dependsOn field', async () => {
    await writeRaw(`
skills:
  - name: dare-llm-integration
    version: "1.0.0"
    enabled: true
    dependsOn:
      - dare-ax
`);
    const manifest = reader.read(tmpDir);
    expect(manifest.skills[0]?.dependsOn).toEqual(['dare-ax']);
  });

  it('read() throws on malformed YAML', async () => {
    await writeRaw('skills: !!binary bad!!');
    expect(() => reader.read(tmpDir)).toThrow();
  });

  it('read() throws when skills is not an array', async () => {
    await writeRaw('skills: "oops"');
    expect(() => reader.read(tmpDir)).toThrow("'skills' must be an array");
  });

  it('read() throws when a skill entry is missing name', async () => {
    await writeRaw(`
skills:
  - version: "1.0.0"
    enabled: true
`);
    expect(() => reader.read(tmpDir)).toThrow('name must be a non-empty string');
  });

  it('read() throws when a skill entry is missing version', async () => {
    await writeRaw(`
skills:
  - name: dare-ax
    enabled: true
`);
    expect(() => reader.read(tmpDir)).toThrow('version must be a non-empty string');
  });

  it('readOrEmpty() returns empty manifest when file is absent', () => {
    const manifest = reader.readOrEmpty(tmpDir);
    expect(manifest.skills).toEqual([]);
  });

  it('readOrEmpty() returns parsed manifest when file exists', async () => {
    await writeRaw('skills:\n  - name: dare-ax\n    version: "1.0.0"\n    enabled: true\n');
    const manifest = reader.readOrEmpty(tmpDir);
    expect(manifest.skills).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ManifestWriter
// ---------------------------------------------------------------------------

describe('ManifestWriter', () => {
  const writer = new ManifestWriter();
  const reader = new ManifestReader();

  it('write() creates .dare directory if absent', () => {
    expect(fs.pathExistsSync(path.join(tmpDir, '.dare'))).toBe(false);
    writer.write(tmpDir, { skills: [] });
    expect(fs.pathExistsSync(path.join(tmpDir, '.dare'))).toBe(true);
  });

  it('write() creates skills.yml with header comment', () => {
    writer.write(tmpDir, { skills: [] });
    const content = fs.readFileSync(manifestAbs(), 'utf-8');
    expect(content).toContain('Managed by DARE CLI');
  });

  it('write() round-trips a skill entry', () => {
    const entry: SkillEntry = { name: 'dare-ax', version: '1.0.0', enabled: true };
    writer.write(tmpDir, { skills: [entry] });
    const manifest = reader.read(tmpDir);
    expect(manifest.skills[0]).toMatchObject(entry);
  });

  it('write() round-trips dependsOn', () => {
    const entry: SkillEntry = {
      name: 'dare-llm',
      version: '1.0.0',
      enabled: true,
      dependsOn: ['dare-ax'],
    };
    writer.write(tmpDir, { skills: [entry] });
    const manifest = reader.read(tmpDir);
    expect(manifest.skills[0]?.dependsOn).toEqual(['dare-ax']);
  });

  it('addSkill() creates manifest from scratch and adds entry', () => {
    writer.addSkill(tmpDir, { name: 'dare-ax', version: '1.0.0', enabled: true });
    const manifest = reader.read(tmpDir);
    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills[0]?.name).toBe('dare-ax');
  });

  it('addSkill() appends to existing manifest', () => {
    writer.addSkill(tmpDir, { name: 'dare-ax', version: '1.0.0', enabled: true });
    writer.addSkill(tmpDir, { name: 'dare-layered-design', version: '1.0.0', enabled: true });
    const manifest = reader.read(tmpDir);
    expect(manifest.skills).toHaveLength(2);
  });

  it('addSkill() replaces an existing entry by name (upsert)', () => {
    writer.addSkill(tmpDir, { name: 'dare-ax', version: '1.0.0', enabled: true });
    writer.addSkill(tmpDir, { name: 'dare-ax', version: '1.1.0', enabled: true });
    const manifest = reader.read(tmpDir);
    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills[0]?.version).toBe('1.1.0');
  });

  it('removeSkill() removes an existing skill', () => {
    writer.addSkill(tmpDir, { name: 'dare-ax', version: '1.0.0', enabled: true });
    writer.addSkill(tmpDir, { name: 'dare-llm', version: '1.0.0', enabled: true });
    writer.removeSkill(tmpDir, 'dare-ax');
    const manifest = reader.read(tmpDir);
    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills[0]?.name).toBe('dare-llm');
  });

  it('removeSkill() is a no-op when skill is absent', () => {
    writer.addSkill(tmpDir, { name: 'dare-ax', version: '1.0.0', enabled: true });
    writer.removeSkill(tmpDir, 'nonexistent');
    const manifest = reader.read(tmpDir);
    expect(manifest.skills).toHaveLength(1);
  });

  it('removeSkill() works on empty project (no manifest yet) — no-op', () => {
    expect(() => writer.removeSkill(tmpDir, 'dare-ax')).not.toThrow();
  });
});
