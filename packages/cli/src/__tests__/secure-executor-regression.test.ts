import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { signArtifact } from '../guard/provenance.js';

type ExecuteModule = typeof import('../commands/execute.js');
type AgentRunInput = import('../agent/driver.js').AgentRunInput;

interface DagFixtureTask {
  readonly id: string;
  readonly dependsOn?: ReadonlyArray<string>;
  readonly specFile?: string;
  readonly prompt?: string;
}

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWED_REL = path.join('src', 'agent', 'drivers', 'claude.ts');
const FORBIDDEN =
  /(?:import|require)\s*\(?['"]@anthropic-ai|from\s+['"]@anthropic-ai/;

function keyPairPem(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function walkTsFiles(dir: string, base = pkgRoot): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      files.push(...walkTsFiles(full, base));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) continue;
    files.push(path.relative(base, full));
  }
  return files;
}

function listSourceFilesForDeterministicPath(): string[] {
  return walkTsFiles(path.join(pkgRoot, 'src')).filter(
    (f) => path.normalize(f) !== path.normalize(ALLOWED_REL),
  );
}

function findLlmSdkImportsOutsideDriver(): string[] {
  return listSourceFilesForDeterministicPath().filter((rel) => {
    const content = readFileSync(path.join(pkgRoot, rel), 'utf8');
    return FORBIDDEN.test(content);
  });
}

