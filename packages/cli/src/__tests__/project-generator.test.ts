import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { generateProjectStructure } from '../utils/project-generator.js';
import {
  DEFAULTS,
  seedVerificationDefaultsIfAbsent,
} from '../verification/config.js';

describe('project-generator — verification block', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-verif-'));
  });

  afterEach(async () => {
    if (tmpRoot) await fs.remove(tmpRoot);
  });

  async function initProject(): Promise<string> {
    const appDir = path.join(tmpRoot, 'app');
    await generateProjectStructure({
      name: 'test-app',
      structure: 'backend',
      backend: 'node-nestjs',
      outputDir: appDir,
      skipBootstrap: true,
      ide: 'cursor',
      graphrag: 'sqlite',
      mcp: false,
    });
    return appDir;
  }

  it('should_write_verification_block_disabled', async () => {
    const appDir = await initProject();
    const cfg = await fs.readJSON(path.join(appDir, 'dare.config.json'));

    expect(cfg.verification).toBeDefined();
    expect(cfg.verification.enabled).toBe(false);
    expect(cfg.verification.mutation.minScore).toBe(0.7);
    expect(cfg.verification.loop.policy).toBe('decay');
    expect(cfg.verification.prerank.enabled).toBe(false);
  });

  it('should_match_config_defaults', async () => {
    const appDir = await initProject();
    const cfg = await fs.readJSON(path.join(appDir, 'dare.config.json'));

    expect(cfg.verification).toEqual(DEFAULTS);
  });

  it('should_add_verification_on_update_when_absent', async () => {
    const cfgPath = path.join(tmpRoot, 'dare.config.json');
    await fs.writeJSON(
      cfgPath,
      { name: 'legacy', version: '3.2.0', review: { onComplete: false, strict: false } },
      { spaces: 2 },
    );

    const cfg = await fs.readJSON(cfgPath);
    expect(seedVerificationDefaultsIfAbsent(cfg)).toBe(true);
    expect(cfg.verification).toEqual(DEFAULTS);
    await fs.writeJSON(cfgPath, cfg, { spaces: 2 });

    const reloaded = await fs.readJSON(cfgPath);
    expect(reloaded.verification.enabled).toBe(false);
    expect(seedVerificationDefaultsIfAbsent(reloaded)).toBe(false);
  });
});
