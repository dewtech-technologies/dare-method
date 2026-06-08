import { describe, it, expect, vi } from 'vitest';
import { createCheckFormal } from '../runner.js';
import { FORMAL_DEFAULTS } from '../../../config.js';
import { FormalToolNotFoundError } from '../backend.js';
import type { FormalVerdict } from '../../../types.js';

const MARKER = {
  file: 'src/math.ts',
  symbol: 'add',
  source: 'config' as const,
};

function passVerdict(): FormalVerdict {
  return {
    backend: 'dafny',
    verified: true,
    stage: 'none',
    bypassDetected: false,
    repairIterations: 0,
    solverExitCode: 0,
    reason: 'dafny: verified',
    durationMs: 1,
  };
}

describe('checkFormal', () => {
  it('não-marcado ⇒ SKIP sem chamar backend.run', async () => {
    const run = vi.fn();
    const checkFormal = createCheckFormal({
      resolveFormalTargets: vi.fn(async () => []),
      backendForConfig: vi.fn(async () => ({
        backend: 'dafny' as const,
        minVersion: '4.0.0',
        isAvailable: async () => true,
        run,
      })),
    });

    const result = await checkFormal({
      taskId: 'task-f',
      stack: 'node-nestjs',
      cwd: '/tmp',
      config: { ...FORMAL_DEFAULTS, enabled: true },
      changedFiles: [],
    });

    expect(result.verdict).toBe('SKIP');
    expect(result.reason).toBe('no marked module');
    expect(run).not.toHaveBeenCalled();
  });

  it('marcado sem toolchain ⇒ FormalToolNotFoundError', async () => {
    const checkFormal = createCheckFormal({
      resolveFormalTargets: vi.fn(async () => [MARKER]),
      backendForConfig: vi.fn(async () => ({
        backend: 'dafny' as const,
        minVersion: '4.0.0',
        isAvailable: async () => false,
        run: vi.fn(),
      })),
    });

    await expect(
      checkFormal({
        taskId: 'task-f',
        stack: 'node-nestjs',
        cwd: '/tmp',
        config: { ...FORMAL_DEFAULTS, enabled: true },
        changedFiles: ['src/math.ts'],
      }),
    ).rejects.toBeInstanceOf(FormalToolNotFoundError);
  });

  it('prova aceita ⇒ PASS', async () => {
    const checkFormal = createCheckFormal({
      resolveFormalTargets: vi.fn(async () => [MARKER]),
      backendForConfig: vi.fn(async () => ({
        backend: 'dafny' as const,
        minVersion: '4.0.0',
        isAvailable: async () => true,
        run: vi.fn(async () => passVerdict()),
      })),
      detectBypass: vi.fn(() => ({ bypassDetected: false })),
      readSource: vi.fn(async () => 'honest source'),
      persistFormalProof: vi.fn(async () => undefined),
    });

    const result = await checkFormal({
      taskId: 'task-f',
      stack: 'node-nestjs',
      cwd: '/tmp',
      config: { ...FORMAL_DEFAULTS, enabled: true, antiBypass: true },
      changedFiles: ['src/math.ts'],
    });

    expect(result.verdict).toBe('PASS');
  });

  it('bypass detectado ⇒ FAIL apesar de solver pass', async () => {
    const checkFormal = createCheckFormal({
      resolveFormalTargets: vi.fn(async () => [MARKER]),
      backendForConfig: vi.fn(async () => ({
        backend: 'dafny' as const,
        minVersion: '4.0.0',
        isAvailable: async () => true,
        run: vi.fn(async () => passVerdict()),
      })),
      detectBypass: vi.fn(() => ({
        bypassDetected: true,
        pattern: 'assume(false)',
      })),
      readSource: vi.fn(async () => 'assume(false);'),
      persistFormalProof: vi.fn(async () => undefined),
    });

    const result = await checkFormal({
      taskId: 'task-f',
      stack: 'node-nestjs',
      cwd: '/tmp',
      config: { ...FORMAL_DEFAULTS, enabled: true, antiBypass: true },
      changedFiles: ['src/math.ts'],
    });

    expect(result.verdict).toBe('FAIL');
    expect(result.reason).toContain('bypass pattern');
  });
});
