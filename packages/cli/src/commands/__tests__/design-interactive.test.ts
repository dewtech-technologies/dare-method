import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

describe('dare design --interactive', () => {
  let projectRoot: string;
  let stdout: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'design-int-'));
    await fs.ensureDir(path.join(projectRoot, 'DARE'));
    stdout = '';
    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout += args.map(String).join(' ') + '\n';
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(projectRoot).catch(() => undefined);
  });

  it('without --interactive keeps static DESIGN.md sections', async () => {
    const { designCommand } = await import('../design.js');
    await designCommand.parseAsync(['API de autenticação'], { from: 'user' });

    const content = await fs.readFile(path.join(projectRoot, 'DARE', 'DESIGN.md'), 'utf8');
    expect(content).toContain('## Goals');
    expect(content).toContain('## Constraints');
    expect(content).not.toContain('## Perguntas de Planejamento (Analyst/PM)');
  });

  it('--interactive injects planning questionnaire section', async () => {
    await fs.writeJson(path.join(projectRoot, 'DARE', 'patterns-facts.json'), {
      generatedAt: '2026-06-07T12:00:00.000Z',
      fileInventorySource: 'module-detector',
      patterns: [],
    });

    const { designCommand } = await import('../design.js');
    await designCommand.parseAsync(['Brownfield API', '--interactive'], { from: 'user' });

    const content = await fs.readFile(path.join(projectRoot, 'DARE', 'DESIGN.md'), 'utf8');
    expect(content).toContain('## Perguntas de Planejamento (Analyst/PM)');
    expect(content).toMatch(/analyst · gap/);
    expect(stdout).toContain('## Perguntas de Planejamento (Analyst/PM)');
    expect(content).not.toContain('## Goals');
  });
});
