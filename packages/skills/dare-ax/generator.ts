/**
 * dare-ax — DareAxGenerator
 * Generates llms.txt at project root using the Jinja2-style template.
 * License: MIT
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProjectConfig } from './types.js';
import { containsSecrets } from './secret-detector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE_PATH = path.join(__dirname, 'templates', 'llms.txt.jinja2');

/**
 * Renders a Jinja2-style template with simple variable substitution.
 * Supports: {{ variable }}, {% for x in list %}...{% endfor %},
 * {% if condition %}...{% endif %}, {% if cond %}...{% else %}...{% endif %}
 *
 * Uses a token-based approach to avoid regex nesting issues.
 */
function renderTemplate(templateContent: string, context: Record<string, unknown>): string {
  return renderWithContext(templateContent, context);
}

/**
 * Tokenizes the template into literal strings and tag tokens, then evaluates them.
 * This avoids the regex-ordering / nesting problems of sequential replacements.
 */
function renderWithContext(template: string, context: Record<string, unknown>): string {
  const tokens = tokenize(template);
  const result = evaluate(tokens, context, 0);
  return result.output;
}

type Token =
  | { type: 'text'; value: string }
  | { type: 'var'; name: string }
  | { type: 'for'; varName: string; listName: string }
  | { type: 'endfor' }
  | { type: 'if'; condName: string }
  | { type: 'else' }
  | { type: 'endif' };

/** Splits the template into text and tag tokens */
function tokenize(template: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < template.length) {
    // Find next tag {{ or {%
    const varStart = template.indexOf('{{', pos);
    const tagStart = template.indexOf('{%', pos);

    let next: number;
    let isVar: boolean;

    if (varStart === -1 && tagStart === -1) {
      // No more tags — rest is text
      tokens.push({ type: 'text', value: template.slice(pos) });
      break;
    } else if (varStart === -1) {
      next = tagStart;
      isVar = false;
    } else if (tagStart === -1) {
      next = varStart;
      isVar = true;
    } else {
      next = Math.min(varStart, tagStart);
      isVar = varStart < tagStart;
    }

    // Emit text before the tag
    if (next > pos) {
      tokens.push({ type: 'text', value: template.slice(pos, next) });
    }

    if (isVar) {
      // {{ varname }}
      const end = template.indexOf('}}', next + 2);
      if (end === -1) {
        tokens.push({ type: 'text', value: template.slice(next) });
        break;
      }
      const name = template.slice(next + 2, end).trim();
      tokens.push({ type: 'var', name });
      pos = end + 2;
    } else {
      // {% tag ... %}
      const end = template.indexOf('%}', next + 2);
      if (end === -1) {
        tokens.push({ type: 'text', value: template.slice(next) });
        break;
      }
      const inner = template.slice(next + 2, end).trim();
      pos = end + 2;

      if (inner.startsWith('for ')) {
        const m = /^for\s+(\w+)\s+in\s+([\w.]+)$/.exec(inner);
        if (m) {
          tokens.push({ type: 'for', varName: m[1], listName: m[2] });
        }
      } else if (inner === 'endfor') {
        tokens.push({ type: 'endfor' });
      } else if (inner.startsWith('if ')) {
        const condName = inner.slice(3).trim();
        tokens.push({ type: 'if', condName });
      } else if (inner === 'else') {
        tokens.push({ type: 'else' });
      } else if (inner === 'endif') {
        tokens.push({ type: 'endif' });
      }
      // Unknown tags are ignored
    }
  }

  return tokens;
}

