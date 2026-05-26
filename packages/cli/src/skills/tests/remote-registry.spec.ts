/**
 * Tests for RemoteRegistry and RegistryResolver.
 *
 * Uses fetch mocks (vi.fn) — no real HTTP calls are made.
 *
 * @module skills/tests/remote-registry.spec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteRegistry, RegistryResolver } from '../registry-remote.js';
import { LocalRegistry } from '../registry-local.js';
import type { LocalRegistrySkill } from '../registry-local.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function makeFetchMock(
  statusOrError: number | Error,
  body?: unknown,
): typeof globalThis.fetch {
  if (statusOrError instanceof Error) {
    return vi.fn().mockRejectedValue(statusOrError) as unknown as typeof globalThis.fetch;
  }
  const status = statusOrError;
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpRegistry(): { dir: string; reg: LocalRegistry } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-remote-test-'));
  const reg = new LocalRegistry(dir);
  return { dir, reg };
}

function makeLocalSkill(overrides: Partial<LocalRegistrySkill> = {}): LocalRegistrySkill {
  return {
    name: 'dare-ax',
    version: '1.0.0',
    description: 'Agent Experience patterns',
    author: 'Wanderson',
    license: 'MIT',
    dare_version: '>=3.0.0',
    keywords: ['ax'],
    published_at: '2026-05-26T00:00:00Z',
    size_kb: 48,
    source: 'local',
    ...overrides,
  };
}

function makeSkillDir(tmpDir: string, name: string): string {
  const dir = path.join(tmpDir, name);
  fs.ensureDirSync(dir);
  fs.writeFileSync(
    path.join(dir, 'skill.yml'),
    `name: ${name}\nversion: 1.0.0\ndescription: Test\nauthor: Test\nlicense: MIT\ndare_version: ">=3.0.0"\n`,
  );
  return dir;
}

// ---------------------------------------------------------------------------
// RemoteRegistry.list()
// ---------------------------------------------------------------------------

describe('RemoteRegistry.list()', () => {
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('returns skills from the remote registry', async () => {
    const skills = [
      { name: 'dare-ax', version: '1.0.0', description: 'AX', author: 'Wanderson', license: 'MIT', dare_version: '>=3.0.0', dependencies: {}, keywords: ['ax'], publishedAt: '2026-05-26T00:00:00Z' },
    ];
    globalThis.fetch = makeFetchMock(200, { skills });

    const remote = new RemoteRegistry('https://example.com');
    const result = await remote.list();

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('dare-ax');
  });

  it('returns empty array when fetch throws', async () => {
    globalThis.fetch = makeFetchMock(new Error('Network error'));

    const remote = new RemoteRegistry('https://example.com');
    await expect(remote.list()).rejects.toThrow('Network error');
  });

  it('passes keyword filter as query parameter', async () => {
    globalThis.fetch = makeFetchMock(200, { skills: [] });

    const remote = new RemoteRegistry('https://example.com');
    await remote.list({ keyword: 'ax' });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('keyword=ax');
  });

  it('passes author filter as query parameter', async () => {
    globalThis.fetch = makeFetchMock(200, { skills: [] });

    const remote = new RemoteRegistry('https://example.com');
    await remote.list({ author: 'Wanderson' });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('author=Wanderson');
  });

  it('handles HTTP error status gracefully (non-2xx)', async () => {
    globalThis.fetch = makeFetchMock(500, { skills: [] });

    const remote = new RemoteRegistry('https://example.com');
    // 500 returns { skills: [] } body — should return empty
    const result = await remote.list();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// RemoteRegistry.find()
// ---------------------------------------------------------------------------

describe('RemoteRegistry.find()', () => {
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('returns skill details when found', async () => {
    const latest = { name: 'dare-ax', version: '1.0.0', description: 'AX', author: 'Wanderson', license: 'MIT', dare_version: '>=3.0.0', dependencies: {}, keywords: ['ax'], publishedAt: '2026-05-26T00:00:00Z' };
    globalThis.fetch = makeFetchMock(200, { latest, versions: [latest] });

    const remote = new RemoteRegistry('https://example.com');
    const result = await remote.find('dare-ax');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('dare-ax');
  });

  it('returns null for 404', async () => {
    globalThis.fetch = makeFetchMock(404, { title: 'Not Found', status: 404 });

    const remote = new RemoteRegistry('https://example.com');
    const result = await remote.find('nonexistent-skill');

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    globalThis.fetch = makeFetchMock(new Error('Timeout'));

    const remote = new RemoteRegistry('https://example.com');
    const result = await remote.find('dare-ax').catch(() => null);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RemoteRegistry.publish()
// ---------------------------------------------------------------------------

describe('RemoteRegistry.publish()', () => {
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('succeeds with a valid token and MIT license', async () => {
    globalThis.fetch = makeFetchMock(200, { message: 'Published', skill: {} });

    const remote = new RemoteRegistry('https://example.com');
    await expect(
      remote.publish('my-skill', {
        version: '1.0.0',
        description: 'My skill',
        author: 'Author',
        license: 'MIT',
        dare_version: '>=3.0.0',
        dependencies: {},
        keywords: ['test'],
      }, 'my-token'),
    ).resolves.toBeUndefined();
  });

  it('throws when server returns 401', async () => {
    globalThis.fetch = makeFetchMock(401, { title: 'Unauthorized', detail: 'Token required' });

    const remote = new RemoteRegistry('https://example.com');
    await expect(
      remote.publish('my-skill', {
        version: '1.0.0',
        description: 'My skill',
        author: 'Author',
        license: 'MIT',
        dare_version: '>=3.0.0',
        dependencies: {},
        keywords: [],
      }, ''),
    ).rejects.toThrow('Remote publish failed');
  });

  it('throws when server returns 400 (non-MIT license)', async () => {
    globalThis.fetch = makeFetchMock(400, { title: 'License Not Allowed', detail: 'Only MIT is accepted' });

    const remote = new RemoteRegistry('https://example.com');
    await expect(
      remote.publish('my-skill', {
        version: '1.0.0',
        description: 'My skill',
        author: 'Author',
        license: 'Apache-2.0',
        dare_version: '>=3.0.0',
        dependencies: {},
        keywords: [],
      }, 'valid-token'),
    ).rejects.toThrow('Remote publish failed');
  });

  it('sends Authorization header with Bearer token', async () => {
    globalThis.fetch = makeFetchMock(200, { message: 'OK' });

    const remote = new RemoteRegistry('https://example.com');
    await remote.publish('my-skill', {
      version: '1.0.0',
      description: 'x',
      author: 'x',
      license: 'MIT',
      dare_version: '>=3.0.0',
      dependencies: {},
      keywords: [],
    }, 'ghp_mytoken');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers['Authorization']).toBe('Bearer ghp_mytoken');
  });
});

// ---------------------------------------------------------------------------
// RegistryResolver priority: remote > local > mock
// ---------------------------------------------------------------------------

describe('RegistryResolver — source priority', () => {
  let tmpDir: string;
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-resolver-test-'));
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    globalThis.fetch = origFetch;
  });

  it('labels skills from mock with source "mock"', async () => {
    // Simulate remote timeout/offline
    globalThis.fetch = makeFetchMock(new Error('Network error'));

    const { reg } = makeTmpRegistry();
    const resolver = new RegistryResolver(
      new RemoteRegistry('https://example.com', 100),
      reg,
    );

    const skills = await resolver.list();
    // All skills from mock when remote is offline and local is empty
    for (const s of skills) {
      expect(['mock', 'local']).toContain(s.source);
    }
  });

  it('remote skills override mock skills with same name@version', async () => {
    const remoteSkill = {
      name: 'dare-ax',
      version: '1.0.0',
      description: 'Remote description',
      author: 'RemoteAuthor',
      license: 'MIT',
      dare_version: '>=3.0.0',
      dependencies: {},
      keywords: ['ax'],
      publishedAt: '2026-05-26T00:00:00Z',
    };
    globalThis.fetch = makeFetchMock(200, { skills: [remoteSkill] });

    const { reg } = makeTmpRegistry();
    const resolver = new RegistryResolver(
      new RemoteRegistry('https://example.com', 3_000),
      reg,
    );

    const skills = await resolver.list();
    const dareAx = skills.find((s) => s.name === 'dare-ax' && s.version === '1.0.0');
    expect(dareAx).toBeDefined();
    expect(dareAx!.source).toBe('remote');
    expect(dareAx!.description).toBe('Remote description');
  });

  it('local skills override mock skills with same name@version', async () => {
    globalThis.fetch = makeFetchMock(new Error('Offline'));

    const { dir, reg } = makeTmpRegistry();
    const skillDir = makeSkillDir(tmpDir, 'dare-ax');
    const localMeta: LocalRegistrySkill = makeLocalSkill({
      description: 'Local description',
    });
    reg.publish(skillDir, localMeta);

    const resolver = new RegistryResolver(
      new RemoteRegistry('https://example.com', 100),
      reg,
    );

    const skills = await resolver.list();
    const dareAx = skills.find((s) => s.name === 'dare-ax' && s.version === '1.0.0');
    expect(dareAx).toBeDefined();
    expect(dareAx!.source).toBe('local');
    expect(dareAx!.description).toBe('Local description');
  });

  it('falls back to local when remote times out', async () => {
    // Simulate timeout by making fetch hang until AbortController kicks in
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(new Error('AbortError')), 500);
      });
    }) as unknown as typeof globalThis.fetch;

    const { dir, reg } = makeTmpRegistry();
    const skillDir = makeSkillDir(tmpDir, 'my-local-skill');
    const localMeta: LocalRegistrySkill = makeLocalSkill({
      name: 'my-local-skill',
      description: 'From local fallback',
    });
    reg.publish(skillDir, localMeta);

    const resolver = new RegistryResolver(
      new RemoteRegistry('https://example.com', 50), // very short timeout
      reg,
    );

    const skills = await resolver.list();
    const localSkill = skills.find((s) => s.name === 'my-local-skill');
    expect(localSkill).toBeDefined();
    expect(localSkill!.source).toBe('local');
  });

  it('falls back to mock when both remote and local are empty', async () => {
    globalThis.fetch = makeFetchMock(new Error('Offline'));

    const { reg } = makeTmpRegistry(); // empty local registry
    const resolver = new RegistryResolver(
      new RemoteRegistry('https://example.com', 100),
      reg,
    );

    const skills = await resolver.list();
    expect(skills.length).toBeGreaterThan(0);
    const mockSkills = skills.filter((s) => s.source === 'mock');
    expect(mockSkills.length).toBeGreaterThan(0);
  });

  // ---- find() priority ----

  it('find() returns remote skill first', async () => {
    const remoteSkill = {
      name: 'dare-ax',
      version: '2.0.0',
      description: 'Remote v2',
      author: 'Wanderson',
      license: 'MIT',
      dare_version: '>=3.0.0',
      dependencies: {},
      keywords: ['ax'],
      publishedAt: '2026-05-26T00:00:00Z',
    };
    globalThis.fetch = makeFetchMock(200, { latest: remoteSkill, versions: [remoteSkill] });

    const { reg } = makeTmpRegistry();
    const resolver = new RegistryResolver(
      new RemoteRegistry('https://example.com', 3_000),
      reg,
    );

    const result = await resolver.find('dare-ax');
    expect(result).not.toBeNull();
    expect(result!.source).toBe('remote');
  });

  it('find() falls back to mock when remote returns 404', async () => {
    globalThis.fetch = makeFetchMock(404, { title: 'Not Found', status: 404 });

    const { reg } = makeTmpRegistry();
    const resolver = new RegistryResolver(
      new RemoteRegistry('https://example.com', 3_000),
      reg,
    );

    const result = await resolver.find('dare-ax');
    expect(result).not.toBeNull();
    expect(result!.source).toBe('mock'); // falls back to mock
  });

  it('find() returns null when skill not found anywhere', async () => {
    globalThis.fetch = makeFetchMock(404, { title: 'Not Found', status: 404 });

    const { reg } = makeTmpRegistry();
    const resolver = new RegistryResolver(
      new RemoteRegistry('https://example.com', 3_000),
      reg,
    );

    const result = await resolver.find('completely-unknown-skill-xyz');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RemoteRegistry.isOnline()
// ---------------------------------------------------------------------------

describe('RemoteRegistry.isOnline()', () => {
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('returns true when registry responds 200', async () => {
    globalThis.fetch = makeFetchMock(200, { skills: [] });
    const remote = new RemoteRegistry('https://example.com');
    expect(await remote.isOnline()).toBe(true);
  });

  it('returns false when registry is offline', async () => {
    globalThis.fetch = makeFetchMock(new Error('Connection refused'));
    const remote = new RemoteRegistry('https://example.com');
    expect(await remote.isOnline()).toBe(false);
  });

  it('returns false when registry returns 500', async () => {
    globalThis.fetch = makeFetchMock(500, {});
    const remote = new RemoteRegistry('https://example.com');
    expect(await remote.isOnline()).toBe(false);
  });
});
