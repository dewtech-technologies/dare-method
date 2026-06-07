import { describe, it, expect, vi, afterEach } from 'vitest';
import * as safeSpawnMod from '../../exec/safe-spawn.js';
import { checkTypes, typeCommandFor } from '../gates/type-check.js';

describe('typeCommandFor', () => {
  it('should_return_null_for_rust_stack', () => {
    expect(typeCommandFor('rust-axum', '/tmp')).toBeNull();
  });
});

describe('checkTypes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_skip_when_unavailable', async () => {
    const result = await checkTypes({
      stack: 'rust-axum',
      cwd: '/tmp',
      timeoutSeconds: 30,
    });
    expect(result.verdict).toBe('SKIP');
    expect(result.reason).toContain('no type-checker');
  });

  it('should_pass_on_clean_ts', async () => {
    vi.spyOn(safeSpawnMod, 'safeSpawn').mockResolvedValue({
      code: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
    });

    const result = await checkTypes({
      stack: 'mcp-server-node-ts',
      cwd: '/tmp',
      timeoutSeconds: 60,
    });
    expect(result.verdict).toBe('PASS');
  });

  it('should_fail_on_type_error', async () => {
    vi.spyOn(safeSpawnMod, 'safeSpawn').mockResolvedValue({
      code: 2,
      stdout: '',
      stderr: 'error TS2322: Type string is not assignable to type number',
      timedOut: false,
    });

    const result = await checkTypes({
      stack: 'mcp-server-node-ts',
      cwd: '/tmp',
      timeoutSeconds: 60,
    });
    expect(result.verdict).toBe('FAIL');
    expect(result.reason).toContain('TS2322');
  });
});
