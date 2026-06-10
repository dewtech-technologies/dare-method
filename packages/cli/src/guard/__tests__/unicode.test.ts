import { describe, it, expect } from 'vitest';
import { auditUnicode } from '../unicode.js';

describe('auditUnicode', () => {
  it('detects_zero_width', () => {
    const content = `abc\u200Bdef`;
    const result = auditUnicode(content, 'strip');

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      layer: 'unicode',
      severity: 'WARN',
      rule: 'zero-width',
    });
    expect(result.findings[0].evidence).toContain('U+200B');
    expect(result.sanitized).toBe('abcdef');
  });

  it('detects_bidi_override', () => {
    const content = `safe\u202Etext`;
    const result = auditUnicode(content, 'strip');

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].rule).toBe('bidi-override');
    expect(result.findings[0].evidence).toContain('U+202E');
    expect(result.sanitized).toBe('safetext');
  });

  it('detects_variation_selector', () => {
    const content = `warn\uFE0Fing`;
    const result = auditUnicode(content, 'strip');

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].rule).toBe('variation-selector');
    expect(result.findings[0].evidence).toContain('U+FE0F');
    expect(result.sanitized).toBe('warning');
  });

  it('detects_tag_chars', () => {
    const tagChar = String.fromCodePoint(0xe0001);
    const content = `ab${tagChar}cd`;
    const result = auditUnicode(content, 'strip');

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].rule).toBe('tag-char');
    expect(result.findings[0].evidence).toContain('U+E0001');
    expect(result.sanitized).toBe('abcd');
  });

  it('strip_removes_and_returns_clean', () => {
    const content = `A\u200BB\u202EC\uFE0FD${String.fromCodePoint(0xe0001)}E`;
    const result = auditUnicode(content, 'strip');

    expect(result.findings.map((f) => f.severity)).toEqual([
      'WARN',
      'WARN',
      'WARN',
      'WARN',
    ]);
    expect(result.sanitized).toBe('ABCDE');
  });

  it('block_flags_fail_keeps_content', () => {
    const content = `ab\u200Bcd`;
    const result = auditUnicode(content, 'block');

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('FAIL');
    expect(result.sanitized).toBe(content);
  });

  it('clean_text_passes', () => {
    const content = 'texto benigno sem unicode suspeito';
    const result = auditUnicode(content, 'strip');

    expect(result.findings).toHaveLength(0);
    expect(result.sanitized).toBe(content);
  });

  it('homoglyph_basic', () => {
    const content = 'раypal';
    const result = auditUnicode(content, 'strip');

    expect(result.findings).toHaveLength(2);
    expect(result.findings.every((f) => f.rule === 'homoglyph')).toBe(true);
    expect(result.findings[0].evidence).toContain('U+0440');
    expect(result.findings[1].evidence).toContain('U+0430');
    expect(result.sanitized).toBe(content);
  });
});
