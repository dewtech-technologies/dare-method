// SPDX-License-Identifier: MIT
/**
 * Template engine dispatcher.
 *
 * Templates per stack live in `packages/cli/templates/stacks/<id>/`.
 * File extension picks the engine:
 *   .hbs / .handlebars → handlebars
 *   .j2 / .jinja2 / .tera / .erb → nunjucks (Jinja-compatible dialect)
 *   .mustache → mustache
 *   anything else → raw (copy byte-for-byte)
 *
 * Var-faltante: throws (Nunjucks via throwOnUndefined; Handlebars via strict
 * mode; Mustache silently produces empty so we wrap with a pre-check).
 */
import path from 'node:path';
import fs from 'fs-extra';
import Handlebars from 'handlebars';
import nunjucks from 'nunjucks';
import Mustache from 'mustache';

export type TemplateEngine = 'handlebars' | 'nunjucks' | 'mustache' | 'raw';

export interface RenderOpts {
  /** Absolute path to template file. */
  readonly templatePath: string;
  readonly engine: TemplateEngine;
  readonly vars: Readonly<Record<string, unknown>>;
}

export class TemplateNotFoundError extends Error {
  public readonly templatePath: string;
  constructor(templatePath: string) {
    super(`Template not found: ${templatePath}`);
    this.name = 'TemplateNotFoundError';
    this.templatePath = templatePath;
  }
}

export class TemplateRenderError extends Error {
  public readonly templatePath: string;
  public readonly engine: TemplateEngine;
  public readonly cause: unknown;
  constructor(templatePath: string, engine: TemplateEngine, cause: unknown) {
    super(
      `Failed to render '${templatePath}' (${engine}): ${(cause as Error)?.message ?? cause}`,
    );
    this.name = 'TemplateRenderError';
    this.templatePath = templatePath;
    this.engine = engine;
    this.cause = cause;
  }
}

// ─── Engine setup ──────────────────────────────────────────────────────────

// Shared Nunjucks env. autoescape=false because outputs are source code, not HTML.
// throwOnUndefined=true so missing vars fail fast instead of silently producing "".
const nunjucksEnv = new nunjucks.Environment(null, {
  autoescape: false,
  throwOnUndefined: true,
});

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Detects engine from file extension.
 * Unknown extensions → 'raw'.
 */
export function detectEngine(templatePath: string): TemplateEngine {
  const lower = templatePath.toLowerCase();
  if (lower.endsWith('.hbs') || lower.endsWith('.handlebars')) return 'handlebars';
  if (
    lower.endsWith('.j2') ||
    lower.endsWith('.jinja2') ||
    lower.endsWith('.tera') ||
    lower.endsWith('.erb')
  ) {
    return 'nunjucks';
  }
  if (lower.endsWith('.mustache')) return 'mustache';
  return 'raw';
}

/**
 * Renders a template to a string.
 *
 * Throws TemplateNotFoundError when the file doesn't exist,
 * TemplateRenderError on parse/runtime failure (e.g. missing var).
 */
export async function render(opts: RenderOpts): Promise<string> {
  if (!(await fs.pathExists(opts.templatePath))) {
    throw new TemplateNotFoundError(opts.templatePath);
  }
  const source = await fs.readFile(opts.templatePath, 'utf8');

  switch (opts.engine) {
    case 'raw':
      return source;

    case 'handlebars':
      try {
        const tpl = Handlebars.compile(source, { strict: true, noEscape: true });
        return tpl(opts.vars);
      } catch (cause) {
        throw new TemplateRenderError(opts.templatePath, 'handlebars', cause);
      }

    case 'nunjucks':
      try {
        return nunjucksEnv.renderString(source, { ...opts.vars });
      } catch (cause) {
        throw new TemplateRenderError(opts.templatePath, 'nunjucks', cause);
      }

    case 'mustache': {
      // Mustache is intentionally lax — but we want missing-var to throw to
      // match the strictness of Handlebars/Nunjucks. We pre-scan tags.
      try {
        assertAllMustacheVarsProvided(source, opts.vars);
        return Mustache.render(source, opts.vars);
      } catch (cause) {
        throw new TemplateRenderError(opts.templatePath, 'mustache', cause);
      }
    }
  }
}

/**
 * Convenience helper: render and write to disk under baseDir/destPath.
 * Creates parent dirs.
 */
export async function renderToFile(
  opts: RenderOpts & { destPath: string; baseDir: string },
): Promise<void> {
  const rendered = await render(opts);
  const abs = path.join(opts.baseDir, opts.destPath);
  await fs.ensureDir(path.dirname(abs));
  await fs.writeFile(abs, rendered, 'utf8');
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function assertAllMustacheVarsProvided(
  source: string,
  vars: Readonly<Record<string, unknown>>,
): void {
  // Mustache tags: {{name}}, {{&name}}, {{{name}}}, {{#name}}...{{/name}}, etc.
  // We scan for simple {{name}} and {{&name}} references.
  const re = /\{\{[#^/&]?\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const top = m[1].split('.')[0];
    if (top === '.') continue; // implicit iterator
    if (!seen.has(top) && !(top in vars)) {
      throw new Error(`Mustache var '${top}' not provided`);
    }
    seen.add(top);
  }
}
