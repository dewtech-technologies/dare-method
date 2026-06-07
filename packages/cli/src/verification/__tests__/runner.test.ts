import { describe, it, expect, vi } from 'vitest';
import { DEFAULTS } from '../config.js';
import type { VerificationConfig } from '../types.js';
import type { AspectResult } from '../types.js';
import {
  createRunVerification,
  type RunVerificationOptions,
  type VerificationDeps,
} from '../runner.js';
import { FailToPassMissingError } from '../gates/fail-to-pass.js';
import { MutationToolNotFoundError } from '../gates/mutation/adapter.js';
import type { MutationAdapter } from '../gates/mutation/adapter.js';

function passAspect(
  aspect: AspectResult['aspect'],
  reason = 'ok',
): AspectResult {
  return { aspect, verdict: 'PASS', reason, durationMs: 1 };
}

function failAspect(
  aspect: AspectResult['aspect'],
  reason = 'failed',
): AspectResult {
  return { aspect, verdict: 'FAIL', reason, durationMs: 1 };
}

function enabledConfig(
  patch: Partial<VerificationConfig> = {},
): VerificationConfig {
  return {
    ...DEFAULTS,
    enabled: true,
    failToPass: { required: true },
    antiTamper: { enabled: false },
    typeCheck: { enabled: false },
    mutation: {
      ...DEFAULTS.mutation,
      enabled: true,
      minScore: 0.7,
    },
    ...patch,
  };
}

function baseOpts(
  patch: Partial<RunVerificationOptions> = {},
): RunVerificationOptions {
  return {
    taskId: 'task-runner',
    stack: 'mcp-server-node-ts',
    cwd: '/tmp/project',
    config: enabledConfig(),
    changedFiles: ['src/a.ts'],
    ...patch,
  };
}

function mockAdapter(
  overrides: Partial<MutationAdapter> = {},
): MutationAdapter {
  return {
    tool: 'stryker',
    stacks: ['mcp-server-node-ts'],
    isAvailable: async () => true,
    run: async () => ({
      killed: 8,
      survived: 2,
      noCoverage: 0,
      timedOut: false,
      tool: 'stryker',
      score: 0.8,
    }),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<VerificationDeps> = {}): VerificationDeps {
  return {
    readArtifact: async () => ({
      specGlob: 'spec.test.ts',
      failToPassBaseline: {
        recordedAt: '2026-01-01',
        ranAgainst: 'abc',
        failed: ['spec.test.ts::x'],
        allFailed: true,
      },
    }),
    checkFailToPass: async () => passAspect('fail-to-pass'),
    checkAntiTamper: async () => passAspect('anti-tamper'),
    checkTypes: async () => passAspect('type'),
    adapterForStack: async () => mockAdapter(),
    ...overrides,
  };
}

describe('runVerification', () => {
  it('should_noop_when_disabled', async () => {
    const run = createRunVerification(makeDeps());
    const result = await run(
      baseOpts({ config: { ...DEFAULTS, enabled: false } }),
    );

    expect(result.passed).toBe(true);
    expect(result.aspects).toHaveLength(0);
  });

  it('should_throw_fail_to_pass_missing', async () => {
    const run = createRunVerification(
      makeDeps({ readArtifact: async () => undefined }),
    );

    await expect(run(baseOpts())).rejects.toThrow(FailToPassMissingError);
  });

  it('should_short_circuit_on_fail_to_pass_fail', async () => {
    const checkFailToPass = vi.fn(async () => failAspect('fail-to-pass'));
    const checkAntiTamper = vi.fn(async () => passAspect('anti-tamper'));
    const adapterForStack = vi.fn(async () => mockAdapter());

    const run = createRunVerification(
      makeDeps({ checkFailToPass, checkAntiTamper, adapterForStack }),
    );
    const result = await run(baseOpts());

    expect(result.passed).toBe(false);
    expect(result.aspects).toHaveLength(1);
    expect(result.aspects[0]?.aspect).toBe('fail-to-pass');
    expect(checkAntiTamper).not.toHaveBeenCalled();
    expect(adapterForStack).not.toHaveBeenCalled();
  });

  it('should_throw_tool_not_found', async () => {
    const run = createRunVerification(
      makeDeps({
        adapterForStack: async () =>
          mockAdapter({ isAvailable: async () => false }),
      }),
    );

    await expect(run(baseOpts())).rejects.toThrow(MutationToolNotFoundError);
  });

  it('should_skip_mutation_when_zero_mutants', async () => {
    const run = createRunVerification(
      makeDeps({
        adapterForStack: async () =>
          mockAdapter({
            run: async () => ({
              killed: 0,
              survived: 0,
              noCoverage: 0,
              timedOut: false,
              tool: 'stryker',
              score: Number.NaN,
            }),
          }),
      }),
    );

    const result = await run(baseOpts());
    const mutation = result.aspects.find((a) => a.aspect === 'mutation');

    expect(result.passed).toBe(true);
    expect(mutation?.verdict).toBe('SKIP');
  });

  it('should_run_mutation_last_and_fail_below_minScore', async () => {
    const order: string[] = [];
    const run = createRunVerification(
      makeDeps({
        checkFailToPass: async () => {
          order.push('fail-to-pass');
          return passAspect('fail-to-pass');
        },
        checkTypes: async () => {
          order.push('type');
          return passAspect('type');
        },
        adapterForStack: async () => {
          order.push('mutation-adapter');
          return mockAdapter({
            run: async () => {
              order.push('mutation-run');
              return {
                killed: 2,
                survived: 8,
                noCoverage: 0,
                timedOut: false,
                tool: 'stryker',
                score: 0.2,
              };
            },
          });
        },
      }),
    );

    const result = await run(
      baseOpts({
        config: enabledConfig({
          antiTamper: { enabled: false },
          typeCheck: { enabled: true },
          mutation: { ...DEFAULTS.mutation, enabled: true, minScore: 0.7 },
        }),
      }),
    );

    expect(order).toEqual([
      'fail-to-pass',
      'type',
      'mutation-adapter',
      'mutation-run',
    ]);
    expect(result.passed).toBe(false);
    const mutation = result.aspects.find((a) => a.aspect === 'mutation');
    expect(mutation?.verdict).toBe('FAIL');
    expect(mutation?.score).toBeCloseTo(0.2, 5);
  });

  it('should_pass_when_all_aspects_pass', async () => {
    const run = createRunVerification(
      makeDeps({
        readArtifact: async () => ({
          specGlob: 'spec.test.ts',
          failToPassBaseline: {
            recordedAt: '2026-01-01',
            ranAgainst: 'abc',
            failed: ['spec.test.ts::x'],
            allFailed: true,
          },
          tamperSnapshot: {
            assertionCount: 5,
            testFiles: ['spec.test.ts'],
          },
        }),
        checkFailToPass: async () => passAspect('fail-to-pass'),
        checkAntiTamper: async () => passAspect('anti-tamper'),
        checkTypes: async () => passAspect('type'),
        adapterForStack: async () => mockAdapter(),
      }),
    );

    const result = await run(
      baseOpts({
        config: enabledConfig({
          antiTamper: { enabled: true },
          typeCheck: { enabled: true },
        }),
      }),
    );

    expect(result.passed).toBe(true);
    expect(result.mutationScore).toBeCloseTo(0.8, 5);
    expect(result.aspects.map((a) => a.aspect)).toEqual([
      'fail-to-pass',
      'anti-tamper',
      'type',
      'mutation',
    ]);
  });
});
