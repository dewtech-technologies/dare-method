// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import {
  TemplateNotFoundError,
  TemplateRenderError,
  detectEngine,
  render,
  renderToFile,
} from '../template-engine.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tpl-engine-'));
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

async function writeTemplate(name: string, content: string): Promise<string> {
  const p = path.join(tmpDir, name);
  await fs.writeFile(p, content, 'utf8');
  return p;
}

describe('detectEngine', () => {
  it('detects handlebars by .hbs / .handlebars / .tpl', () => {
    expect(detectEngine('foo.hbs')).toBe('handlebars');
    expect(detectEngine('foo.handlebars')).toBe('handlebars');
    expect(detectEngine('main.go.tpl')).toBe('handlebars');
  });

  it('detects nunjucks for jinja-likes', () => {
    expect(detectEngine('foo.j2')).toBe('nunjucks');
    expect(detectEngine('foo.jinja2')).toBe('nunjucks');
    expect(detectEngine('foo.tera')).toBe('nunjucks');
    expect(detectEngine('foo.erb')).toBe('nunjucks');
  });

  it('detects mustache by extension', () => {
    expect(detectEngine('foo.mustache')).toBe('mustache');
  });

  it('falls back to raw for unknown extensions', () => {
    expect(detectEngine('foo.bin')).toBe('raw');
    expect(detectEngine('Gemfile')).toBe('raw');
  });

  it('is case-insensitive', () => {
    expect(detectEngine('Foo.HBS')).toBe('handlebars');
  });
});

describe('render — handlebars', () => {
  it('substitutes simple variable', async () => {
    const p = await writeTemplate('a.hbs', '{{name}}');
    const out = await render({ templatePath: p, engine: 'handlebars', vars: { name: 'X' } });
    expect(out).toBe('X');
  });

  it('strict mode throws on missing var', async () => {
    const p = await writeTemplate('a.hbs', '{{missing}}');
    await expect(
      render({ templatePath: p, engine: 'handlebars', vars: {} }),
    ).rejects.toThrow(TemplateRenderError);
  });

  it('does not HTML-escape (noEscape: true)', async () => {
    const p = await writeTemplate('a.hbs', '{{value}}');
    const out = await render({
      templatePath: p,
      engine: 'handlebars',
      vars: { value: '<script>' },
    });
    expect(out).toBe('<script>');
  });
});

describe('render — nunjucks', () => {
  it('substitutes simple variable', async () => {
    const p = await writeTemplate('a.j2', '{{ name }}');
    const out = await render({ templatePath: p, engine: 'nunjucks', vars: { name: 'Y' } });
    expect(out).toBe('Y');
  });

  it('throws on missing var (throwOnUndefined)', async () => {
    const p = await writeTemplate('a.j2', '{{ missing }}');
    await expect(
      render({ templatePath: p, engine: 'nunjucks', vars: {} }),
    ).rejects.toThrow(TemplateRenderError);
  });

  it('supports {% if %} block', async () => {
    const p = await writeTemplate('a.j2', '{% if x %}yes{% else %}no{% endif %}');
    const yes = await render({ templatePath: p, engine: 'nunjucks', vars: { x: true } });
    expect(yes).toBe('yes');
    const no = await render({ templatePath: p, engine: 'nunjucks', vars: { x: false } });
    expect(no).toBe('no');
  });

  it('renders .tera (treated as Jinja-compatible)', async () => {
    const p = await writeTemplate('a.tera', '[{{ name }}]');
    const out = await render({ templatePath: p, engine: 'nunjucks', vars: { name: 'rust' } });
    expect(out).toBe('[rust]');
  });

  it('renders .erb (treated as Jinja-compatible)', async () => {
    // ERB-as-Jinja: substitute {{ }} only. Real ERB has <%= %> which we don't
    // interpret here — that's fine; templates ship the {{ }} dialect for
    // DARE-specific substitution.
    const p = await writeTemplate('a.erb', '<%= "literal" %>-{{ name }}');
    const out = await render({ templatePath: p, engine: 'nunjucks', vars: { name: 'ruby' } });
    expect(out).toBe('<%= "literal" %>-ruby');
  });
});

describe('render — mustache', () => {
  it('substitutes simple variable', async () => {
    const p = await writeTemplate('a.mustache', '{{name}}');
    const out = await render({ templatePath: p, engine: 'mustache', vars: { name: 'Z' } });
    expect(out).toBe('Z');
  });

  it('throws when var not provided (strict pre-scan)', async () => {
    const p = await writeTemplate('a.mustache', '{{missing}}');
    await expect(
      render({ templatePath: p, engine: 'mustache', vars: {} }),
    ).rejects.toThrow(TemplateRenderError);
  });
});

describe('render — raw', () => {
  it('returns content unchanged', async () => {
    const content = 'literal {{ not_interpolated }} text\n';
    const p = await writeTemplate('a.bin', content);
    const out = await render({ templatePath: p, engine: 'raw', vars: {} });
    expect(out).toBe(content);
  });
});

describe('render — errors', () => {
  it('throws TemplateNotFoundError for non-existent path', async () => {
    await expect(
      render({
        templatePath: path.join(tmpDir, 'does-not-exist.hbs'),
        engine: 'handlebars',
        vars: {},
      }),
    ).rejects.toThrow(TemplateNotFoundError);
  });

  it('TemplateRenderError carries templatePath, engine, cause', async () => {
    const p = await writeTemplate('bad.hbs', '{{missing}}');
    try {
      await render({ templatePath: p, engine: 'handlebars', vars: {} });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(TemplateRenderError);
      const err = e as TemplateRenderError;
      expect(err.templatePath).toBe(p);
      expect(err.engine).toBe('handlebars');
      expect(err.cause).toBeDefined();
    }
  });
});

describe('renderToFile()', () => {
  it('writes rendered output and creates parent dirs', async () => {
    const tplPath = await writeTemplate('a.hbs', 'hello {{name}}');
    await renderToFile({
      templatePath: tplPath,
      engine: 'handlebars',
      vars: { name: 'world' },
      baseDir: tmpDir,
      destPath: 'nested/dir/out.txt',
    });
    const out = await fs.readFile(path.join(tmpDir, 'nested/dir/out.txt'), 'utf8');
    expect(out).toBe('hello world');
  });
});