/** Evaluates a token list starting at `startIdx`. Returns the rendered output and next index. */
function evaluate(
  tokens: Token[],
  context: Record<string, unknown>,
  startIdx: number
): { output: string; nextIdx: number } {
  let output = '';
  let i = startIdx;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === 'text') {
      output += token.value;
      i++;
    } else if (token.type === 'var') {
      // {{ varname }} — resolve from context
      const direct = context[token.name];
      if (direct !== undefined && direct !== null) {
        output += String(direct);
      } else {
        const val = getNestedValue(context, token.name);
        if (val !== undefined && val !== null) output += String(val);
      }
      i++;
    } else if (token.type === 'for') {
      // Collect the for-body tokens until matching endfor
      const bodyStart = i + 1;
      let depth = 1;
      let j = bodyStart;
      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === 'for') depth++;
        if (tokens[j].type === 'endfor') depth--;
        if (depth > 0) j++;
        else break;
      }
      const bodyTokens = tokens.slice(bodyStart, j);

      const list = getNestedValue(context, token.listName);
      if (Array.isArray(list)) {
        for (const item of list) {
          const itemContext: Record<string, unknown> = { ...context };
          if (typeof item === 'object' && item !== null) {
            itemContext[token.varName] = item;
            for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
              itemContext[`${token.varName}.${k}`] = v;
            }
          } else {
            itemContext[token.varName] = item;
          }
          output += evaluate(bodyTokens, itemContext, 0).output;
        }
      }
      i = j + 1; // skip endfor
    } else if (token.type === 'if') {
      // Collect then-body and optional else-body until matching endif
      const condName = token.condName;
      const bodyStart = i + 1;
      let depth = 1;
      let j = bodyStart;
      let elseIdx = -1;

      while (j < tokens.length && depth > 0) {
        if (tokens[j].type === 'if') depth++;
        if (tokens[j].type === 'endif') depth--;
        if (depth === 1 && tokens[j].type === 'else') elseIdx = j;
        if (depth > 0) j++;
        else break;
      }
      const endifIdx = j;

      const thenTokens =
        elseIdx >= 0
          ? tokens.slice(bodyStart, elseIdx)
          : tokens.slice(bodyStart, endifIdx);
      const elseTokens =
        elseIdx >= 0 ? tokens.slice(elseIdx + 1, endifIdx) : [];

      const condValue = getNestedValue(context, condName);
      if (isTruthy(condValue)) {
        output += evaluate(thenTokens, context, 0).output;
      } else {
        output += evaluate(elseTokens, context, 0).output;
      }
      i = endifIdx + 1; // skip endif
    } else if (token.type === 'else' || token.type === 'endif' || token.type === 'endfor') {
      // These are consumed by the parent for/if handler above; if we hit them here, stop.
      break;
    } else {
      i++;
    }
  }

  return { output, nextIdx: i };
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key: string) => {
    if (current !== null && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
}

function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.length > 0;
  return Boolean(value);
}

/**
 * Converts a ProjectConfig into the template context object.
 */
function buildContext(config: ProjectConfig): Record<string, unknown> {
  return {
    project_overview: config.projectOverview,
    language: config.language,
    framework: config.framework,
    database: config.database,
    key_dependencies: config.keyDependencies,
    architecture_description: config.architectureDescription,
    directory_structure: config.directoryStructure ?? defaultDirectoryStructure(config),
    endpoints: config.endpoints ?? [],
    config_file: config.configFile ?? 'config.json',
    has_docker: config.hasDocker ?? false,
    has_makefile: config.hasMakefile ?? false,
    has_taskfile: config.hasTaskfile ?? false,
    getting_started_command: config.gettingStartedCommand ?? 'make dev',
    rate_limits: config.rateLimits ?? [
      { scope: 'Public endpoints', limit: 100 },
      { scope: 'Auth endpoints', limit: 10 },
    ],
    extra_security_notes: config.extraSecurityNotes ?? [],
    cli_binary: config.cliBinary ?? config.name,
    agent_notes: config.agentNotes ?? [],
  };
}

function defaultDirectoryStructure(config: ProjectConfig): string {
  const src = config.language === 'Ruby' ? 'app' : 'src';
  return `${src}/
├── handlers/      # HTTP handlers / controllers
├── services/      # Business logic
├── models/        # Data structures
├── repositories/  # Database access
└── utils/         # Utilities`;
}

export class DareAxGenerator {
  private readonly templatePath: string;

  constructor(templatePath?: string) {
    this.templatePath = templatePath ?? DEFAULT_TEMPLATE_PATH;
  }

  /**
   * Generates llms.txt in the project root.
   * Throws if generated content would contain secrets.
   *
   * @param projectPath - Absolute path to the project root.
   * @param config - Project configuration.
   * @returns Absolute path to the generated file.
   */
  generateLlmsTxt(projectPath: string, config: ProjectConfig): string {
    if (config.axNotApplicable) {
      throw new Error(
        'ax: not-applicable is set for this project. Skipping llms.txt generation.'
      );
    }

    const templateContent = fs.readFileSync(this.templatePath, 'utf-8');
    const context = buildContext(config);
    const rendered = renderTemplate(templateContent, context);

    // Security check: no secrets in rendered content
    const secretCheck = containsSecrets(rendered);
    if (secretCheck.found) {
      throw new Error(
        `dare-ax: Secret detected in llms.txt content (${secretCheck.pattern}). ` +
          `Remove secrets before generating. llms.txt is a public file.`
      );
    }

    const outputPath = path.join(projectPath, 'llms.txt');
    fs.writeFileSync(outputPath, rendered, 'utf-8');

    return outputPath;
  }

  /**
   * Returns the rendered llms.txt content WITHOUT writing to disk.
   * Useful for previewing or testing.
   */
  renderLlmsTxt(config: ProjectConfig): string {
    if (config.axNotApplicable) {
      throw new Error('ax: not-applicable is set; rendering skipped.');
    }

    const templateContent = fs.readFileSync(this.templatePath, 'utf-8');
    const context = buildContext(config);
    return renderTemplate(templateContent, context);
  }
}
