import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execSync, type ExecException } from 'node:child_process';
import { generateProjectStructure } from '../../utils/project-generator.js';

const CLI = path.resolve('dist/bin/dare.js');

describe('dare init — non-interactive validation', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-init-spec-'));
  });

  afterEach(async () => {
    await fs.remove(cwd).catch(() => undefined);
  });

  function runInit(args: string[]): { code: number; stderr: string } {
    const quoted = args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ');
    try {
      execSync(`node "${CLI}" init ${quoted}`, { cwd, encoding: 'utf-8', stdio: 'pipe' });
      return { code: 0, stderr: '' };
    } catch (err) {
      const e = err as ExecException & { stderr?: string; status?: number };
      return { code: e.status ?? 1, stderr: e.stderr?.toString() ?? '' };
    }
  }

  it('runNonInteractive rejects traversal and does not create output dir', () => {
    const result = runInit(['../../tmp/x', '--non-interactive', '--stack', 'go-gin']);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/simple directory name/);
    expect(fs.existsSync(path.join(cwd, '../../tmp/x'))).toBe(false);
    expect(fs.readdirSync(cwd)).toHaveLength(0);
  });

  it('runNonInteractive accepts valid-name and starts scaffolding', () => {
    const result = runInit(['valid-name', '--non-interactive', '--stack', 'go-gin']);
    // Bootstrap may fail without go/docker — validation must pass (not name error).
    if (result.code !== 0) {
      expect(result.stderr).not.toMatch(/simple directory name/);
      expect(result.stderr).not.toMatch(/lowercase letters/);
    }
    expect(fs.existsSync(path.join(cwd, 'valid-name'))).toBe(true);
  });
});

describe('generateProjectStructure — assertWithinCwd guard', () => {
  it('rejects outputDir outside cwd even if caller bypasses init', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-init-out-'));
    try {
      await expect(
        generateProjectStructure({
          name: 'evil',
          structure: 'backend',
          backend: 'go-gin',
          outputDir: outside,
          skipBootstrap: true,
          toolchain: 'auto',
          ide: 'cursor',
          graphrag: 'sqlite',
          mcp: false,
        }),
      ).rejects.toThrow(/must stay inside the current working directory/);
      expect(await fs.pathExists(path.join(outside, 'DARE'))).toBe(false);
    } finally {
      await fs.remove(outside).catch(() => undefined);
    }
  });

  it('creates valid-name under cwd with skipBootstrap', async () => {
    const base = path.join(
      process.cwd(),
      `.dare-init-ok-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const outDir = path.join(base, 'valid-name');
    try {
      await generateProjectStructure({
        name: 'valid-name',
        structure: 'backend',
        backend: 'go-gin',
        outputDir: outDir,
        skipBootstrap: true,
        toolchain: 'auto',
        ide: 'cursor',
        graphrag: 'sqlite',
        mcp: false,
      });
      expect(await fs.pathExists(outDir)).toBe(true);
      expect(await fs.pathExists(path.join(outDir, 'DARE'))).toBe(true);
    } finally {
      await fs.remove(base).catch(() => undefined);
    }
  });
});
