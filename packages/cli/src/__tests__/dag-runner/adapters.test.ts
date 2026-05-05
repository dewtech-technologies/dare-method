import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAdapter,
  MissingApiKeyError,
  pickModel,
} from '../../dag-runner/adapters/index.js';
import type { DagModelMap } from '../../dag-runner/run_dag.js';

const sampleModels: DagModelMap = { HIGH: 'big', MED: 'mid', LOW: 'small' };

// ─── Anthropic SDK mock ──────────────────────────────────────────────────────
vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn(async () => ({
    content: [{ type: 'text', text: 'mocked claude response' }],
    usage: { input_tokens: 10, output_tokens: 20 },
  }));
  // Default export is the client class.
  return {
    default: class MockAnthropic {
      messages = { create };
      static __spy = create;
    },
  };
});

// ─── Cursor SDK mock ─────────────────────────────────────────────────────────
vi.mock('@cursor/sdk', () => ({
  Agent: {
    create: vi.fn(async () => ({
      send: vi.fn(async () => ({
        cancel: vi.fn(async () => undefined),
        wait: vi.fn(async () => ({ result: 'mocked cursor response' })),
      })),
      close: vi.fn(async () => undefined),
    })),
  },
}));

// ─── Google Generative AI mock ───────────────────────────────────────────────
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(): {
      generateContent: (...args: unknown[]) => Promise<unknown>;
    } {
      return {
        generateContent: async () => ({
          response: {
            text: () => 'mocked antigravity response',
            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 },
          },
        }),
      };
    }
  },
}));

describe('pickModel', () => {
  it('returns the model id for the given complexity', () => {
    expect(pickModel(sampleModels, 'HIGH')).toBe('big');
    expect(pickModel(sampleModels, 'MED')).toBe('mid');
    expect(pickModel(sampleModels, 'LOW')).toBe('small');
  });

  it('throws when models block is missing', () => {
    expect(() => pickModel(undefined, 'HIGH')).toThrow();
  });
});

describe('Adapters — happy path with mocked SDKs', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.CURSOR_API_KEY = 'test-key';
    process.env.ANTIGRAVITY_API_KEY = 'test-key';
  });

  it('claude adapter calls SDK and returns text + tokens', async () => {
    const adapter = await getAdapter('claude');
    const ctrl = new AbortController();
    const res = await adapter.call({
      prompt: 'hi',
      complexity: 'MED',
      models: sampleModels,
      signal: ctrl.signal,
    });
    expect(res.output).toBe('mocked claude response');
    expect(res.tokens).toBe(30);
  });

  it('cursor adapter calls SDK and returns result', async () => {
    const adapter = await getAdapter('cursor');
    const ctrl = new AbortController();
    const res = await adapter.call({
      prompt: 'hi',
      complexity: 'LOW',
      models: sampleModels,
      signal: ctrl.signal,
    });
    expect(res.output).toBe('mocked cursor response');
  });

  it('antigravity adapter calls SDK and returns text + tokens', async () => {
    const adapter = await getAdapter('antigravity');
    const ctrl = new AbortController();
    const res = await adapter.call({
      prompt: 'hi',
      complexity: 'HIGH',
      models: sampleModels,
      signal: ctrl.signal,
    });
    expect(res.output).toBe('mocked antigravity response');
    expect(res.tokens).toBe(12);
  });
});

describe('Adapters — missing API keys', () => {
  it('claude adapter throws MissingApiKeyError when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const adapter = await getAdapter('claude');
    await expect(
      adapter.call({
        prompt: 'hi',
        complexity: 'MED',
        models: sampleModels,
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it('cursor adapter throws MissingApiKeyError when CURSOR_API_KEY is unset', async () => {
    delete process.env.CURSOR_API_KEY;
    const adapter = await getAdapter('cursor');
    await expect(
      adapter.call({
        prompt: 'hi',
        complexity: 'MED',
        models: sampleModels,
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it('antigravity adapter throws MissingApiKeyError when both env vars are unset', async () => {
    delete process.env.ANTIGRAVITY_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    const adapter = await getAdapter('antigravity');
    await expect(
      adapter.call({
        prompt: 'hi',
        complexity: 'MED',
        models: sampleModels,
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });
});
