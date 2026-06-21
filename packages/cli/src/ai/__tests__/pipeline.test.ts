import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { MockAiProvider } from '../providers.js';
import { setMockProviderFactoryForTests } from '../registry.js';
import { runCommandEnrichment } from '../pipeline.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dare-ai-pipeline-'));
  setMockProviderFactoryForTests(
    () =>
      new MockAiProvider(() => ({
        ok: true,
        provider: 'mock',
        raw: '{}',
        data: {
          purpose: 'Test system',
          domainGlossary: 'Foo, Bar',
        },
      })),
  );
});

afterEach(async () => {
  setMockProviderFactoryForTests(null);
  await fs.remove(tmpDir).catch(() => undefined);
});

describe('ai pipeline', () => {
  it('enriches_reverse_and_writes_semantic_file', async () => {
    await fs.ensureDir(path.join(tmpDir, 'DARE', 'REVERSE'));
    await fs.writeFile(
      path.join(tmpDir, 'DARE', 'IDEIA.md'),
      '<!-- AGENT: purpose -->\n',
    );

    const result = await runCommandEnrichment({
      command: 'reverse',
      cwd: tmpDir,
      facts: { modules: [] },
      provider: 'mock',
    });

    expect(result.ok).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, 'DARE', 'REVERSE', 'semantic-enrichment.json'))).toBe(
      true,
    );
    const ideia = await fs.readFile(path.join(tmpDir, 'DARE', 'IDEIA.md'), 'utf-8');
    expect(ideia).toContain('Test system');
  });
});
