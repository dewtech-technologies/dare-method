// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { ensureDareSkills } from '../utils/project-generator.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ensure-skills-'));
});

afterEach(async () => {
  await fs.remove(dir);
});

describe('ensureDareSkills — brownfield projects', () => {
  describe('fresh project (no dare.config.json)', () => {
    beforeEach(async () => {
      await ensureDareSkills(dir);
    });

    it('writes a dare.config.json marker', async () => {
      const cfg = await fs.readJSON(path.join(dir, 'dare.config.json'));
      expect(cfg.ide).toBe('hybrid');
      expect(cfg.installedBy).toContain('ensureDareSkills');
    });

    it('installs Cursor commands so /dare-* exists', async () => {
      const cmds = path.join(dir, '.cursor', 'commands');
      expect(await fs.pathExists(cmds)).toBe(true);
      expect((await fs.readdir(cmds)).length).toBeGreaterThan(0);
    });

    it('installs Claude commands including dare-reverse', async () => {
      const cmds = path.join(dir, '.claude', 'commands');
      expect(await fs.pathExists(cmds)).toBe(true);
      const files = await fs.readdir(cmds);
      expect(files.some((f) => /reverse/i.test(f))).toBe(true);
    });

    it('installs Antigravity skills', async () => {
      const skills = path.join(dir, '.agents', 'skills');
      expect(await fs.pathExists(skills)).toBe(true);
      expect((await fs.readdir(skills)).length).toBeGreaterThan(0);
    });

    it('creates the DARE/ working dir', async () => {
      expect(await fs.pathExists(path.join(dir, 'DARE', 'EXECUTION'))).toBe(true);
    });
  });

  describe('existing dare.config.json', () => {
    it('refreshes IDE files without clobbering the config name', async () => {
      await fs.writeJSON(path.join(dir, 'dare.config.json'), {
        name: 'my-legacy-app',
        structure: 'backend',
        ide: 'cursor',
        graphrag: 'sqlite',
        mcp: false,
      });

      await ensureDareSkills(dir);

      const cfg = await fs.readJSON(path.join(dir, 'dare.config.json'));
      expect(cfg.name).toBe('my-legacy-app');
      expect(cfg.ide).toBe('cursor');
      // Cursor commands installed; claude not (ide is cursor only)
      expect(await fs.pathExists(path.join(dir, '.cursor', 'commands'))).toBe(true);
      expect(await fs.pathExists(path.join(dir, '.claude', 'commands'))).toBe(false);
    });
  });

  it('is idempotent (second call does not throw)', async () => {
    await ensureDareSkills(dir);
    await expect(ensureDareSkills(dir)).resolves.not.toThrow();
  });
});
