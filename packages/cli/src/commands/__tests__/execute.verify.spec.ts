import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { FailToPassMissingError } from '../../verification/gates/fail-to-pass.js';
import { MutationToolNotFoundError } from '../../verification/gates/mutation/adapter.js';
import { DEFAULTS } from '../../verification/config.js';
import type { VerificationResult } from '../../verification/types.js';
import {
  shouldRunVerification,
  failToPassMissingMessage,
  mutationToolErrorMessage,
  runPostRalphVerification,
  formatVerdictOutput,
} from '../execute-verification.js';

function passVerification(taskId: string): VerificationResult {
  return {
    taskId,
    passed: true,
    aspects: [{ aspect: 'mutation', verdict: 'PASS', score: 0.9, reason: 'ok', durationMs: 1 }],
    mutationScore: 0.9,
    durationMs: 10,
  };
}

function failMutation(taskId: string): VerificationResult {
  return {
    taskId,
    passed: false,
    aspects: [
      {
        aspect: 'mutation',
        verdict: 'FAIL',
        score: 0.2,
        reason: 'mutation score 0.2000 < minScore 0.7',
        durationMs: 1,
      },
    ],
    mutationScore: 0.2,
    durationMs: 10,
  };
}

describe('execute verification wiring', () => {
  let cwd: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logSpy: any;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-exec-verify-'));
    await fs.writeJson(path.join(cwd, 'dare.config.json'), {
      structure: 'mcp-server',
      mcpLanguage: 'node-ts',
      verification: { ...DEFAULTS, enabled: true },
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(cwd).catch(() => undefined);
  });

  it('should_skip_verification_with_--no-verify', async () => {
    const result = await runPostRalphVerification({
      taskId: 'task-x',
      cwd,
      stack: 'mcp-server-node-ts',
      noVerify: true,
    });
    expect(result.ran).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('should_mark_done_when_ralph_and_verification_pass', async () => {
    const runVerification = vi.fn(async () => passVerification('task-pass'));
    const result = await runPostRalphVerification(
      {
        taskId: 'task-pass',
        cwd,
        stack: 'mcp-server-node-ts',
        verify: true,
      },
      runVerification,
    );

    expect(result.ran).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(runVerification).toHaveBeenCalledOnce();
    expect(result.verdict?.action).toBe('DONE');
  });

  it('should_exit_1_and_fail_when_mutation_below_minScore', async () => {
    const result = await runPostRalphVerification(
      {
        taskId: 'task-fail',
        cwd,
        stack: 'mcp-server-node-ts',
        verify: true,
      },
      vi.fn(async () => failMutation('task-fail')),
    );

    expect(result.ran).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.verificationResult?.passed).toBe(false);
  });

  it('should_exit_4_when_fail_to_pass_missing', async () => {
    const result = await runPostRalphVerification(
      {
        taskId: 'task-ftp',
        cwd,
        stack: 'mcp-server-node-ts',
        verify: true,
      },
      vi.fn(async () => {
        throw new FailToPassMissingError('task-ftp');
      }),
    );

    expect(result.exitCode).toBe(4);
    expect(result.errorMessage).toBe(failToPassMissingMessage('task-ftp'));
  });

  it('should_exit_3_when_mutation_tool_missing', async () => {
    const result = await runPostRalphVerification(
      {
        taskId: 'task-mut',
        cwd,
        stack: 'mcp-server-node-ts',
        verify: true,
      },
      vi.fn(async () => {
        throw new MutationToolNotFoundError('stryker');
      }),
    );

    expect(result.exitCode).toBe(3);
    expect(result.errorMessage).toBe(
      mutationToolErrorMessage('stryker', 'mcp-server-node-ts'),
    );
  });

  it('should_emit_verdict_json', () => {
    formatVerdictOutput(
      {
        action: 'CONTINUE',
        attempt: 2,
        saturated: false,
        reason: 'decay policy: continue',
      },
      true,
    );
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({
        action: 'CONTINUE',
        attempt: 2,
        saturated: false,
        reason: 'decay policy: continue',
      }),
    );
  });

  it('should_run_verification_when_config_enabled_without_flag', async () => {
    const runVerification = vi.fn(async () => passVerification('task-cfg'));
    const result = await runPostRalphVerification(
      { taskId: 'task-cfg', cwd, stack: 'mcp-server-node-ts' },
      runVerification,
    );
    expect(result.ran).toBe(true);
    expect(runVerification).toHaveBeenCalled();
  });

  it('should_not_run_when_verification_disabled', async () => {
    await fs.writeJson(path.join(cwd, 'dare.config.json'), {
      structure: 'mcp-server',
      mcpLanguage: 'node-ts',
    });
    const runVerification = vi.fn();
    const result = await runPostRalphVerification(
      { taskId: 'task-off', cwd, stack: 'mcp-server-node-ts' },
      runVerification,
    );
    expect(result.ran).toBe(false);
    expect(runVerification).not.toHaveBeenCalled();
  });
});

describe('shouldRunVerification', () => {
  it('respects no-verify over verify and config', () => {
    expect(
      shouldRunVerification({ verify: true, noVerify: true, configEnabled: true }),
    ).toBe(false);
    expect(
      shouldRunVerification({ verify: false, noVerify: false, configEnabled: true }),
    ).toBe(true);
  });
});
