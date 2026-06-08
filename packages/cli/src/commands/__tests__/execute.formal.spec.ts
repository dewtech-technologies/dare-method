import { describe, it, expect, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { DEFAULTS } from '../../verification/config.js';
import { createRunVerification } from '../../verification/runner.js';
import { FormalToolNotFoundError } from '../../verification/gates/formal/backend.js';
import {
  applyFormalFlags,
  formalToolErrorMessage,
  runPostRalphVerification,
  validateFormalBackend,
} from '../execute-verification.js';

describe('formal CLI wiring', () => {
  it('validateFormalBackend rejects unknown backend', () => {
    expect(validateFormalBackend('coq')).toBe(
      "Error: --formal-backend must be 'dafny', 'verus' or 'lean' (got 'coq')",
    );
    expect(validateFormalBackend('dafny')).toBeUndefined();
  });

  it('applyFormalFlags — --no-formal vence --formal', () => {
    const on = applyFormalFlags(DEFAULTS, { formal: true });
    expect(on.formal.enabled).toBe(true);
    const off = applyFormalFlags(on, { noFormal: true });
    expect(off.formal.enabled).toBe(false);
  });

  it('formalToolErrorMessage matches §5.2', () => {
    expect(formalToolErrorMessage('dafny', 'src/a.ts::f')).toBe(
      "Error: formal backend 'dafny' not found for marked module 'src/a.ts::f'. Install the toolchain or unmark the module.",
    );
  });

  it('runPostRalphVerification exit 5 on FormalToolNotFoundError', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'exec-formal-'));
    await fs.writeJson(path.join(cwd, 'dare.config.json'), {
      structure: 'mcp-server',
      mcpLanguage: 'node-ts',
      verification: {
        ...DEFAULTS,
        enabled: true,
        failToPass: { required: false },
        antiTamper: { enabled: false },
        mutation: { ...DEFAULTS.mutation, enabled: false },
        formal: { ...DEFAULTS.formal, enabled: true },
      },
    });

    const runVerification = vi.fn(async () => {
      throw new FormalToolNotFoundError('dafny', 'src/x.ts::f');
    });

    const result = await runPostRalphVerification(
      {
        taskId: 'task-f',
        cwd,
        stack: 'mcp-server-node-ts',
        verify: true,
      },
      runVerification,
    );

    expect(result.exitCode).toBe(5);
    expect(result.errorMessage).toContain("formal backend 'dafny'");
    await fs.remove(cwd).catch(() => undefined);
  });
});

describe('runVerification formal aspect', () => {
  it('formal SKIP when no marked module', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'runner-formal-'));
    const runVerification = createRunVerification({
      readArtifact: vi.fn(async () => undefined),
      checkFailToPass: vi.fn(),
      checkAntiTamper: vi.fn(),
      checkTypes: vi.fn(),
      adapterForStack: vi.fn(),
    });

    const result = await runVerification({
      taskId: 'task-f',
      stack: 'node-nestjs',
      cwd,
      config: {
        ...DEFAULTS,
        enabled: true,
        failToPass: { required: false },
        antiTamper: { enabled: false },
        typeCheck: { enabled: false },
        mutation: { ...DEFAULTS.mutation, enabled: false },
        formal: { ...DEFAULTS.formal, enabled: true },
      },
      changedFiles: [],
    });

    const formal = result.aspects.find((a) => a.aspect === 'formal');
    expect(formal?.verdict).toBe('SKIP');
    await fs.remove(cwd).catch(() => undefined);
  });
});
