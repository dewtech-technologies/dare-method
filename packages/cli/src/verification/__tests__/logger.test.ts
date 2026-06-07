import { describe, it, expect, vi, afterEach } from 'vitest';

describe('logger', () => {
  const prev = process.env.DARE_LOG_LEVEL;

  afterEach(() => {
    vi.resetModules();
    if (prev === undefined) delete process.env.DARE_LOG_LEVEL;
    else process.env.DARE_LOG_LEVEL = prev;
  });

  it('should_create_child_with_scope', async () => {
    const { createLogger } = await import('../../utils/logger.js');
    const child = createLogger('verification');
    expect(child.bindings().scope).toBe('verification');
  });

  it('should_respect_level_env', async () => {
    process.env.DARE_LOG_LEVEL = 'warn';
    vi.resetModules();
    const { createLogger } = await import('../../utils/logger.js');
    expect(createLogger('test-level').level).toBe('warn');
  });
});
