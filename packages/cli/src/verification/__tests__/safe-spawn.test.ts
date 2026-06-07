import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { safeSpawn, sanitizeEnv } from '../../exec/safe-spawn.js';

describe('safeSpawn', () => {
  it('should_run_argv_without_shell', async () => {
    const result = await safeSpawn(
      process.execPath,
      ['-e', "process.stdout.write('ok')"],
      { cwd: os.tmpdir(), timeoutSeconds: 30 },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('ok');
    expect(result.timedOut).toBe(false);
  });

  it('should_not_interpret_shell_metachars', async () => {
    const result = await safeSpawn(
      process.execPath,
      ['-e', "process.stdout.write('literal')"],
      { cwd: os.tmpdir(), timeoutSeconds: 30 },
    );
    expect(result.stdout).toBe('literal');
  });

  it('should_timeout', async () => {
    const result = await safeSpawn(
      process.execPath,
      ['-e', "setTimeout(() => {}, 60000)"],
      { cwd: os.tmpdir(), timeoutSeconds: 1, maxChars: 500 },
    );
    expect(result.timedOut).toBe(true);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('timed out');
  });

  it('should_truncate_output', async () => {
    const result = await safeSpawn(
      process.execPath,
      ['-e', "process.stdout.write('x'.repeat(5000))"],
      { cwd: os.tmpdir(), timeoutSeconds: 30, maxChars: 100 },
    );
    expect(result.stdout.length).toBeLessThanOrEqual(100);
  });

  it('should_sanitize_env', () => {
    const env = sanitizeEnv({
      PATH: '/bin',
      MY_SECRET: 'super-secret',
      HOME: '/home/user',
    });
    expect(env.PATH).toBe('/bin');
    expect(env.HOME).toBe('/home/user');
    expect(env.MY_SECRET).toBeUndefined();
  });
});
