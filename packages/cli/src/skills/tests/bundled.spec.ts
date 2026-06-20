import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { hasBundledSkill, installBundledSkill } from '../bundled.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-bundled-skill-'));
});

afterEach(async () => {
  await fs.remove(tmpDir).catch(() => undefined);
});

describe('bundled skills', () => {
  it('installs_core_skill_files_from_cli_package', () => {
    expect(hasBundledSkill('dare-ax')).toBe(true);
    expect(installBundledSkill('dare-ax', tmpDir)).toBe(true);
    expect(fs.pathExistsSync(path.join(tmpDir, 'packages', 'skills', 'dare-ax', 'skill.yml'))).toBe(
      true,
    );
  });

  it('returns_false_for_unknown_skill', () => {
    expect(hasBundledSkill('does-not-exist')).toBe(false);
    expect(installBundledSkill('does-not-exist', tmpDir)).toBe(false);
  });
});
