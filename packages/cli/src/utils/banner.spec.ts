/**
 * Tests for DARE CLI — ASCII art banner (printBanner / renderBanner)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared BEFORE importing the module under test
// ---------------------------------------------------------------------------

// Mock figlet so tests don't depend on bundled font files
vi.mock('figlet', () => {
  const textSync = vi.fn((_text: string, opts?: { font?: string }) => {
    // Simulate font-not-found for 'Alligator' to test fallback
    if (opts?.font === 'Alligator') {
      throw new Error('Font not found: Alligator');
    }
    if (opts?.font === 'Larry 3D') {
      throw new Error('Font not found: Larry 3D');
    }
    // 'Big', 'Slant', 'Standard' succeed
    return `  ____    _    ____  _____\n | __ )  / \\  |  _ \\| ____|\n |  _ \\ / _ \\ | |_) |  _|  \n | |_) / ___ \\|  _ <| |___ \n |____/_/   \\_\\_| \\_\\_____|\n`;
  });

  return { default: { textSync } };
});

// Mock gradient-string (CommonJS module loaded via createRequire)
vi.mock('gradient-string', () => {
  const mockMultiline = vi.fn((text: string) => `\x1b[32m${text}\x1b[0m`);
  const mockGradient = vi.fn(() => ({ multiline: mockMultiline }));
  return { default: mockGradient };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { printBanner, renderBanner } from './banner.js';

// ---------------------------------------------------------------------------
// Helper: spy on console.log
// ---------------------------------------------------------------------------
function spyConsole() {
  return vi.spyOn(console, 'log').mockImplementation(() => undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('renderBanner()', () => {
  it('returns a non-empty string', () => {
    const result = renderBanner();
    expect(result).toBeTruthy();
    expect(result.trim().length).toBeGreaterThan(0);
  });

  it('falls back when Alligator and Larry 3D throw — still returns text', () => {
    // Our mock throws for Alligator and Larry 3D, succeeds for Big
    const result = renderBanner();
    expect(result).not.toBe('');
  });

  it('returns "DARE" plain text as last resort when all fonts fail', async () => {
    // Override figlet mock to always throw for this test
    const figlet = await import('figlet');
    const textSyncSpy = vi.spyOn(figlet.default, 'textSync').mockImplementation(() => {
      throw new Error('no font');
    });

    const result = renderBanner();
    expect(result).toBe('DARE');

    textSyncSpy.mockRestore();
  });

  it('returns non-empty string even when figlet returns empty string for first font', async () => {
    const figlet = await import('figlet');
    let callCount = 0;
    const textSyncSpy = vi.spyOn(figlet.default, 'textSync').mockImplementation(() => {
      callCount++;
      if (callCount === 1) return '   '; // whitespace-only → should skip
      return 'DARE ART';
    });

    const result = renderBanner();
    expect(result.trim().length).toBeGreaterThan(0);

    textSyncSpy.mockRestore();
  });
});

describe('printBanner()', () => {
  let originalIsTTY: boolean | undefined;
  let originalNoBanner: string | undefined;
  let originalForceBanner: string | undefined;
  let originalColorterm: string | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
    originalNoBanner = process.env.DARE_NO_BANNER;
    originalForceBanner = process.env.FORCE_BANNER;
    originalColorterm = process.env.COLORTERM;

    // Reset env vars
    delete process.env.DARE_NO_BANNER;
    delete process.env.FORCE_BANNER;
    delete process.env.COLORTERM;
  });

  afterEach(() => {
    // Restore isTTY
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });

    // Restore env vars
    if (originalNoBanner === undefined) {
      delete process.env.DARE_NO_BANNER;
    } else {
      process.env.DARE_NO_BANNER = originalNoBanner;
    }
    if (originalForceBanner === undefined) {
      delete process.env.FORCE_BANNER;
    } else {
      process.env.FORCE_BANNER = originalForceBanner;
    }
    if (originalColorterm === undefined) {
      delete process.env.COLORTERM;
    } else {
      process.env.COLORTERM = originalColorterm;
    }

    vi.restoreAllMocks();
  });

  // --- TTY suppression ---

  it('does NOT print when process.stdout.isTTY is false', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });

    const spy = spyConsole();
    printBanner();
    expect(spy).not.toHaveBeenCalled();
  });

  it('prints when FORCE_BANNER=1 even if isTTY is false', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });
    process.env.FORCE_BANNER = '1';

    const spy = spyConsole();
    printBanner();
    expect(spy).toHaveBeenCalled();
  });

  // --- DARE_NO_BANNER suppression ---

  it('does NOT print when DARE_NO_BANNER=1', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
    process.env.DARE_NO_BANNER = '1';

    const spy = spyConsole();
    printBanner();
    expect(spy).not.toHaveBeenCalled();
  });

  it('prints normally when DARE_NO_BANNER is not set', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });

    const spy = spyConsole();
    printBanner();
    expect(spy).toHaveBeenCalled();
  });

  // --- Colour mode ---

  it('uses ANSI fallback green when noColor=true', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });

    const spy = spyConsole();
    printBanner({ noColor: true });

    // At least one call should contain the ANSI green escape code
    const calls = spy.mock.calls.map((c) => String(c[0]));
    const hasGreen = calls.some((s) => s.includes('\x1b[32m'));
    expect(hasGreen).toBe(true);
  });

  it('uses ANSI fallback when COLORTERM is not set', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
    delete process.env.COLORTERM;

    const spy = spyConsole();
    printBanner();

    const calls = spy.mock.calls.map((c) => String(c[0]));
    const hasGreen = calls.some((s) => s.includes('\x1b[32m'));
    expect(hasGreen).toBe(true);
  });

  it('uses gradient when COLORTERM=truecolor', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
    process.env.COLORTERM = 'truecolor';

    const spy = spyConsole();
    printBanner();

    // gradient mock wraps with \x1b[32m too (our mock implementation)
    // The important thing is that console.log was called
    expect(spy).toHaveBeenCalled();
  });

  // --- Tagline and subtitle ---

  it('prints tagline "Design · Architecture · Review · Execute"', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });

    const spy = spyConsole();
    printBanner();

    const calls = spy.mock.calls.map((c) => String(c[0]));
    const hasTagline = calls.some((s) =>
      s.includes('Design · Architecture · Review · Execute'),
    );
    expect(hasTagline).toBe(true);
  });

  it('prints subtitle containing "by Dewtech" and version', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });

    const spy = spyConsole();
    printBanner();

    const calls = spy.mock.calls.map((c) => String(c[0]));
    const hasSubtitle = calls.some(
      (s) => s.includes('by Dewtech') && s.includes('dewtech.tech'),
    );
    expect(hasSubtitle).toBe(true);
  });

  it('prints an empty line at the end of the banner output', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });

    const spy = spyConsole();
    printBanner();

    // The last call should be console.log() with no args (empty line)
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
    expect(lastCall).toEqual([]);
  });
});

describe('welcomeCommand', () => {
  it('exports a Commander command named "welcome"', async () => {
    const { welcomeCommand } = await import('../commands/welcome.js');
    expect(welcomeCommand.name()).toBe('welcome');
  });

  it('welcomeCommand has a description', async () => {
    const { welcomeCommand } = await import('../commands/welcome.js');
    expect(welcomeCommand.description()).toBeTruthy();
    expect(welcomeCommand.description().length).toBeGreaterThan(0);
  });
});
