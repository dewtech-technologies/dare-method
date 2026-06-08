import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const BROWNFIELD_FILES = [
  'utils/pattern-detector.ts',
  'utils/pattern-facts.ts',
  'utils/design-questionnaire.ts',
  'graphrag/pattern-ingest.ts',
] as const;

const LLM_NETWORK = /anthropic|openai|fetch\(|https?:\/\//i;
const EXEC_SPAWN = /\b(exec|spawn|eval)\b/;
const SWARM = /message\s*pool|multi-agent|orchestrat/i;

describe('patterns no-LLM / no-swarm gate (§11)', () => {
  it.each(BROWNFIELD_FILES)('%s has zero LLM/network calls', async (rel) => {
    const content = await fs.readFile(path.join(SRC, rel), 'utf8');
    expect(content).not.toMatch(LLM_NETWORK);
  });

  it('design-questionnaire.ts has zero exec/spawn/eval', async () => {
    const content = await fs.readFile(path.join(SRC, 'utils/design-questionnaire.ts'), 'utf8');
    expect(content).not.toMatch(EXEC_SPAWN);
  });

  it('brownfield CLI modules have no runtime swarm orchestration', async () => {
    for (const rel of BROWNFIELD_FILES) {
      const content = await fs.readFile(path.join(SRC, rel), 'utf8');
      expect(content).not.toMatch(SWARM);
    }
  });
});
