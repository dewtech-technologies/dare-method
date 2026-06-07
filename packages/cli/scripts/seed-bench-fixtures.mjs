import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'bench');

const fixtures = [
  {
    id: 'fix-001-nest-correct',
    stack: 'node-nestjs',
    description: 'Golden patch fixes failing add() without pass-to-pass regression',
    repo: {
      'package.json': JSON.stringify({ name: 'nest-fix-001', private: true }, null, 2),
      'src/math.ts': `export function add(a: number, b: number): number {\n  return a + b + 1;\n}\n`,
      'src/math.spec.ts': `import { add } from './math';\n\ndescribe('add', () => {\n  it('add sums two numbers', () => {\n    expect(add(2, 3)).toBe(5);\n  });\n  it('add handles zero', () => {\n    expect(add(0, 0)).toBe(0);\n  });\n});\n`,
    },
    patch: `--- a/repo/src/math.ts\n+++ b/repo/src/math.ts\n@@ -1,3 +1,3 @@\n export function add(a: number, b: number): number {\n-  return a + b + 1;\n+  return a + b;\n }\n`,
    failToPass: 'add sums two numbers\n',
    passToPass: 'add handles zero\n',
  },
  {
    id: 'fix-002-nest-weak-test',
    stack: 'node-nestjs',
    description: 'Patch passes weak assertion but leaves mutant alive (O-01)',
    repo: {
      'package.json': JSON.stringify({ name: 'nest-fix-002', private: true }, null, 2),
      'src/math.ts': `export function add(a: number, b: number): number {\n  return a + b + 1;\n}\n`,
      'src/math.spec.ts': `import { add } from './math';\n\ndescribe('add', () => {\n  it('add sums two numbers', () => {\n    expect(add(2, 3)).toBe(6);\n  });\n  it('add handles zero', () => {\n    expect(add(0, 0)).toBe(0);\n  });\n});\n`,
    },
    patch: `--- a/repo/src/math.spec.ts\n+++ b/repo/src/math.spec.ts\n@@ -3,7 +3,7 @@\n describe('add', () => {\n   it('add sums two numbers', () => {\n-    expect(add(2, 3)).toBe(6);\n+    expect(add(2, 3)).toBe(5);\n   });\n   it('add handles zero', () => {\n     expect(add(0, 0)).toBe(0);\n`,
    failToPass: 'add sums two numbers\n',
    passToPass: 'add handles zero\n',
  },
  {
    id: 'fix-003-fastapi-correct',
    stack: 'python-fastapi',
    description: 'Golden patch fixes divide() without pass-to-pass regression',
    repo: {
      'requirements.txt': 'pytest\n',
      'app.py': `def divide(a: int, b: int) -> float:\n    return a / (b + 1)\n`,
      'test_app.py': `from app import divide\n\ndef test_divide_two_numbers():\n    assert divide(10, 2) == 5.0\n\ndef test_divide_by_one():\n    assert divide(4, 1) == 4.0\n`,
    },
    patch: `--- a/repo/app.py\n+++ b/repo/app.py\n@@ -1,2 +1,2 @@\n def divide(a: int, b: int) -> float:\n-    return a / (b + 1)\n+    return a / b\n`,
    failToPass: 'test_divide_two_numbers\n',
    passToPass: 'test_divide_by_one\n',
  },
  {
    id: 'fix-004-fastapi-regression',
    stack: 'python-fastapi',
    description: 'Patch fixes fail-to-pass but breaks a pass-to-pass test',
    repo: {
      'requirements.txt': 'pytest\n',
      'app.py': `def divide(a: int, b: int) -> float:\n    return a / (b + 1)\n`,
      'test_app.py': `from app import divide\n\ndef test_divide_two_numbers():\n    assert divide(10, 2) == 5.0\n\ndef test_divide_by_one():\n    assert divide(4, 1) == 4.0\n`,
    },
    patch: `--- a/repo/app.py\n+++ b/repo/app.py\n@@ -1,2 +1,2 @@\n def divide(a: int, b: int) -> float:\n-    return a / (b + 1)\n+    return a / b if b != 1 else 0.0\n`,
    failToPass: 'test_divide_two_numbers\n',
    passToPass: 'test_divide_by_one\n',
  },
  {
    id: 'fix-005-nest-partial',
    stack: 'node-nestjs',
    description: 'Patch fixes only part of the fail-to-pass suite',
    repo: {
      'package.json': JSON.stringify({ name: 'nest-fix-005', private: true }, null, 2),
      'src/math.ts': `export function add(a: number, b: number): number {\n  return a + b + 1;\n}\nexport function sub(a: number, b: number): number {\n  return a - b + 1;\n}\n`,
      'src/math.spec.ts': `import { add, sub } from './math';\n\ndescribe('math', () => {\n  it('add sums two numbers', () => {\n    expect(add(2, 3)).toBe(5);\n  });\n  it('sub subtracts two numbers', () => {\n    expect(sub(5, 2)).toBe(3);\n  });\n  it('add handles zero', () => {\n    expect(add(0, 0)).toBe(0);\n  });\n});\n`,
    },
    patch: `--- a/repo/src/math.ts\n+++ b/repo/src/math.ts\n@@ -1,5 +1,5 @@\n export function add(a: number, b: number): number {\n-  return a + b + 1;\n+  return a + b;\n }\n export function sub(a: number, b: number): number {\n   return a - b + 1;\n`,
    failToPass: 'add sums two numbers\nsub subtracts two numbers\n',
    passToPass: 'add handles zero\n',
  },
  {
    id: 'fix-006-fastapi-weak-test',
    stack: 'python-fastapi',
    description: 'Patch satisfies weak test but mutant survives (O-01)',
    repo: {
      'requirements.txt': 'pytest\n',
      'app.py': `def divide(a: int, b: int) -> float:\n    return a / (b + 1)\n`,
      'test_app.py': `from app import divide\n\ndef test_divide_two_numbers():\n    assert divide(10, 2) == 5.0\n\ndef test_divide_by_one():\n    assert divide(4, 1) == 4.0\n`,
    },
    patch: `--- a/repo/test_app.py\n+++ b/repo/test_app.py\n@@ -2,7 +2,7 @@\n from app import divide\n \n def test_divide_two_numbers():\n-    assert divide(10, 2) == 5.0\n+    assert round(divide(10, 2), 1) == 5.0\n \n def test_divide_by_one():\n     assert divide(4, 1) == 4.0\n`,
    failToPass: 'test_divide_two_numbers\n',
    passToPass: 'test_divide_by_one\n',
  },
];

await fs.ensureDir(root);

for (const fx of fixtures) {
  const dir = path.join(root, fx.id);
  const repoDir = path.join(dir, 'repo');
  await fs.ensureDir(repoDir);
  await fs.writeJson(path.join(dir, 'meta.json'), {
    id: fx.id,
    stack: fx.stack,
    description: fx.description,
  });
  await fs.writeFile(path.join(dir, 'patch.diff'), fx.patch, 'utf8');
  await fs.writeFile(path.join(dir, 'fail_to_pass.txt'), fx.failToPass, 'utf8');
  await fs.writeFile(path.join(dir, 'pass_to_pass.txt'), fx.passToPass, 'utf8');
  for (const [rel, content] of Object.entries(fx.repo)) {
    const target = path.join(repoDir, rel);
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, content, 'utf8');
  }
}

await fs.writeJson(
  path.join(root, 'suite.json'),
  {
    fixtures: fixtures.map(({ id, stack, description }) => ({ id, stack, description })),
  },
  { spaces: 2 },
);

console.log(`Seeded ${fixtures.length} bench fixtures in ${root}`);
