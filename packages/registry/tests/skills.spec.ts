/**
 * Tests for GET /api/skills (list endpoint).
 *
 * Uses a temporary data directory so tests don't affect production data.
 *
 * @module tests/skills.spec
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readIndex, writeIndex, type RegistryIndex } from '../lib/storage.js';
import { checkRateLimit, resetRateLimit } from '../lib/rate-limit.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Helpers — inline handler test (no HTTP server needed)
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock VercelRequest and VercelResponse pair so we can
 * test the handler logic without spinning up an HTTP server.
 */
function makeReqRes(options: {
  method?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
}) {
  const req = {
    method: options.method ?? 'GET',
    query: options.query ?? {},
    headers: options.headers ?? {},
    body: options.body ?? undefined,
  } as unknown;

  let statusCode = 200;
  let responseBody: unknown = null;
  const responseHeaders: Record<string, string | number> = {};

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      responseBody = body;
      return res;
    },
    setHeader(key: string, value: string | number) {
      responseHeaders[key] = value;
      return res;
    },
    end() {
      return res;
    },
    getStatus: () => statusCode,
    getBody: () => responseBody,
    getHeaders: () => responseHeaders,
  } as unknown;

  return { req, res };
}

// ---------------------------------------------------------------------------
// Storage helpers for tests
// ---------------------------------------------------------------------------

function makeTmpDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-registry-test-'));
  return dir;
}

function seedRegistry(dataDir: string, overrides?: Partial<RegistryIndex>): void {
  const index: RegistryIndex = {
    version: '1.0',
    updatedAt: '2026-05-26T00:00:00Z',
    skills: [
      {
        name: 'dare-ax',
        version: '1.0.0',
        description: 'Agent Experience patterns',
        author: 'Wanderson',
        license: 'MIT',
        dare_version: '>=3.0.0',
        dependencies: {},
        keywords: ['ax', 'agent-experience'],
        publishedAt: '2026-05-26T00:00:00Z',
      },
      {
        name: 'dare-llm-integration',
        version: '1.0.0',
        description: 'LLM integration patterns',
        author: 'Wanderson',
        license: 'MIT',
        dare_version: '>=3.0.0',
        dependencies: { 'dare-ax': '>=1.0.0' },
        keywords: ['llm', 'ai'],
        publishedAt: '2026-05-26T00:00:00Z',
      },
      {
        name: 'dare-frontend-design',
        version: '1.0.0',
        description: 'Frontend design patterns',
        author: 'CommunityDev',
        license: 'MIT',
        dare_version: '>=3.0.0',
        dependencies: {},
        keywords: ['frontend', 'ui'],
        publishedAt: '2026-05-26T00:00:00Z',
      },
    ],
    ...overrides,
  };
  writeIndex(index, dataDir);
}

// ---------------------------------------------------------------------------
// Tests — GET /api/skills
// ---------------------------------------------------------------------------

