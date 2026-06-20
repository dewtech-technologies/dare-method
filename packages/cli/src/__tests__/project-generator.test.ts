import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { generateProjectStructure } from '../utils/project-generator.js';
import {
  DEFAULTS,
  DRIFT_DEFAULTS,
  SEMANTIC_DEFAULTS,
  seedDriftDefaultsIfAbsent,
  seedSemanticDefaultsIfAbsent,
  seedVerificationDefaultsIfAbsent,
} from '../verification/config.js';

describe('project-generator — verification block', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = path.join(
      process.cwd(),
      `.pg-verif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.ensureDir(tmpRoot);
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
    expect(cfg.drift).toEqual(DRIFT_DEFAULTS);
    expect(cfg.graphrag.backend).toBe('sqlite');
    expect(cfg.graphrag.semantic).toEqual(SEMANTIC_DEFAULTS);
  });

  it('should_match_config_defaults', async () => {
    const appDir = await initProject();
    const cfg = await fs.readJSON(path.join(appDir, 'dare.config.json'));

    expect(cfg.verification).toEqual(DEFAULTS);
  });

  it('should_generate_codex_agents_file_and_repo_skills', async () => {
    const appDir = path.join(tmpRoot, 'codex-app');
    await generateProjectStructure({
      name: 'codex-app',
      structure: 'backend',
      backend: 'node-nestjs',
      outputDir: appDir,
      skipBootstrap: true,
      ide: 'codex',
      graphrag: 'sqlite',
      mcp: false,
    });

    expect(await fs.pathExists(path.join(appDir, 'AGENTS.md'))).toBe(true);
    expect(await fs.pathExists(path.join(appDir, '.agents', 'skills', 'dare-execute', 'SKILL.md'))).toBe(
      true,
    );
    const agents = await fs.readFile(path.join(appDir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('dare execute --agent --driver codex');
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
    expect(seedDriftDefaultsIfAbsent(cfg)).toBe(true);
    expect(seedSemanticDefaultsIfAbsent(cfg)).toBe(true);
    expect(cfg.verification).toEqual(DEFAULTS);
    expect(cfg.drift).toEqual(DRIFT_DEFAULTS);
    expect(cfg.graphrag.semantic).toEqual(SEMANTIC_DEFAULTS);
    await fs.writeJSON(cfgPath, cfg, { spaces: 2 });

    const reloaded = await fs.readJSON(cfgPath);
    expect(reloaded.verification.enabled).toBe(false);
    expect(seedVerificationDefaultsIfAbsent(reloaded)).toBe(false);
    expect(seedDriftDefaultsIfAbsent(reloaded)).toBe(false);
    expect(seedSemanticDefaultsIfAbsent(reloaded)).toBe(false);
  });
});
