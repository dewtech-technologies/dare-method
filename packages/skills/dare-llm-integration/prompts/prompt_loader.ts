/**
 * dare-llm-integration — PromptLoader
 * Loads and renders versioned Jinja2 prompt templates.
 * Uses the same token-based engine as dare-ax/generator.ts.
 * License: MIT
 */

import fs from 'fs';
import path from 'path';

export interface PromptLoaderConfig {
  /** Directory where .jinja2 template files live. */
  templatesDir: string;
}

type Token =
  | { type: 'text'; value: string }
  | { type: 'var'; name: string }
  | { type: 'for'; varName: string; listName: string }
  | { type: 'endfor' }
  | { type: 'if'; condName: string }
  | { type: 'else' }
  | { type: 'endif' };

export class PromptLoader {
  private readonly templatesDir: string;
  private readonly templateCache: Map<string, string> = new Map();

  constructor(config: PromptLoaderConfig) {
    this.templatesDir = config.templatesDir;
  }

  /**
   * Load and render a versioned template.
   * File resolved as: <templatesDir>/<name>_<version>.jinja2
   *
   * @param name    - Template name, e.g. "summarize"
   * @param version - Version string, e.g. "v1"
   * @param vars    - Variables to interpolate into the template
   * @returns Rendered prompt string
   */
  load(name: string, version: string, vars: Record<string, string>): string {
    const filename = `${name}_${version}.jinja2`;
    const filepath = path.join(this.templatesDir, filename);

    let content = this.templateCache.get(filepath);
    if (!content) {
      if (!fs.existsSync(filepath)) {
        throw new Error(`PromptLoader: template not found: ${filepath}`);
      }
      content = fs.readFileSync(filepath, 'utf-8');
      this.templateCache.set(filepath, content);
    }

    return renderTemplate(content, vars);
  }

  /**
   * Render a template string directly (without reading a file).
   */
  render(templateContent: string, vars: Record<string, string>): string {
    return renderTemplate(templateContent, vars);
  }

  /**
   * List all available template names and versions in the templates directory.
   */
  listTemplates(): Array<{ name: string; version: string; filename: string }> {
    if (!fs.existsSync(this.templatesDir)) return [];

    return fs
      .readdirSync(this.templatesDir)
      .filter((f) => f.endsWith('.jinja2'))
      .map((filename) => {
        const base = filename.replace('.jinja2', '');
        const lastUnderscore = base.lastIndexOf('_');
        if (lastUnderscore < 0) return null;
        return {
          name: base.slice(0, lastUnderscore),
          version: base.slice(lastUnderscore + 1),
          filename,
        };
      })
      .filter((x): x is { name: string; version: string; filename: string } => x !== null);
  }

  /**
   * Clear the template file cache (useful in tests).
   */
  clearCache(): void {
    this.templateCache.clear();
  }
}

// --- Jinja2-style template engine (same logic as dare-ax/generator.ts) ---

function renderTemplate(content: string, vars: Record<string, unknown>): string {
  const tokens = tokenize(content);
  return evaluate(tokens, vars, 0).output;
}

function tokenize(template: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < template.length) {
    const varStart = template.indexOf('{{', pos);
    const tagStart = template.indexOf('{%', pos);

    let next: number;
    let isVar: boolean;

    if (varStart === -1 && tagStart === -1) {
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

    if (next > pos) {
      tokens.push({ type: 'text', value: template.slice(pos, next) });
    }

    if (isVar) {
      const end = template.indexOf('}}', next + 2);
      if (end === -1) {
        tokens.push({ type: 'text', value: template.slice(next) });
        break;
      }
      const name = template.slice(next + 2, end).trim();
      tokens.push({ type: 'var', name });
      pos = end + 2;
    } else {
      const end = template.indexOf('%}', next + 2);
      if (end === -1) {
        tokens.push({ type: 'text', value: template.slice(next) });
        break;
      }
      const inner = template.slice(next + 2, end).trim();
      pos = end + 2;

      if (inner.startsWith('for ')) {
        const m = /^for\s+(\w+)\s+in\s+([\w.]+)$/.exec(inner);
        if (m) tokens.push({ type: 'for', varName: m[1], listName: m[2] });
      } else if (inner === 'endfor') {
        tokens.push({ type: 'endfor' });
      } else if (inner.startsWith('if ')) {
        tokens.push({ type: 'if', condName: inner.slice(3).trim() });
      } else if (inner === 'else') {
        tokens.push({ type: 'else' });
      } else if (inner === 'endif') {
        tokens.push({ type: 'endif' });
      }
    }
  }

  return tokens;
}

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
      const val = getNestedValue(context, token.name);
      if (val !== undefined && val !== null) output += String(val);
      i++;
    } else if (token.type === 'for') {
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
          const itemCtx: Record<string, unknown> = { ...context };
          if (typeof item === 'object' && item !== null) {
            itemCtx[token.varName] = item;
            for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
              itemCtx[`${token.varName}.${k}`] = v;
            }
          } else {
            itemCtx[token.varName] = item;
          }
          output += evaluate(bodyTokens, itemCtx, 0).output;
        }
      }
      i = j + 1;
    } else if (token.type === 'if') {
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
      const thenTokens = elseIdx >= 0 ? tokens.slice(bodyStart, elseIdx) : tokens.slice(bodyStart, endifIdx);
      const elseTokens = elseIdx >= 0 ? tokens.slice(elseIdx + 1, endifIdx) : [];
      const condValue = getNestedValue(context, token.condName);
      if (isTruthy(condValue)) {
        output += evaluate(thenTokens, context, 0).output;
      } else {
        output += evaluate(elseTokens, context, 0).output;
      }
      i = endifIdx + 1;
    } else if (token.type === 'else' || token.type === 'endif' || token.type === 'endfor') {
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