describe('secure executor regression audit (task-620)', () => {
  let projectRoot: string;
  let exitCode: number | undefined;
  let stdout: string;
  let stderr: string;

  beforeEach(async () => {
    vi.resetModules();
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-secure-regression-'));
    await fs.ensureDir(path.join(projectRoot, 'DARE', 'EXECUTION'));
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), {}, { spaces: 2 });
    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);

    exitCode = undefined;
    stdout = '';
    stderr = '';

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error(`exit:${code}`);
    });
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout += args.map(String).join(' ') + '\n';
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      stderr += args.map(String).join(' ') + '\n';
    });
  });

  afterEach(async () => {
    const execute = await import('../commands/execute.js');
    execute.setResolveDriverForTests(null);
    execute.setPreflightGuardForTests(null);
    execute.setRankApprovalForTests(null);

    const claude = await import('../agent/drivers/claude.js');
    claude.setClaudeSdkImporterForTests(null);

    vi.restoreAllMocks();
    await fs.remove(projectRoot).catch(() => undefined);
  });

  async function loadExecute(): Promise<ExecuteModule> {
    return import('../commands/execute.js');
  }

  async function runExecute(execute: ExecuteModule, args: string[]): Promise<void> {
    try {
      await execute.executeCommand.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('exit:')) throw err;
    }
  }

  async function writeDag(tasks: ReadonlyArray<DagFixtureTask>): Promise<void> {
    const lines: string[] = [
      'title: "Secure Executor Regression Fixture"',
      'version: "1.0.0"',
      'models:',
      '  HIGH: claude-sonnet',
      '  MED: claude-sonnet',
      '  LOW: claude-sonnet',
      'tasks:',
    ];

    for (const task of tasks) {
      const dependsOn = task.dependsOn ?? [];
      lines.push(`  - id: ${task.id}`);
      lines.push(`    title: "${task.id}"`);
      lines.push(
        dependsOn.length === 0
          ? '    depends_on: []'
          : `    depends_on: [${dependsOn.join(', ')}]`,
      );
      lines.push('    complexity: LOW');
      if (task.specFile) {
        lines.push(`    spec_file: ${task.specFile.replace(/\\/g, '/')}`);
      }
      lines.push('    subtask_prompt: |');
      lines.push(`      ${task.prompt ?? `run ${task.id}`}`);
    }

    await fs.writeFile(path.join(projectRoot, 'DARE', 'dare-dag.yaml'), `${lines.join('\n')}\n`);
  }

  async function writeGuardConfig(guardBlock: Record<string, unknown>): Promise<void> {
    await fs.writeJson(path.join(projectRoot, 'dare.config.json'), { guard: guardBlock }, { spaces: 2 });
  }

  it('budget_never_exceeded_with_best_of_n', async () => {
    await writeDag([
      { id: 'task-budget' },
      { id: 'task-next', dependsOn: ['task-budget'] },
    ]);
    const execute = await loadExecute();

    const runSpy = vi.fn(async (input: AgentRunInput) => {
      const candidateId = path.basename(input.worktree);
      if (candidateId === 'cand-3') {
        await new Promise<void>((resolve) => {
          if (input.signal.aborted) {
            resolve();
            return;
          }
          input.signal.addEventListener('abort', () => resolve(), { once: true });
          setTimeout(resolve, 200);
        });
        return {
          status: 'aborted' as const,
          worktree: input.worktree,
          summary: 'aborted-by-budget',
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'budget-driver' },
          failureSignature: 'budget-abort',
        };
      }
      return {
        status: 'implemented' as const,
        worktree: input.worktree,
        summary: 'candidate-done',
        usage: { inputTokens: 7, outputTokens: 0, costUsd: 0.01, model: 'budget-driver' },
      };
    });

    execute.setResolveDriverForTests(async () => ({
      id: 'budget-driver',
      requiresNetwork: false,
      run: runSpy,
    }));

    await runExecute(execute, [
      '--agent',
      '--dry-run',
      '--best-of',
      '3',
      '--budget-tokens',
      '14',
      '--require-approval',
      'none',
      '--no-graph',
    ]);

    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { status?: string; tokens?: number }>;
    };

    expect(runSpy).toHaveBeenCalledTimes(3);
    expect(
      runSpy.mock.calls.every(
        ([input]) => (input as AgentRunInput).taskId === 'task-budget',
      ),
    ).toBe(true);
    expect(state.tasks['task-budget']?.status).toBe('DONE');
    expect(state.tasks['task-budget']?.tokens).toBe(14);
    expect(state.tasks['task-next']?.status).toBe('PENDING');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Escalating');
  });

  it('data_channel_never_executes_shell', async () => {
    const hookPath = '.dare/hooks/preflight.sh';
    await fs.ensureDir(path.join(projectRoot, '.dare', 'hooks'));
    await fs.writeFile(path.join(projectRoot, hookPath), '#!/usr/bin/env bash\necho insecure', 'utf8');
    await writeDag([{ id: 'task-hook', specFile: hookPath }]);
    await writeGuardConfig({
      enabled: true,
      onExecute: true,
      unicode: 'strip',
      trustedPaths: ['DARE/EXECUTION/**'],
      signing: { enabled: false },
    });

    const execute = await loadExecute();
    const safeSpawnModule = await import('../exec/safe-spawn.js');
    const shellSpy = vi.spyOn(safeSpawnModule, 'safeSpawn');
    const runSpy = vi.fn(async (input: AgentRunInput) => ({
      status: 'implemented' as const,
      worktree: input.worktree,
      summary: 'should-not-run',
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'guard-driver' },
    }));
    execute.setResolveDriverForTests(async () => ({
      id: 'guard-driver',
      requiresNetwork: false,
      run: runSpy,
    }));

    await runExecute(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { error?: string }>;
    };
    expect(exitCode).toBe(6);
    expect(runSpy).not.toHaveBeenCalled();
    expect(shellSpy).not.toHaveBeenCalled();
    expect(state.tasks['task-hook']?.error).toContain('boundary-violation');
    expect(stdout).not.toContain('DONE');
  });

  it('tampered_signed_artifact_fails', async () => {
    const { privateKey, publicKey } = keyPairPem();
    const specPath = 'DARE/EXECUTION/task-tampered.md';
    const original = 'trusted deterministic artifact';
    const tampered = `${original}!`;

    await fs.ensureDir(path.join(projectRoot, 'keys'));
    await fs.writeFile(path.join(projectRoot, 'keys', 'minisign.pub'), publicKey, 'utf8');
    await fs.writeFile(path.join(projectRoot, specPath), original, 'utf8');
    const signature = signArtifact(Buffer.from(original, 'utf8'), privateKey);
    await fs.writeFile(path.join(projectRoot, `${specPath}.minisig`), `${signature}\n`, 'utf8');
    await fs.writeFile(path.join(projectRoot, specPath), tampered, 'utf8');

    await writeDag([{ id: 'task-tamper', specFile: specPath }]);
    await writeGuardConfig({
      enabled: true,
      onExecute: true,
      unicode: 'strip',
      trustedPaths: ['DARE/EXECUTION/**'],
      signing: { enabled: true, publicKey: 'keys/minisign.pub' },
    });

    const execute = await loadExecute();
    const runSpy = vi.fn(async (input: AgentRunInput) => ({
      status: 'implemented' as const,
      worktree: input.worktree,
      summary: 'should-not-run',
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'guard-driver' },
    }));
    execute.setResolveDriverForTests(async () => ({
      id: 'guard-driver',
      requiresNetwork: false,
      run: runSpy,
    }));

    await runExecute(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { error?: string }>;
    };
    expect(exitCode).toBe(6);
    expect(runSpy).not.toHaveBeenCalled();
    expect(state.tasks['task-tamper']?.error).toContain('signature-invalid');
  });

  it('signed_poisoned_artifact_fails', async () => {
    const { privateKey, publicKey } = keyPairPem();
    const specPath = 'DARE/EXECUTION/task-poisoned.md';
    const poisoned = 'safe-title\u200Boverride';

    await fs.ensureDir(path.join(projectRoot, 'keys'));
    await fs.writeFile(path.join(projectRoot, 'keys', 'minisign.pub'), publicKey, 'utf8');
    await fs.writeFile(path.join(projectRoot, specPath), poisoned, 'utf8');
    const signature = signArtifact(Buffer.from(poisoned, 'utf8'), privateKey);
    await fs.writeFile(path.join(projectRoot, `${specPath}.minisig`), `${signature}\n`, 'utf8');

    await writeDag([{ id: 'task-poisoned', specFile: specPath }]);
    await writeGuardConfig({
      enabled: true,
      onExecute: true,
      unicode: 'block',
      trustedPaths: ['DARE/EXECUTION/**'],
      signing: { enabled: true, publicKey: 'keys/minisign.pub' },
    });

    const execute = await loadExecute();
    const runSpy = vi.fn(async (input: AgentRunInput) => ({
      status: 'implemented' as const,
      worktree: input.worktree,
      summary: 'should-not-run',
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: 'guard-driver' },
    }));
    execute.setResolveDriverForTests(async () => ({
      id: 'guard-driver',
      requiresNetwork: false,
      run: runSpy,
    }));

    await runExecute(execute, ['--agent', '--dry-run', '--require-approval', 'none', '--no-graph']);

    const state = (await fs.readJson(path.join(projectRoot, '.dare', 'state.json'))) as {
      tasks: Record<string, { error?: string }>;
    };
    expect(exitCode).toBe(6);
    expect(runSpy).not.toHaveBeenCalled();
    expect(state.tasks['task-poisoned']?.error).toContain('[unicode:');
  });

  it('no_llm_in_deterministic_path', () => {
    // Reuso direto da invariante da task-604 (no-llm-in-core).
    const offenders = findLlmSdkImportsOutsideDriver();
    expect(offenders, `LLM SDK imported outside ${ALLOWED_REL}`).toEqual([]);

    const planted = "import Anthropic from '@anthropic-ai/sdk';";
    expect(FORBIDDEN.test(planted)).toBe(true);
  });
});
