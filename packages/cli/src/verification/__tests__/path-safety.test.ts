import { describe, it, expect } from 'vitest';
import { assertRelativeSafe } from '../../utils/path-safety.js';

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
