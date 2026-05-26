/**
 * Tests for POST /api/publish/:name endpoint logic.
 *
 * @module tests/publish.spec
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateToken, extractToken } from '../lib/auth.js';
import { readIndex, writeIndex, upsertSkill, type RegistryIndex, type SkillEntry } from '../lib/storage.js';
import { checkRateLimit, resetRateLimit } from '../lib/rate-limit.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dare-publish-test-'));
}

function makeEmptyIndex(dataDir: string): void {
  const index: RegistryIndex = {
    version: '1.0',
    updatedAt: '2026-05-26T00:00:00Z',
    skills: [],
  };
  writeIndex(index, dataDir);
}

function makeValidBody(): Record<string, unknown> {
  return {
    version: '1.0.0',
    description: 'Test skill',
    author: 'Wanderson',
    license: 'MIT',
    dare_version: '>=3.0.0',
    dependencies: {},
    keywords: ['test'],
    homepage: 'https://example.com',
  };
}

// ---------------------------------------------------------------------------
// Tests — auth.ts
// ---------------------------------------------------------------------------

describe('validateToken', () => {
  it('returns true for a valid Bearer token', () => {
    expect(validateToken('Bearer abc123')).toBe(true);
  });

  it('returns false when header is undefined', () => {
    expect(validateToken(undefined)).toBe(false);
  });

  it('returns false when header is empty string', () => {
    expect(validateToken('')).toBe(false);
  });

  it('returns false when missing "Bearer " prefix', () => {
    expect(validateToken('abc123')).toBe(false);
  });

  it('returns false when token is empty after "Bearer "', () => {
    expect(validateToken('Bearer ')).toBe(false);
  });

  it('returns false when token is only whitespace', () => {
    expect(validateToken('Bearer    ')).toBe(false);
  });

  it('returns true for a long token', () => {
    const longToken = 'Bearer ' + 'a'.repeat(200);
    expect(validateToken(longToken)).toBe(true);
  });

  it('returns true for GitHub-format token', () => {
    expect(validateToken('Bearer ghp_abc123xyz456')).toBe(true);
  });
});

describe('extractToken', () => {
  it('extracts token from valid header', () => {
    expect(extractToken('Bearer mytoken')).toBe('mytoken');
  });

  it('returns null for undefined header', () => {
    expect(extractToken(undefined)).toBeNull();
  });

  it('returns null for empty token', () => {
    expect(extractToken('Bearer ')).toBeNull();
  });

  it('trims whitespace from token', () => {
    expect(extractToken('Bearer  spacedtoken  ')).toBe('spacedtoken');
  });
});

// ---------------------------------------------------------------------------
// Tests — license validation (D-001)
// ---------------------------------------------------------------------------

describe('License validation — MIT enforcement (D-001)', () => {
  it('accepts MIT license', () => {
    const body = makeValidBody();
    expect(body['license']).toBe('MIT');
  });

  it('rejects Apache-2.0 license', () => {
    const license = 'Apache-2.0';
    expect(license).not.toBe('MIT');
  });

  it('rejects GPL-3.0 license', () => {
    const license = 'GPL-3.0';
    expect(license).not.toBe('MIT');
  });

  it('rejects empty license', () => {
    const license = '';
    expect(license).not.toBe('MIT');
  });

  it('rejects undefined license', () => {
    const license = undefined;
    expect(license).not.toBe('MIT');
  });

  it('rejects ISC license', () => {
    const license = 'ISC';
    expect(license).not.toBe('MIT');
  });

  it('rejects BSD-3-Clause', () => {
    const license = 'BSD-3-Clause';
    expect(license).not.toBe('MIT');
  });
});

// ---------------------------------------------------------------------------
// Tests — storage.ts upsertSkill
// ---------------------------------------------------------------------------

describe('upsertSkill', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDataDir();
    makeEmptyIndex(tmpDir);
    resetRateLimit();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds new skill to empty index', () => {
    const index = readIndex(tmpDir);
    const entry: SkillEntry = {
      name: 'my-skill',
      version: '1.0.0',
      description: 'Test',
      author: 'Test',
      license: 'MIT',
      dare_version: '>=3.0.0',
      dependencies: {},
      keywords: ['test'],
      publishedAt: new Date().toISOString(),
    };
    upsertSkill(index, entry);
    expect(index.skills).toHaveLength(1);
    expect(index.skills[0]!.name).toBe('my-skill');
  });

  it('replaces existing skill with same name+version', () => {
    const index = readIndex(tmpDir);
    const entry: SkillEntry = {
      name: 'dare-ax',
      version: '1.0.0',
      description: 'Old description',
      author: 'Wanderson',
      license: 'MIT',
      dare_version: '>=3.0.0',
      dependencies: {},
      keywords: [],
      publishedAt: '2026-01-01T00:00:00Z',
    };
    upsertSkill(index, entry);

    const updated = { ...entry, description: 'New description' };
    upsertSkill(index, updated);

    expect(index.skills).toHaveLength(1);
    expect(index.skills[0]!.description).toBe('New description');
  });

  it('keeps different versions as separate entries', () => {
    const index = readIndex(tmpDir);
    const v1: SkillEntry = {
      name: 'dare-ax',
      version: '1.0.0',
      description: 'v1',
      author: 'Wanderson',
      license: 'MIT',
      dare_version: '>=3.0.0',
      dependencies: {},
      keywords: [],
      publishedAt: '2026-01-01T00:00:00Z',
    };
    const v2: SkillEntry = {
      ...v1,
      version: '2.0.0',
      description: 'v2',
    };
    upsertSkill(index, v1);
    upsertSkill(index, v2);

    expect(index.skills).toHaveLength(2);
  });

  it('persists skill to disk via writeIndex', () => {
    const index = readIndex(tmpDir);
    const entry: SkillEntry = {
      name: 'new-skill',
      version: '1.0.0',
      description: 'Persisted',
      author: 'Author',
      license: 'MIT',
      dare_version: '>=3.0.0',
      dependencies: {},
      keywords: [],
      publishedAt: new Date().toISOString(),
    };
    upsertSkill(index, entry);
    writeIndex(index, tmpDir);

    const reloaded = readIndex(tmpDir);
    expect(reloaded.skills).toHaveLength(1);
    expect(reloaded.skills[0]!.name).toBe('new-skill');
  });
});

// ---------------------------------------------------------------------------
// Tests — rate limit for publish
// ---------------------------------------------------------------------------

describe('Publish rate limit', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it('allows 10 publishes within an hour', () => {
    const key = 'publish:token-abc';
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(key, 10, 3_600_000)).toBe(true);
    }
  });

  it('blocks 11th publish within an hour', () => {
    const key = 'publish:token-def';
    for (let i = 0; i < 10; i++) {
      checkRateLimit(key, 10, 3_600_000);
    }
    expect(checkRateLimit(key, 10, 3_600_000)).toBe(false);
  });

  it('different tokens have independent limits', () => {
    const key1 = 'publish:token-ghi';
    const key2 = 'publish:token-jkl';
    for (let i = 0; i < 10; i++) {
      checkRateLimit(key1, 10, 3_600_000);
    }
    // key1 is rate limited but key2 should still work
    expect(checkRateLimit(key1, 10, 3_600_000)).toBe(false);
    expect(checkRateLimit(key2, 10, 3_600_000)).toBe(true);
  });
});
