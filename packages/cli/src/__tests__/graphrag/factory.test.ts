import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { loadGraphConfig, createGraph } from '../../graphrag/factory.js';

describe('loadGraphConfig', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = path.join(os.tmpdir(), `dare-factory-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(cwd);
  });

  afterEach(async () => {
    await fs.remove(cwd).catch(() => undefined);
  });

  it('falls back to sqlite when no dare-graph.yml exists', async () => {
    const cfg = await loadGraphConfig({ cwd });
    expect(cfg.backend).toBe('sqlite');
    expect(cfg.path).toContain('graph.db');
  });

  it('reads sqlite custom path', async () => {
    await fs.writeFile(
      path.join(cwd, 'dare-graph.yml'),
      'backend: sqlite\nsqlite:\n  path: custom/graph.db\n',
    );
    const cfg = await loadGraphConfig({ cwd });
    expect(cfg.backend).toBe('sqlite');
    expect(cfg.path).toBe('custom/graph.db');
  });

  it('reads json backend', async () => {
    await fs.writeFile(
      path.join(cwd, 'dare-graph.yml'),
      'backend: json\njson:\n  path: my/graph.json\n',
    );
    const cfg = await loadGraphConfig({ cwd });
    expect(cfg.backend).toBe('json');
    expect(cfg.path).toBe('my/graph.json');
  });

  it('reads neo4j config (url, database, username, password)', async () => {
    await fs.writeFile(
      path.join(cwd, 'dare-graph.yml'),
      [
        'backend: neo4j',
        'neo4j:',
        '  url: http://localhost:7474',
        '  database: dare',
        '  username: neo4j',
        '  password: secret',
      ].join('\n'),
    );
    const cfg = await loadGraphConfig({ cwd });
    expect(cfg.backend).toBe('neo4j');
    expect(cfg.neo4j?.url).toBe('http://localhost:7474');
    expect(cfg.neo4j?.database).toBe('dare');
    expect(cfg.neo4j?.username).toBe('neo4j');
    expect(cfg.neo4j?.password).toBe('secret');
  });

  it('reads neo4j with bearer auth', async () => {
    await fs.writeFile(
      path.join(cwd, 'dare-graph.yml'),
      [
        'backend: neo4j',
        'neo4j:',
        '  url: http://localhost:7474',
        '  auth: "Bearer xyz"',
      ].join('\n'),
    );
    const cfg = await loadGraphConfig({ cwd });
    expect(cfg.neo4j?.auth).toBe('Bearer xyz');
  });
});

describe('createGraph', () => {
  it('throws when neo4j config is missing url', async () => {
    await expect(
      createGraph({ backend: 'neo4j', neo4j: { url: '' } }),
    ).rejects.toThrow(/url.*required/);
  });
});
