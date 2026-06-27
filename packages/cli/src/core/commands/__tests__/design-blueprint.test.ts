import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDesign } from '../design.js';
import { runBlueprint } from '../blueprint.js';

describe('core/commands design + blueprint', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-core-cmd-'));
  });

  afterEach(async () => {
    await fs.remove(cwd).catch(() => undefined);
  });

  it('runDesign requires input.description', async () => {
    const result = await runDesign({ cwd, input: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('input.description is required');
  });

  it('runDesign writes DESIGN.md and supports interactive questionnaire', async () => {
    const result = await runDesign({
      cwd,
      input: { description: 'Projeto de teste', interactive: true },
    });

    expect(result.ok).toBe(true);
    const designPath = path.join(cwd, 'DARE', 'DESIGN.md');
    expect(await fs.pathExists(designPath)).toBe(true);
    const content = await fs.readFile(designPath, 'utf8');
    expect(content).toContain('## Project Description');
    expect(content).toContain('## Perguntas de Planejamento (Analyst/PM)');
  });

  it('runBlueprint validates DESIGN.md existence', async () => {
    const result = await runBlueprint({ cwd, input: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('DESIGN.md not found');
  });

  it('runBlueprint scaffolds blueprint artifacts from DESIGN.md', async () => {
    await fs.ensureDir(path.join(cwd, 'DARE'));
    await fs.writeFile(path.join(cwd, 'DARE', 'DESIGN.md'), '# DESIGN\n\nProjeto');

    const result = await runBlueprint({ cwd, input: { force: true } });
    expect(result.ok).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'DARE', 'BLUEPRINT.md'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'DARE', 'dare-dag.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'DARE', 'TASKS.md'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'DARE', 'EXECUTION', 'task-001.md'))).toBe(true);
  });
});
