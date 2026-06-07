import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import {
  gatesFor,
  resolveStackFromConfig,
  resolvePythonBin,
  runRalphLoop,
  formatGateCommand,
} from '../../dag-runner/ralph-loop.js';
import * as safeSpawnMod from '../../exec/safe-spawn.js';

describe('gatesFor', () => {
  it('returns build/test/lint argv for php-laravel', () => {
    const gates = gatesFor('php-laravel');
    expect(gates.map((g) => g.name)).toEqual(['build', 'test', 'lint']);
    const test = gates.find((g) => g.name === 'test');
    expect(test?.command).toBe('php');
    expect(test?.args).toEqual(['artisan', 'test']);
  });

  it('returns argv for node-nestjs', () => {
    const gates = gatesFor('node-nestjs');
    expect(gates.map((g) => g.name)).toEqual(['build', 'test', 'lint']);
    const build = gates.find((g) => g.name === 'build');
    expect(build?.args).toContain('run');
    expect(build?.args).toContain('build');
  });

  it('returns argv for rust-axum', () => {
    const gates = gatesFor('rust-axum');
    const lint = gates.find((g) => g.name === 'lint');
    expect(lint?.command).toBe('cargo');
    expect(lint?.args).toContain('clippy');
  });

  it('returns argv for go-gin', () => {
    const gates = gatesFor('go-gin');
    expect(gates.find((g) => g.name === 'build')?.args).toEqual(['build', './...']);
    expect(gates.find((g) => g.name === 'test')?.args).toEqual(['test', './...']);
    expect(gates.find((g) => g.name === 'lint')?.args).toEqual(['vet', './...']);
  });

  it('returns the same gates for go-stdlib', () => {
    expect(gatesFor('go-stdlib')).toEqual(gatesFor('go-gin'));
  });

  it('returns python argv using resolvePythonBin', () => {
    const cwd = path.join(os.tmpdir(), 'ralph-py-gates');
    const gates = gatesFor('python-fastapi', cwd);
    expect(gates).toHaveLength(3);
    const lint = gates.find((g) => g.name === 'lint');
    expect(lint?.command).toBe(resolvePythonBin(cwd, 'ruff'));
    expect(lint?.args).toEqual(['check', '.']);
  });

  it('splits leptos lint into clippy and fmt gates', () => {
    const gates = gatesFor('rust-leptos');
    const lintGates = gates.filter((g) => g.name === 'lint');
    expect(lintGates).toHaveLength(2);
    expect(lintGates[0]?.args).toContain('clippy');
    expect(lintGates[1]?.args).toEqual(['fmt', '--check']);
  });

  it('throws for unknown stack', () => {
    expect(() => gatesFor('elixir-phoenix')).toThrow(/no gate definition/);
  });
});

describe('resolvePythonBin', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = path.join(
      os.tmpdir(),
      `ralph-venv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.ensureDir(cwd);
  });

  afterEach(async () => {
    await fs.remove(cwd).catch(() => undefined);
  });

  it('prefers posix venv bin when present', async () => {
    const bin = path.join(cwd, '.venv', 'bin', 'pytest');
    await fs.ensureDir(path.dirname(bin));
    await fs.writeFile(bin, '');
    expect(resolvePythonBin(cwd, 'pytest')).toBe(bin);
  });

  it('falls back to bare tool name', () => {
    expect(resolvePythonBin(cwd, 'pytest')).toBe('pytest');
  });
});

describe('resolveStackFromConfig', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = path.join(
      os.tmpdir(),
      `dare-stack-resolve-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.ensureDir(cwd);
  });

  afterEach(async () => {
    await fs.remove(cwd).catch(() => undefined);
  });

  it('reads backend stack', async () => {
    await fs.writeJson(path.join(cwd, 'dare.config.json'), {
      structure: 'backend',
      backend: 'php-laravel',
    });
    expect(await resolveStackFromConfig(cwd)).toBe('php-laravel');
  });

  it('falls back to frontend when no backend', async () => {
    await fs.writeJson(path.join(cwd, 'dare.config.json'), {
      structure: 'frontend',
      frontend: 'react',
    });
    expect(await resolveStackFromConfig(cwd)).toBe('react');
  });

  it('builds composite key for mcp-server', async () => {
    await fs.writeJson(path.join(cwd, 'dare.config.json'), {
      structure: 'mcp-server',
      mcpLanguage: 'python',
    });
    expect(await resolveStackFromConfig(cwd)).toBe('mcp-server-python');
  });

  it('throws when config is absent', async () => {
    await expect(resolveStackFromConfig(cwd)).rejects.toThrow(
      /dare\.config\.json not found/,
    );
  });

  it('throws when config has no stack info', async () => {
    await fs.writeJson(path.join(cwd, 'dare.config.json'), {
      structure: 'monorepo',
    });
    await expect(resolveStackFromConfig(cwd)).rejects.toThrow(
      /no backend\/frontend/,
    );
  });
});

describe('runRalphLoop (integration)', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = path.join(
      os.tmpdir(),
      `dare-ralph-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.ensureDir(cwd);
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(cwd).catch(() => undefined);
  });

  it('returns passed=true when every gate exits 0', async () => {
    vi.spyOn(safeSpawnMod, 'safeSpawn').mockResolvedValue({
      code: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
    });

    const result = await runRalphLoop({ stack: 'go-gin', cwd });
    expect(result.passed).toBe(true);
    expect(safeSpawnMod.safeSpawn).toHaveBeenCalledTimes(3);
  });

  it('returns passed=false with stderr when a gate fails', async () => {
    vi.spyOn(safeSpawnMod, 'safeSpawn')
      .mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
      })
      .mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'build broke',
        timedOut: false,
      });

    const result = await runRalphLoop({ stack: 'go-gin', cwd });
    expect(result.passed).toBe(false);
    expect(result.failedAt).toBe('test');
    expect(result.stderr).toContain('build broke');
    expect(result.failedCommand).toBe(formatGateCommand(gatesFor('go-gin')[1]!));
  });

  it('maps timeout to non-zero exit', async () => {
    vi.spyOn(safeSpawnMod, 'safeSpawn').mockResolvedValue({
      code: 0,
      stdout: '',
      stderr: '',
      timedOut: true,
    });

    const result = await runRalphLoop({
      stack: 'go-gin',
      cwd,
      timeoutSeconds: 2,
    });
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain('timed out');
  });

  it('throws for unknown stack', async () => {
    await expect(
      runRalphLoop({ stack: 'elixir-phoenix', cwd }),
    ).rejects.toThrow(/no gate definition/);
  });
});