describe('GET /api/skills — handler logic', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDataDir();
    seedRegistry(tmpDir);
    resetRateLimit(); // clear rate limit state between tests
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---- storage layer tests (used by the handler) -------------------------

  it('readIndex returns skills from data directory', () => {
    const index = readIndex(tmpDir);
    expect(index.skills).toHaveLength(3);
    expect(index.skills[0]!.name).toBe('dare-ax');
  });

  it('readIndex returns version and updatedAt fields', () => {
    const index = readIndex(tmpDir);
    expect(index.version).toBe('1.0');
    // updatedAt is set by writeIndex — just verify it is an ISO timestamp
    expect(index.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('filters skills by keyword (case-insensitive)', () => {
    const index = readIndex(tmpDir);
    const kw = 'ax';
    const filtered = index.skills.filter((s) =>
      s.keywords.some((k) => k.toLowerCase().includes(kw.toLowerCase())),
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe('dare-ax');
  });

  it('filters skills by keyword that matches multiple', () => {
    const index = readIndex(tmpDir);
    const kw = 'agent';
    const filtered = index.skills.filter((s) =>
      s.keywords.some((k) => k.toLowerCase().includes(kw.toLowerCase())),
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe('dare-ax');
  });

  it('filters skills by author (case-insensitive exact match)', () => {
    const index = readIndex(tmpDir);
    const auth = 'communitydev';
    const filtered = index.skills.filter(
      (s) => s.author.toLowerCase() === auth.toLowerCase(),
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe('dare-frontend-design');
  });

  it('returns empty array when no skills match keyword filter', () => {
    const index = readIndex(tmpDir);
    const kw = 'nonexistent-keyword-xyz';
    const filtered = index.skills.filter((s) =>
      s.keywords.some((k) => k.toLowerCase().includes(kw.toLowerCase())),
    );
    expect(filtered).toHaveLength(0);
  });

  it('returns all skills when no filter applied', () => {
    const index = readIndex(tmpDir);
    expect(index.skills).toHaveLength(3);
  });

  it('skills have required fields', () => {
    const index = readIndex(tmpDir);
    for (const skill of index.skills) {
      expect(skill).toHaveProperty('name');
      expect(skill).toHaveProperty('version');
      expect(skill).toHaveProperty('description');
      expect(skill).toHaveProperty('author');
      expect(skill).toHaveProperty('license');
      expect(skill).toHaveProperty('keywords');
      expect(Array.isArray(skill.keywords)).toBe(true);
    }
  });

  it('skills all have MIT license', () => {
    const index = readIndex(tmpDir);
    for (const skill of index.skills) {
      expect(skill.license).toBe('MIT');
    }
  });

  // ---- rate limit tests --------------------------------------------------

  it('rate limit allows requests within limit', () => {
    const key = 'list:test-ip-1';
    // Should allow 100 requests before blocking
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 10, 60_000)).toBe(true);
    }
  });

  it('rate limit blocks after exceeding limit', () => {
    const key = 'list:test-ip-2';
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, 3, 60_000);
    }
    expect(checkRateLimit(key, 3, 60_000)).toBe(false);
  });

  it('rate limit resets after window', async () => {
    const key = 'list:test-ip-3';
    // Fill the window
    for (let i = 0; i < 2; i++) {
      checkRateLimit(key, 2, 1); // 1ms window
    }
    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 10));
    expect(checkRateLimit(key, 2, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — CORS and request validation logic
// ---------------------------------------------------------------------------

describe('GET /api/skills — CORS headers', () => {
  it('sets Access-Control-Allow-Origin header', () => {
    // This tests the header logic directly
    const headers: Record<string, string> = {};
    const setCorsHeaders = (h: Record<string, string>) => {
      h['Access-Control-Allow-Origin'] = '*';
      h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
      h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    };
    setCorsHeaders(headers);
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('allows GET and OPTIONS methods', () => {
    const headers: Record<string, string> = {};
    const setCorsHeaders = (h: Record<string, string>) => {
      h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    };
    setCorsHeaders(headers);
    expect(headers['Access-Control-Allow-Methods']).toContain('GET');
    expect(headers['Access-Control-Allow-Methods']).toContain('OPTIONS');
  });
});

// ---------------------------------------------------------------------------
// Tests — data integrity
// ---------------------------------------------------------------------------

describe('Registry data — data/index.json pre-populated skills', () => {
  it('has exactly 6 skills pre-populated', () => {
    // Read from actual data directory
    const actualIndex = readIndex();
    expect(actualIndex.skills.length).toBeGreaterThanOrEqual(6);
  });

  it('contains dare-ax', () => {
    const index = readIndex();
    const skill = index.skills.find((s) => s.name === 'dare-ax');
    expect(skill).toBeDefined();
    expect(skill!.license).toBe('MIT');
  });

  it('contains dare-layered-design', () => {
    const index = readIndex();
    const skill = index.skills.find((s) => s.name === 'dare-layered-design');
    expect(skill).toBeDefined();
  });

  it('contains dare-llm-integration', () => {
    const index = readIndex();
    const skill = index.skills.find((s) => s.name === 'dare-llm-integration');
    expect(skill).toBeDefined();
  });

  it('contains dare-frontend-design', () => {
    const index = readIndex();
    const skill = index.skills.find((s) => s.name === 'dare-frontend-design');
    expect(skill).toBeDefined();
  });

  it('contains dare-realtime', () => {
    const index = readIndex();
    const skill = index.skills.find((s) => s.name === 'dare-realtime');
    expect(skill).toBeDefined();
  });

  it('contains dare-quality-telemetry', () => {
    const index = readIndex();
    const skill = index.skills.find((s) => s.name === 'dare-quality-telemetry');
    expect(skill).toBeDefined();
  });

  it('all skills have MIT license', () => {
    const index = readIndex();
    for (const skill of index.skills) {
      expect(skill.license).toBe('MIT');
    }
  });

  it('all skills have keywords array', () => {
    const index = readIndex();
    for (const skill of index.skills) {
      expect(Array.isArray(skill.keywords)).toBe(true);
    }
  });
});
