import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonGraph } from '../json-graph.js';
import { ingestRequirements } from '../requirement-ingest.js';

const cleanupRoots: string[] = [];

async function ingestAndGetRequirement(content: string, ingestedAt?: string) {
  const projectRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'req-hash-'));
  cleanupRoots.push(projectRoot);
  await fs.promises.mkdir(path.join(projectRoot, 'DARE'));
  await fs.promises.writeFile(path.join(projectRoot, 'DARE', 'BLUEPRINT-sample.md'), content, 'utf8');

  const graph = new JsonGraph(path.join(projectRoot, '.dare', 'graph.json'));
  await graph.init();
  ingestRequirements(graph, projectRoot, { ingestedAt });
  const node = graph.getNode('requirement:RF-01');
  graph.close();

  return node;
}

describe('requirement-hash', () => {
  afterEach(async () => {
    for (const root of cleanupRoots.splice(0, cleanupRoots.length)) {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it('writes_contentHash_on_requirement', async () => {
    const fixedIngestedAt = '2026-01-01T00:00:00.000Z';
    const content = `
| ID | Requirement |
| --- | --- |
| RF-01 | Auth MUST |
`;
    const node = await ingestAndGetRequirement(content, fixedIngestedAt);
    const metadata = node?.metadata as Record<string, string> | undefined;
    const expectedHash = createHash('sha256').update('Auth MUST').digest('hex');
    expect(metadata?.contentHash).toBe(expectedHash);
    expect(metadata?.ingestedAt).toBe(fixedIngestedAt);
  });

  it('hash_is_stable', async () => {
    const content = `
| ID | Requirement |
| --- | --- |
| RF-01 | Deterministic text |
`;
    const firstNode = await ingestAndGetRequirement(content, '2026-01-01T00:00:00.000Z');
    const secondNode = await ingestAndGetRequirement(content, '2026-01-02T00:00:00.000Z');
    const firstHash = (firstNode?.metadata as Record<string, string> | undefined)?.contentHash;
    const secondHash = (secondNode?.metadata as Record<string, string> | undefined)?.contentHash;
    expect(firstHash).toBeTruthy();
    expect(secondHash).toBeTruthy();
    expect(firstHash).toBe(secondHash);
  });

  it('hash_changes_with_text', async () => {
    const firstContent = `
| ID | Requirement |
| --- | --- |
| RF-01 | Requirement text A |
`;
    const secondContent = `
| ID | Requirement |
| --- | --- |
| RF-01 | Requirement text B |
`;
    const firstNode = await ingestAndGetRequirement(firstContent);
    const secondNode = await ingestAndGetRequirement(secondContent);
    const firstHash = (firstNode?.metadata as Record<string, string> | undefined)?.contentHash;
    const secondHash = (secondNode?.metadata as Record<string, string> | undefined)?.contentHash;
    expect(firstHash).toBeTruthy();
    expect(secondHash).toBeTruthy();
    expect(firstHash).not.toBe(secondHash);
  });
});
