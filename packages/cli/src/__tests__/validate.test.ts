import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { execSync, type ExecException } from 'node:child_process';

const CLI = path.resolve('dist/bin/dare.js');

describe('dare validate', () => {
  let dir: string;
  let dagPath: string;

  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `dare-validate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(dir);
    dagPath = path.join(dir, 'DARE/dare-dag.yaml');
    await fs.ensureDir(path.dirname(dagPath));
  });

  afterEach(async () => {
    await fs.remove(dir).catch(() => undefined);
  });

  function run(): { code: number; stdout: string; stderr: string } {
    try {
      const stdout = execSync(`node "${CLI}" validate`, { cwd: dir, encoding: 'utf-8' });
      return { code: 0, stdout, stderr: '' };
    } catch (err) {
      const e = err as ExecException & { stdout?: string; stderr?: string; status?: number };
      return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    }
  }

  it('passes for a valid dag', async () => {
    await fs.writeFile(dagPath, validYaml);
    const { code, stdout } = run();
    expect(code).toBe(0);
    expect(stdout).toMatch(/valid/);
  });

  it('detects duplicate ids', async () => {
    await fs.writeFile(dagPath, dupIdYaml);
    const { code, stdout } = run();
    expect(code).toBe(1);
    expect(stdout).toMatch(/Duplicate task id/);
  });

  it('detects unknown depends_on', async () => {
    await fs.writeFile(dagPath, unknownDepYaml);
    const { code, stdout } = run();
    expect(code).toBe(1);
    expect(stdout).toMatch(/depends on unknown task/);
  });

  it('detects cycles', async () => {
    await fs.writeFile(dagPath, cycleYaml);
    const { code, stdout } = run();
    expect(code).toBe(1);
    expect(stdout).toMatch(/Circular dependency/);
  });

  it('rejects non-kebab ids', async () => {
    await fs.writeFile(dagPath, badIdYaml);
    const { code, stdout } = run();
    expect(code).toBe(1);
    expect(stdout).toMatch(/Invalid id/);
  });
});

const validYaml = `title: "ok"
version: "1.0.0"
models:
  cursor: { HIGH: a, MED: b, LOW: c }
tasks:
  - id: task-001
    title: "First"
    depends_on: []
    complexity: LOW
    subtask_prompt: "go"
  - id: task-002
    title: "Second"
    depends_on: []
    complexity: LOW
    subtask_prompt: "go"
`;

const dupIdYaml = `title: "dup"
version: "1.0.0"
models:
  cursor: { HIGH: a, MED: b, LOW: c }
tasks:
  - id: task-001
    title: "A"
    depends_on: []
    complexity: LOW
    subtask_prompt: "go"
  - id: task-001
    title: "B"
    depends_on: []
    complexity: LOW
    subtask_prompt: "go"
`;

const unknownDepYaml = `title: "missing"
version: "1.0.0"
models:
  cursor: { HIGH: a, MED: b, LOW: c }
tasks:
  - id: task-001
    title: "A"
    depends_on: [task-999]
    complexity: LOW
    subtask_prompt: "go"
`;

const cycleYaml = `title: "cycle"
version: "1.0.0"
models:
  cursor: { HIGH: a, MED: b, LOW: c }
tasks:
  - id: task-001
    title: "A"
    depends_on: [task-002]
    complexity: LOW
    subtask_prompt: "go"
  - id: task-002
    title: "B"
    depends_on: [task-001]
    complexity: LOW
    subtask_prompt: "go"
`;

const badIdYaml = `title: "bad-id"
version: "1.0.0"
models:
  cursor: { HIGH: a, MED: b, LOW: c }
tasks:
  - id: Task_001
    title: "Wrong case"
    depends_on: []
    complexity: LOW
    subtask_prompt: "go"
`;
