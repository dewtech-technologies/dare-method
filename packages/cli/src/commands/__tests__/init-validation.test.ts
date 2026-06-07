import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  validateProjectName,
  resolveProjectOutputDir,
  assertWithinCwd,
  PROJECT_NAME_RE,
} from '../init-validation.js';

describe('PROJECT_NAME_RE', () => {
  it('matches lowercase hyphenated names', () => {
    expect(PROJECT_NAME_RE.test('my--app')).toBe(true);
    expect(PROJECT_NAME_RE.test('valid-name')).toBe(true);
  });
});

describe('validateProjectName', () => {
  it('accepts valid-name', () => {
    const result = validateProjectName('valid-name');
    expect(result).toEqual({ ok: true, sanitized: 'valid-name' });
  });

  it('accepts my--app', () => {
    const result = validateProjectName('my--app');
    expect(result).toEqual({ ok: true, sanitized: 'my--app' });
  });

  it('rejects traversal ../../tmp/x', () => {
    const result = validateProjectName('../../tmp/x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        "Error: project name must be a simple directory name under the current folder (got '../../tmp/x')",
      );
    }
  });

  it('rejects absolute /etc/passwd', () => {
    const result = validateProjectName('/etc/passwd');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        "Error: project name must be a simple directory name under the current folder (got '/etc/passwd')",
      );
    }
  });

  it('rejects uppercase MyApp', () => {
    const result = validateProjectName('MyApp');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        "Error: project name may only contain lowercase letters, numbers, hyphens and underscores (got 'MyApp')",
      );
    }
  });

  it('rejects dot and dotdot only', () => {
    const dot = validateProjectName('.');
    const dotdot = validateProjectName('..');
    expect(dot.ok).toBe(false);
    expect(dotdot.ok).toBe(false);
    if (!dot.ok) {
      expect(dot.error).toContain("got '.'");
    }
    if (!dotdot.ok) {
      expect(dotdot.error).toContain("got '..'");
    }
  });

  it('rejects_windows_dotdot_escape', () => {
    const result = validateProjectName('..\\escape');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        "Error: project name must be a simple directory name under the current folder (got '..\\escape')",
      );
    }
  });
});

describe('resolveProjectOutputDir', () => {
  it('resolves under cwd', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-init-val-'));
    const out = resolveProjectOutputDir(cwd, 'valid-name');
    expect(out).toBe(path.resolve(cwd, 'valid-name'));
  });
});

describe('assertWithinCwd', () => {
  it('allows child directory', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-init-val-'));
    const child = path.join(cwd, 'child');
    expect(() => assertWithinCwd(cwd, child)).not.toThrow();
  });

  it('rejects path outside cwd with exact message', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-init-val-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-init-out-'));
    expect(() => assertWithinCwd(cwd, outside)).toThrow(
      'Error: project directory must stay inside the current working directory',
    );
  });
});
