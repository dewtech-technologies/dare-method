/**
 * dare-ax — DareAxValidator
 * Validates the structure and security of llms.txt.
 * License: MIT
 */

import fs from 'fs';
import { ValidationResult, ValidationError, ValidationWarning } from './types.js';
import { findAllSecrets } from './secret-detector.js';

/** Required top-level sections in a valid llms.txt */
const REQUIRED_SECTIONS = [
  'Project Overview',
  'Tech Stack',
  'Architecture',
  'Key Endpoints',
  'For AI Agents',
] as const;

/** Optional but recommended sections */
const RECOMMENDED_SECTIONS = [
  'Directory Structure',
  'Getting Started',
  'Rate Limits',
  'Security Notes',
  'Important Files',
] as const;

/**
 * Minimum character count for a non-trivial section body.
 * A section with < MIN_SECTION_BODY chars is considered empty/stub.
 */
const MIN_SECTION_BODY = 10;

export class DareAxValidator {
  /**
   * Validates a llms.txt file at the given path.
   *
   * @param llmsTxtPath - Absolute path to the llms.txt file.
   * @returns ValidationResult with errors and warnings.
   */
  validate(llmsTxtPath: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check file existence
    if (!fs.existsSync(llmsTxtPath)) {
      errors.push({
        code: 'E_FILE_NOT_FOUND',
        message: `llms.txt not found at path: ${llmsTxtPath}`,
      });
      return { valid: false, errors, warnings };
    }

    let content: string;
    try {
      content = fs.readFileSync(llmsTxtPath, 'utf-8');
    } catch (err) {
      errors.push({
        code: 'E_FILE_READ_ERROR',
        message: `Failed to read llms.txt: ${(err as Error).message}`,
      });
      return { valid: false, errors, warnings };
    }

    // Check empty file
    if (!content.trim()) {
      errors.push({
        code: 'E_EMPTY_FILE',
        message: 'llms.txt is empty.',
      });
      return { valid: false, errors, warnings };
    }

    // Parse sections: lines starting with "## Section Name"
    const sections = parseSections(content);

    // Check required sections
    for (const required of REQUIRED_SECTIONS) {
      if (!sections.has(required)) {
        errors.push({
          code: 'E_MISSING_SECTION',
          message: `Required section "## ${required}" is missing from llms.txt.`,
        });
      } else {
        const body = sections.get(required)!.trim();
        if (body.length < MIN_SECTION_BODY) {
          errors.push({
            code: 'E_EMPTY_SECTION',
            message: `Section "## ${required}" exists but appears to be empty or a stub (body: "${body.slice(0, 40)}").`,
          });
        }
      }
    }

    // Check recommended sections (warnings only)
    for (const recommended of RECOMMENDED_SECTIONS) {
      if (!sections.has(recommended)) {
        warnings.push({
          code: 'W_MISSING_RECOMMENDED_SECTION',
          message: `Recommended section "## ${recommended}" is missing from llms.txt.`,
        });
      }
    }

    // Check for secrets
    const secrets = findAllSecrets(content);
    for (const secret of secrets) {
      errors.push({
        code: 'E_SECRET_DETECTED',
        message: `Secret detected in llms.txt at line ${secret.line}: [${secret.pattern}]. ` +
          `Content: "${secret.lineContent.slice(0, 80)}". llms.txt is a public file — remove all secrets.`,
      });
    }

    // Check that "For AI Agents" section mentions OpenAPI
    const forAiSection = sections.get('For AI Agents');
    if (forAiSection && !forAiSection.toLowerCase().includes('openapi')) {
      warnings.push({
        code: 'W_MISSING_OPENAPI_REFERENCE',
        message: 'Section "## For AI Agents" does not mention OpenAPI. Consider adding a reference to /openapi.json.',
      });
    }

    // Check that "For AI Agents" section mentions --json
    if (forAiSection && !forAiSection.includes('--json')) {
      warnings.push({
        code: 'W_MISSING_JSON_FLAG_REFERENCE',
        message: 'Section "## For AI Agents" does not mention --json CLI flag.',
      });
    }

    const valid = errors.length === 0;
    return { valid, errors, warnings };
  }

  /**
   * Validates raw llms.txt content (string) without reading from disk.
   * Useful for previewing generated content before writing.
   */
  validateContent(content: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!content.trim()) {
      errors.push({ code: 'E_EMPTY_FILE', message: 'Content is empty.' });
      return { valid: false, errors, warnings };
    }

    const sections = parseSections(content);

    for (const required of REQUIRED_SECTIONS) {
      if (!sections.has(required)) {
        errors.push({
          code: 'E_MISSING_SECTION',
          message: `Required section "## ${required}" is missing.`,
        });
      } else {
        const body = sections.get(required)!.trim();
        if (body.length < MIN_SECTION_BODY) {
          errors.push({
            code: 'E_EMPTY_SECTION',
            message: `Section "## ${required}" is empty or a stub.`,
          });
        }
      }
    }

    for (const recommended of RECOMMENDED_SECTIONS) {
      if (!sections.has(recommended)) {
        warnings.push({
          code: 'W_MISSING_RECOMMENDED_SECTION',
          message: `Recommended section "## ${recommended}" is missing.`,
        });
      }
    }

    const secrets = findAllSecrets(content);
    for (const secret of secrets) {
      errors.push({
        code: 'E_SECRET_DETECTED',
        message: `Secret detected at line ${secret.line}: [${secret.pattern}].`,
      });
    }

    const forAiSection = sections.get('For AI Agents');
    if (forAiSection && !forAiSection.toLowerCase().includes('openapi')) {
      warnings.push({
        code: 'W_MISSING_OPENAPI_REFERENCE',
        message: '"## For AI Agents" does not mention OpenAPI.',
      });
    }

    if (forAiSection && !forAiSection.includes('--json')) {
      warnings.push({
        code: 'W_MISSING_JSON_FLAG_REFERENCE',
        message: '"## For AI Agents" does not mention --json flag.',
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

/**
 * Parses section headings (## Section Name) and their body text from a llms.txt string.
 * Returns a Map<sectionName, bodyText>.
 */
function parseSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split('\n');

  let currentSection: string | null = null;
  const bodyLines: string[] = [];

  for (const line of lines) {
    // Match "## Section Name" (exactly two hashes, not more)
    const sectionMatch = /^##\s+(.+)$/.exec(line);

    if (sectionMatch) {
      // Save previous section body
      if (currentSection !== null) {
        sections.set(currentSection, bodyLines.join('\n'));
      }
      currentSection = sectionMatch[1].trim();
      bodyLines.length = 0;
    } else if (currentSection !== null) {
      bodyLines.push(line);
    }
  }

  // Save last section
  if (currentSection !== null) {
    sections.set(currentSection, bodyLines.join('\n'));
  }

  return sections;
}
