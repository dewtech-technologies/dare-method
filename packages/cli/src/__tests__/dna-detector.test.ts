import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { detectDna } from '../utils/dna-detector.js';

const tmpDirs: string[] = [];

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-dna-'));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, content);
  }
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length) await fs.remove(tmpDirs.pop()!);
});

const AT = '2026-01-01T00:00:00.000Z';

describe('detectDna — tooling', () => {
  it('detects and parses Prettier + EditorConfig rules', async () => {
    const root = await makeProject({
      'package.json': '{"name":"app","version":"1.0.0"}',
      '.prettierrc': '{ "semi": false, "singleQuote": true, "tabWidth": 2 }',
      '.editorconfig': 'root = true\n[*]\nindent_style = space\nindent_size = 2\n',
      'src/core/x.ts': 'export const x = 1;\n',
    });

    const facts = await detectDna(root, AT);
    const prettier = facts.tooling.formatters.find((f) => f.name === 'Prettier');
    expect(prettier).toBeTruthy();
    expect(prettier?.rules?.semi).toBe(false);
    expect(prettier?.rules?.singleQuote).toBe(true);

    const editorconfig = facts.tooling.formatters.find((f) => f.name === 'EditorConfig');
    expect(editorconfig?.rules?.indent_style).toBe('space');
  });

  it('detects ESLint from package.json#eslintConfig', async () => {
    const root = await makeProject({
      'package.json': '{"name":"app","version":"1.0.0","eslintConfig":{"extends":"airbnb"}}',
      'src/core/x.ts': 'export const x = 1;\n',
    });
    const facts = await detectDna(root, AT);
    expect(facts.tooling.linters.some((l) => l.name === 'ESLint')).toBe(true);
  });
});

describe('detectDna — naming', () => {
  it('reports the dominant file-naming style per extension', async () => {
    const root = await makeProject({
      'src/api/user-controller.ts': 'export {};\n',
      'src/api/auth-controller.ts': 'export {};\n',
      'src/api/order-service.ts': 'export {};\n',
      'src/api/payment-gateway.ts': 'export {};\n',
    });
    const facts = await detectDna(root, AT);
    const ts = facts.naming.find((n) => n.extension === '.ts');
    expect(ts?.dominant).toBe('kebab-case');
  });
});

describe('detectDna — architecture & libraries & testing', () => {
  it('guesses layered/MVC from dirs and detects libs + test framework', async () => {
    const root = await makeProject({
      'package.json': JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { '@nestjs/core': '^10', '@prisma/client': '^5', zod: '^3' },
        devDependencies: { vitest: '^1' },
      }),
      'src/controllers/user.controller.ts': 'export class U {}\n',
      'src/services/user.service.ts': 'export class S {}\n',
      'src/repositories/user.repository.ts': 'export class R {}\n',
      'src/__tests__/user.test.ts': 'export const t = 1;\n',
    });

    const facts = await detectDna(root, AT);
    expect(facts.architecture.detectedLayers).toEqual(
      expect.arrayContaining(['controllers', 'services', 'repositories']),
    );
    expect(facts.architecture.guess).toMatch(/Layered/);
    expect(facts.libraries.orm).toBe('Prisma');
    expect(facts.libraries.http).toBe('NestJS');
    expect(facts.libraries.validation).toBe('Zod');
    expect(facts.testing.framework).toBe('Vitest');
    expect(facts.testing.testFiles).toBe(1);
  });
});

describe('detectDna — reuses reverse-facts when present', () => {
  it('reads the file inventory from DARE/REVERSE/reverse-facts.json', async () => {
    const root = await makeProject({
      'DARE/REVERSE/reverse-facts.json': JSON.stringify({
        modules: [{ id: 'm', name: 'm', path: 'm', files: ['m/alpha-thing.ts', 'm/beta-thing.ts'] }],
      }),
    });
    const facts = await detectDna(root, AT);
    expect(facts.fileInventorySource).toBe('reverse-facts');
    const ts = facts.naming.find((n) => n.extension === '.ts');
    expect(ts?.dominant).toBe('kebab-case');
  });
});
