import type { GuardFinding } from './types.js';

type UnicodeMode = 'strip' | 'block';

interface RuleMatch {
  readonly rule: GuardFinding['rule'];
  readonly descriptor: string;
}

const ZERO_WIDTH_START = 0x200b;
const ZERO_WIDTH_END = 0x200f;
const BIDI_OVERRIDE_PRIMARY_START = 0x202a;
const BIDI_OVERRIDE_PRIMARY_END = 0x202e;
const BIDI_OVERRIDE_SECONDARY_START = 0x2066;
const BIDI_OVERRIDE_SECONDARY_END = 0x2069;
const VARIATION_SELECTOR_START = 0xfe00;
const VARIATION_SELECTOR_END = 0xfe0f;
const TAG_CHAR_START = 0xe0000;
const TAG_CHAR_END = 0xe007f;

const HOMOGLYPH_CONFUSABLES = new Map<number, string>([
  // Cyrillic lower
  [0x0430, 'a'],
  [0x0435, 'e'],
  [0x043e, 'o'],
  [0x0440, 'p'],
  [0x0441, 'c'],
  [0x0445, 'x'],
  [0x0456, 'i'],
  [0x0458, 'j'],
  [0x04cf, 'l'],
  // Cyrillic upper
  [0x0410, 'A'],
  [0x0412, 'B'],
  [0x0415, 'E'],
  [0x041a, 'K'],
  [0x041c, 'M'],
  [0x041d, 'H'],
  [0x041e, 'O'],
  [0x0420, 'P'],
  [0x0421, 'C'],
  [0x0422, 'T'],
  [0x0425, 'X'],
  [0x0406, 'I'],
  [0x0408, 'J'],
  // Greek lower
  [0x03b1, 'a'],
  [0x03bf, 'o'],
  [0x03c1, 'p'],
  [0x03c5, 'u'],
  [0x03bd, 'v'],
  [0x03c7, 'x'],
  [0x03b9, 'i'],
  [0x03ba, 'k'],
  // Greek upper
  [0x0391, 'A'],
  [0x0392, 'B'],
  [0x0395, 'E'],
  [0x0396, 'Z'],
  [0x0397, 'H'],
  [0x0399, 'I'],
  [0x039a, 'K'],
  [0x039c, 'M'],
  [0x039d, 'N'],
  [0x039f, 'O'],
  [0x03a1, 'P'],
  [0x03a4, 'T'],
  [0x03a5, 'Y'],
  [0x03a7, 'X'],
]);

function inRange(codePoint: number, start: number, end: number): boolean {
  return codePoint >= start && codePoint <= end;
}

function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

function findRuleMatch(codePoint: number): RuleMatch | null {
  if (inRange(codePoint, ZERO_WIDTH_START, ZERO_WIDTH_END)) {
    return { rule: 'zero-width', descriptor: 'zero-width char' };
  }
  if (
    inRange(codePoint, BIDI_OVERRIDE_PRIMARY_START, BIDI_OVERRIDE_PRIMARY_END) ||
    inRange(codePoint, BIDI_OVERRIDE_SECONDARY_START, BIDI_OVERRIDE_SECONDARY_END)
  ) {
    return { rule: 'bidi-override', descriptor: 'bidi override char' };
  }
  if (inRange(codePoint, VARIATION_SELECTOR_START, VARIATION_SELECTOR_END)) {
    return { rule: 'variation-selector', descriptor: 'variation selector' };
  }
  if (inRange(codePoint, TAG_CHAR_START, TAG_CHAR_END)) {
    return { rule: 'tag-char', descriptor: 'tag char' };
  }
  const latinEquivalent = HOMOGLYPH_CONFUSABLES.get(codePoint);
  if (latinEquivalent !== undefined) {
    return {
      rule: 'homoglyph',
      descriptor: `homoglyph confusable with latin '${latinEquivalent}'`,
    };
  }
  return null;
}

function finding(
  mode: UnicodeMode,
  rule: GuardFinding['rule'],
  codePoint: number,
  offset: number,
  descriptor: string,
): GuardFinding {
  return {
    layer: 'unicode',
    severity: mode === 'block' ? 'FAIL' : 'WARN',
    rule,
    evidence: `${formatCodePoint(codePoint)} at offset ${offset} (${descriptor})`,
  };
}

export function auditUnicode(
  content: string,
  mode: UnicodeMode,
): { findings: GuardFinding[]; sanitized: string } {
  const findings: GuardFinding[] = [];
  const sanitizedParts: string[] = [];

  let offset = 0;
  for (const char of content) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      offset += char.length;
      continue;
    }

    const match = findRuleMatch(codePoint);
    if (match !== null) {
      findings.push(finding(mode, match.rule, codePoint, offset, match.descriptor));
      const shouldStripCodePoint =
        mode === 'strip' && match.rule !== 'homoglyph';
      if (!shouldStripCodePoint) {
        sanitizedParts.push(char);
      }
    } else {
      sanitizedParts.push(char);
    }

    offset += char.length;
  }

  if (mode === 'block' && findings.length > 0) {
    return { findings, sanitized: content };
  }

  return { findings, sanitized: sanitizedParts.join('') };
}
