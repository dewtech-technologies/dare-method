import fs from 'fs-extra';
import type { Language } from 'web-tree-sitter';
import type { AstLanguageId, AstLoaderStatus } from './types.js';
import type { BundledGrammarFile } from './grammar-map.js';
import { resolveWasmPath } from './paths.js';

export type { Language as Grammar };

let initPromise: Promise<AstLoaderStatus> | null = null;
let runtimeReady = false;
const grammarCache = new Map<string, Language>();
const loadedLangs = new Set<AstLanguageId>();

function status(): AstLoaderStatus {
  if (!runtimeReady) {
    return { available: false, reason: 'not initialized', loadedLanguages: [] };
  }
  return { available: true, loadedLanguages: [...loadedLangs] };
}

/** Lazy-init web-tree-sitter once; never throws to callers. */
export async function initAstLoader(): Promise<AstLoaderStatus> {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

async function doInit(): Promise<AstLoaderStatus> {
  try {
    const runtimePath = await resolveWasmPath('tree-sitter.wasm');
    if (!runtimePath) {
      return { available: false, reason: 'web-tree-sitter WASM not found (optional dep missing)', loadedLanguages: [] };
    }

    const { Parser } = await import('web-tree-sitter');
    await Parser.init({
      locateFile(_scriptName: string) {
        return runtimePath;
      },
    } as unknown as Parameters<typeof Parser.init>[0]);
    runtimeReady = true;
    return status();
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : String(err), loadedLanguages: [] };
  }
}

/** Load a WASM grammar by bundled filename; cache per file. */
export async function loadGrammarWasm(
  wasmFile: BundledGrammarFile,
  langId: AstLanguageId,
): Promise<Language | null> {
  const base = await initAstLoader();
  if (!base.available) return null;

  const cacheKey = wasmFile;
  const cached = grammarCache.get(cacheKey);
  if (cached) return cached;

  try {
    const wasmPath = await resolveWasmPath(wasmFile);
    if (!wasmPath) return null;

    const { Language } = await import('web-tree-sitter');
    const bytes = await fs.readFile(wasmPath);
    const grammar = await Language.load(bytes);
    grammarCache.set(cacheKey, grammar);
    loadedLangs.add(langId);
    return grammar;
  } catch {
    return null;
  }
}

/** @deprecated use loadGrammarWasm — kept for blueprint API compat */
export async function loadGrammar(lang: AstLanguageId): Promise<Language | null> {
  const { grammarForExtension } = await import('./grammar-map.js');
  const spec = grammarForExtension(lang === 'javascript' ? '.js' : `.${lang === 'typescript' ? 'ts' : lang}`);
  if (!spec) return null;
  return loadGrammarWasm(spec.wasm, lang);
}
