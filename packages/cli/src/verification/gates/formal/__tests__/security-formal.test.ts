import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCheckFormal } from '../runner.js';
import { detectBypass } from '../anti-bypass.js';
import { resolveFormalTargets } from '../marker.js';
import { FORMAL_DEFAULTS } from '../../../config.js';
import { sanitizeEnv } from '../../../../exec/safe-spawn.js';
import { assertRelativeSafe } from '../../../../utils/path-safety.js';
import type { FormalVerdict } from '../../../types.js';

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../..',
);

const FORMAL_SRC = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const FIXTURES_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../fixtures/formal',
);

const LLM_NETWORK = /anthropic|openai|fetch\(|https?:\/\//i;
const SHELL_TRUE = /shell\s*:\s*true/;
const FORMAL_DEPS = /\b(dafny|z3|verus|lean|lake)\b/i;

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== '__tests__') {
      out.push(...(await collectTsFiles(full)));
    } else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('RS-02 anti-bypass', () => {
  it('assume(false) ⇒ bypassDetected mesmo com solver exit 0', () => {
    expect(
      detectBypass({ specSource: 'assume(false);', implSource: '' }).bypassDetected,
    ).toBe(true);
  });

  it('ensures true ⇒ bypassDetected', () => {
    expect(
      detectBypass({ specSource: 'ensures true;', implSource: '' }).bypassDetected,
    ).toBe(true);
  });

  it('100% dos bypass fixtures rejeitados (O-06)', async () => {
    const suite = (await fs.readJson(path.join(FIXTURES_ROOT, 'suite.json'))) as {
      fixtures: string[];
    };
    for (const id of suite.fixtures) {
      const dir = path.join(FIXTURES_ROOT, id);
      const expected = (await fs.readJson(path.join(dir, 'expected.json'))) as {
        bypassExpected: boolean;
      };
      if (!expected.bypassExpected) continue;
      const spec = await fs.readFile(path.join(dir, 'spec.dfy'), 'utf8');
      const impl = await fs.readFile(path.join(dir, 'impl.ts'), 'utf8');
      expect(detectBypass({ specSource: spec, implSource: impl }).bypassDetected).toBe(
        true,
      );
    }
  });

  it('spec honesta não bloqueada', async () => {
    const spec = await fs.readFile(
      path.join(FIXTURES_ROOT, 'fix-001-add-honest/spec.dfy'),
      'utf8',
    );
    const impl = await fs.readFile(
      path.join(FIXTURES_ROOT, 'fix-001-add-honest/impl.ts'),
      'utf8',
    );
    expect(detectBypass({ specSource: spec, implSource: impl }).bypassDetected).toBe(
      false,
    );
  });

  it('verified=false quando solver passou mas bypassDetected=true', async () => {
    const checkFormal = createCheckFormal({
      resolveFormalTargets: async () => [
        { file: 'src/a.ts', symbol: 'f', source: 'config' },
      ],
      backendForConfig: async () => ({
        backend: 'dafny' as const,
        minVersion: '4.0.0',
        isAvailable: async () => true,
        run: async () =>
          ({
            backend: 'dafny',
            verified: true,
            stage: 'none',
            bypassDetected: false,
            repairIterations: 0,
            solverExitCode: 0,
            reason: 'solver ok',
            durationMs: 1,
          }) satisfies FormalVerdict,
      }),
      detectBypass: () => ({ bypassDetected: true, pattern: 'assume(false)' }),
      readSource: async () => 'assume(false);',
      persistFormalProof: async () => undefined,
    });
    const result = await checkFormal({
      taskId: 't',
      stack: 'node',
      cwd: process.cwd(),
      config: { ...FORMAL_DEFAULTS, enabled: true, antiBypass: true },
      changedFiles: [],
    });
    expect(result.verdict).toBe('FAIL');
  });
});

describe('RS-01 specs não-computáveis + paths', () => {
  it('documenta recomendação Prop/quantificadores em anti-bypass.ts', async () => {
    const src = await fs.readFile(path.join(FORMAL_SRC, 'anti-bypass.ts'), 'utf8');
    expect(src).toMatch(/Prop/);
    expect(src).toMatch(/quantificadores/);
  });

  it('assertRelativeSafe reprova ../escape', () => {
    expect(() => assertRelativeSafe('../etc/passwd')).toThrow(/\.\./);
  });

  it('assertRelativeSafe reprova path absoluto', () => {
    expect(() => assertRelativeSafe('/etc/passwd')).toThrow(/absolute/);
    expect(() => assertRelativeSafe('C:\\Windows\\System32')).toThrow(/absolute/);
  });

  it('resolveFormalTargets reprova modules com path escape', async () => {
    await expect(
      resolveFormalTargets({
        cwd: process.cwd(),
        changedFiles: [],
        config: { ...FORMAL_DEFAULTS, modules: ['../x.ts::f'] },
      }),
    ).rejects.toThrow(/\.\./);
  });
});

describe('RS-06 veredito não-falsificável', () => {
  it('checkFormal PASS só após backend.run', async () => {
    let ran = false;
    const checkFormal = createCheckFormal({
      resolveFormalTargets: async () => [
        { file: 'src/a.ts', symbol: 'f', source: 'config' },
      ],
      backendForConfig: async () => ({
        backend: 'dafny' as const,
        minVersion: '4.0.0',
        isAvailable: async () => true,
        run: async () => {
          ran = true;
          return {
            backend: 'dafny',
            verified: true,
            stage: 'none',
            bypassDetected: false,
            repairIterations: 0,
            solverExitCode: 0,
            reason: 'ok',
            durationMs: 1,
          } satisfies FormalVerdict;
        },
      }),
      detectBypass: () => ({ bypassDetected: false }),
      readSource: async () => 'ok',
      persistFormalProof: async () => undefined,
    });
    const result = await checkFormal({
      taskId: 't',
      stack: 'node',
      cwd: process.cwd(),
      config: { ...FORMAL_DEFAULTS, enabled: true },
      changedFiles: [],
    });
    expect(ran).toBe(true);
    expect(result.verdict).toBe('PASS');
  });

  it('zero LLM/rede em gates/formal production sources', async () => {
    const files = await collectTsFiles(FORMAL_SRC);
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      expect(content).not.toMatch(LLM_NETWORK);
    }
  });

  it('zero shell:true em gates/formal production sources', async () => {
    const files = await collectTsFiles(FORMAL_SRC);
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      expect(content).not.toMatch(SHELL_TRUE);
    }
  });
});

describe('RS-03 sem segredos', () => {
  it('sanitizeEnv remove SECRET/TOKEN/AWS_* do env filho', () => {
    const env = sanitizeEnv({
      PATH: '/bin',
      SECRET: 'super-secret-value',
      AWS_ACCESS_KEY_ID: 'AKIA123',
      TOKEN: 'tok-xyz',
      HOME: '/home/user',
    });
    expect(env.SECRET).toBeUndefined();
    expect(env.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(env.TOKEN).toBeUndefined();
    expect(env.PATH).toBe('/bin');
    expect(env.HOME).toBe('/home/user');
  });
});

describe('RS-05 sem dep formal', () => {
  it('package.json raiz e CLI não listam toolchain formal como dep', async () => {
    for (const rel of ['package.json', 'packages/cli/package.json']) {
      const pkg = (await fs.readJson(path.join(REPO_ROOT, rel))) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      const names = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
        ...Object.keys(pkg.optionalDependencies ?? {}),
      ];
      for (const name of names) {
        expect(name).not.toMatch(FORMAL_DEPS);
      }
    }
  });
});
