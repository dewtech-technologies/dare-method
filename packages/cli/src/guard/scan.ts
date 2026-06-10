import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GuardFinding } from './types.js';

interface ScanRulesFile {
  readonly version: number;
  readonly rules: ReadonlyArray<ScanRuleDefinition>;
}

interface ScanRuleDefinition {
  readonly id: string;
  readonly description: string;
  readonly regex: ReadonlyArray<string>;
}

interface CompiledScanRule {
  readonly id: string;
  readonly description: string;
  readonly patterns: ReadonlyArray<RegExp>;
}

const RULES_FILENAME = 'scan-rules.json';
const DEFAULT_RULES_PATH = fileURLToPath(
  new URL(`./rules/${RULES_FILENAME}`, import.meta.url),
);
const MAX_EVIDENCE_LENGTH = 160;

function parseRegexLiteral(literal: string): RegExp {
  const trimmed = literal.trim();
  const match = /^\/([\s\S]*)\/([a-z]*)$/i.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid regex literal "${literal}"`);
  }
  const [, source, flags] = match;
  return new RegExp(source, flags);
}

function resolveRulesPath(): string {
  const overridePath = process.env.DARE_GUARD_SCAN_RULES_PATH?.trim();
  if (!overridePath) return DEFAULT_RULES_PATH;
  return resolve(overridePath);
}

function loadRulesFile(): ScanRulesFile {
  const rulesPath = resolveRulesPath();
  const raw = readFileSync(rulesPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Invalid scan rules at "${rulesPath}"`);
  }
  const rec = parsed as Record<string, unknown>;
  if (!Array.isArray(rec.rules)) {
    throw new Error(`Invalid scan rules at "${rulesPath}"`);
  }

  return {
    version: typeof rec.version === 'number' ? rec.version : 0,
    rules: rec.rules as ReadonlyArray<ScanRuleDefinition>,
  };
}

function compileRules(file: ScanRulesFile): ReadonlyArray<CompiledScanRule> {
  return file.rules.map((rule) => {
    if (
      typeof rule.id !== 'string' ||
      typeof rule.description !== 'string' ||
      !Array.isArray(rule.regex)
    ) {
      throw new Error('Invalid scan rule definition');
    }
    return {
      id: rule.id,
      description: rule.description,
      patterns: rule.regex.map((literal) => parseRegexLiteral(literal)),
    };
  });
}

function sanitizeEvidence(evidence: string): string {
  const collapsed = evidence.replace(/\s+/g, ' ').trim();
  const redacted = collapsed.replace(/\b[A-Za-z0-9_=-]{16,}\b/g, '[REDACTED]');
  if (redacted.length <= MAX_EVIDENCE_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_EVIDENCE_LENGTH)}...`;
}

/**
 * Heurística best-effort (camada 2): um achado isolado é sempre WARN.
 */
export function scanHeuristics(content: string): GuardFinding[] {
  if (!content) return [];

  const rules = compileRules(loadRulesFile());
  const findings: GuardFinding[] = [];

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(content);
      if (!match) continue;

      findings.push({
        layer: 'scan',
        severity: 'WARN',
        rule: rule.id,
        evidence: sanitizeEvidence(match[0]),
      });
      break;
    }
  }

  return findings;
}
