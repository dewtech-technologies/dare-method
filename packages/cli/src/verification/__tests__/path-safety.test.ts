import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  assertRelativeSafe,
  assertWithinRoot,
  resolveSafePath,
  PathEscapeError,
  PATH_ESCAPE_MESSAGE,
} from '../../utils/path-safety.js';

describe('assertRelativeSafe', () => {
  it('should_accept_relative_safe_path', () => {
    expect(() => assertRelativeSafe('a/b/c.txt')).not.toThrow();
  });

  it('should_reject_absolute', () => {
    expect(() => assertRelativeSafe('/x')).toThrow(/absolute/);
    if (process.platform === 'win32') {
      expect(() => assertRelativeSafe('C:\\x')).toThrow(/absolute/);
    }
  });

  it('should_reject_dotdot', () => {
    expect(() => assertRelativeSafe('../x')).toThrow(/\.\./);
    expect(() => assertRelativeSafe('a/../../b')).toThrow(/\.\./);
  });
});

describe('resolveSafePath', () => {
  it('should_resolve_safe_child', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-path-safe-'));
    const result = resolveSafePath(root, 'DARE', 'TASKS.md');
    expect(result).toBe(path.resolve(root, 'DARE', 'TASKS.md'));
    expect(() => assertWithinRoot(root, result)).not.toThrow();
  });

  it('should_reject_dotdot_escape', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-path-safe-'));
    expect(() => resolveSafePath(root, '..', 'etc', 'passwd')).toThrow(PathEscapeError);
    expect(() => resolveSafePath(root, '..', 'etc', 'passwd')).toThrow(PATH_ESCAPE_MESSAGE);
  });

  it('should_reject_absolute_segment', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-path-safe-'));
    expect(() => resolveSafePath(root, '/etc/passwd')).toThrow(/absolute/);
  });

  it('should_reject_outside_root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-path-safe-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-path-out-'));
    const escaped = path.join(outside, 'secret.txt');

    expect(() => assertWithinRoot(root, escaped)).toThrow(PathEscapeError);
    expect(() => assertWithinRoot(root, escaped)).toThrow(PATH_ESCAPE_MESSAGE);
  });

  it('should_reject_unc_root', () => {
    if (process.platform !== 'win32') return;
    expect(() => resolveSafePath('\\\\server\\share', 'file.txt')).toThrow(PathEscapeError);
    expect(() => resolveSafePath('\\\\server\\share', 'file.txt')).toThrow(/UNC/);
  });

  it('windows_drive_fixture', () => {
    if (process.platform !== 'win32') return;

    const root = path.resolve('C:\\proj');
    const inside = resolveSafePath(root, 'DARE', 'TASKS.md');
    expect(inside.toLowerCase()).toBe(path.resolve(root, 'DARE', 'TASKS.md').toLowerCase());

    expect(() => assertWithinRoot(root, 'D:\\other\\file.txt')).toThrow(PathEscapeError);
  });
});
