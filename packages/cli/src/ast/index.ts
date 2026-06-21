import fs from 'fs-extra';
import path from 'path';
import { ALL_AST_LANGUAGES, grammarForExtension } from './grammar-map.js';
import { initAstLoader, loadGrammarWasm } from './loader.js';
import type { AstExtractOptions, AstExtractResult, AstLanguageId } from './types.js';
import * as tsLang from './languages/typescript.js';
import * as pyLang from './languages/python.js';
import * as phpLang from './languages/php.js';
import * as goLang from './languages/go.js';
import * as rubyLang from './languages/ruby.js';
import * as rustLang from './languages/rust.js';
import type { DataModel } from '../utils/datamodel.js';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.next',
  'coverage', '.turbo', 'out', '__pycache__', '.venv', 'venv', '.cache', 'tmp',
]);

const DEFAULT_MAX_BYTES = 1_048_576;

const EXTRACTORS: Partial<Record<AstLanguageId, (root: import('./walk.js').AstNode, rel: string) => Pick<DataModel, 'endpoints' | 'entities'>>> = {
  typescript: tsLang.extractFromTree,
  javascript: tsLang.extractFromTree,
  python: pyLang.extractFromTree,
  php: phpLang.extractFromTree,
  go: goLang.extractFromTree,
  ruby: rubyLang.extractFromTree,
  rust: rustLang.extractFromTree,
};

async function collectAstFiles(root: string, maxFileBytes: number): Promise<Array<{ rel: string; content: string; spec: NonNullable<ReturnType<typeof grammarForExtension>> }>> {
  const out: Array<{ rel: string; content: string; spec: NonNullable<ReturnType<typeof grammarForExtension>> }> = [];

  async function recurse(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as fs.Dirent[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        await recurse(path.join(dir, e.name));
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        const spec = grammarForExtension(ext);
        if (!spec) continue;
        const abs = path.join(dir, e.name);
        const stat = await fs.stat(abs).catch(() => null);
        if (!stat || stat.size > maxFileBytes) continue;
        const content = await fs.readFile(abs, 'utf-8').catch(() => '');
        if (!content) continue;
        out.push({ rel: toPosix(path.relative(root, abs)), content, spec });
      }
    }
  }

  await recurse(root);
  return out;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function emptyModel(): DataModel {
  return { entities: [], endpoints: [] };
}

/** Parse source files under root with tree-sitter; empty model if loader unavailable. */
export async function extractWithAst(opts: AstExtractOptions): Promise<AstExtractResult> {
  const loader = await initAstLoader();
  const allowed = opts.languages?.length ? new Set(opts.languages) : new Set(ALL_AST_LANGUAGES);

  if (!loader.available) {
    return {
      model: emptyModel(),
      meta: {
        astEndpoints: 0,
        astEntities: 0,
        astLanguages: [],
        astAvailable: false,
      },
    };
  }

  const maxBytes = opts.maxFileBytes ?? DEFAULT_MAX_BYTES;
  const files = await collectAstFiles(opts.root, maxBytes);
  const model = emptyModel();
  const usedLangs = new Set<AstLanguageId>();

  for (const file of files) {
    if (!allowed.has(file.spec.lang)) continue;
    const grammar = await loadGrammarWasm(file.spec.wasm, file.spec.lang);
    if (!grammar) continue;

    const extract = EXTRACTORS[file.spec.lang];
    if (!extract) continue;

    try {
      const { Parser } = await import('web-tree-sitter');
      const parser = new Parser();
      parser.setLanguage(grammar);
      const tree = parser.parse(file.content);
      if (!tree) continue;
      const partial = extract(tree.rootNode as import('./walk.js').AstNode, file.rel);
      model.endpoints.push(...partial.endpoints);
      model.entities.push(...partial.entities);
      usedLangs.add(file.spec.lang);
      tree.delete();
      parser.delete();
    } catch {
      // skip unparseable file
    }
  }

  return {
    model,
    meta: {
      astEndpoints: model.endpoints.length,
      astEntities: model.entities.length,
      astLanguages: [...usedLangs].sort(),
      astAvailable: loader.available,
    },
  };
}

export type { AstExtractResult, AstLanguageId, AstExtractOptions, ExtractionMeta } from './types.js';
export { mergeDataModels, normalizeRoute } from './merge.js';
export { initAstLoader, loadGrammar } from './loader.js';
