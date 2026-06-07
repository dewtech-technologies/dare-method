import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_EXTENSIONS,
  inString,
  isTestFile,
} from '../static-analyzer.js';

describe('static-analyzer exports', () => {
  it('SUPPORTED_EXTENSIONS includes common code extensions', () => {
    expect(SUPPORTED_EXTENSIONS.has('.ts')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.py')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.go')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.rs')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.php')).toBe(true);
    expect(SUPPORTED_EXTENSIONS.has('.md')).toBe(false);
  });

  it('inString detects column inside string literal', () => {
    expect(inString('const x = "fn fake("', 14)).toBe(true);
    expect(inString('export function add(', 7)).toBe(false);
  });

  it('isTestFile classifies test paths', () => {
    expect(isTestFile('src/foo.test.ts')).toBe(true);
    expect(isTestFile('src/foo.ts')).toBe(false);
  });
});
