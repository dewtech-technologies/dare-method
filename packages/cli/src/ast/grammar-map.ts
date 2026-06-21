import type { AstLanguageId } from './types.js';

/** WASM filenames bundled under dist/ast/grammars/ (subset of tree-sitter-wasms). */
export const BUNDLED_GRAMMARS = [
  'tree-sitter.wasm',
  'tree-sitter-typescript.wasm',
  'tree-sitter-tsx.wasm',
  'tree-sitter-javascript.wasm',
  'tree-sitter-python.wasm',
  'tree-sitter-php.wasm',
  'tree-sitter-go.wasm',
  'tree-sitter-ruby.wasm',
  'tree-sitter-rust.wasm',
] as const;

export type BundledGrammarFile = (typeof BUNDLED_GRAMMARS)[number];

export interface FileGrammarSpec {
  readonly lang: AstLanguageId;
  readonly wasm: BundledGrammarFile;
}

const EXT_GRAMMAR: Record<string, FileGrammarSpec> = {
  '.ts': { lang: 'typescript', wasm: 'tree-sitter-typescript.wasm' },
  '.tsx': { lang: 'typescript', wasm: 'tree-sitter-tsx.wasm' },
  '.js': { lang: 'javascript', wasm: 'tree-sitter-javascript.wasm' },
  '.jsx': { lang: 'javascript', wasm: 'tree-sitter-javascript.wasm' },
  '.mjs': { lang: 'javascript', wasm: 'tree-sitter-javascript.wasm' },
  '.cjs': { lang: 'javascript', wasm: 'tree-sitter-javascript.wasm' },
  '.py': { lang: 'python', wasm: 'tree-sitter-python.wasm' },
  '.php': { lang: 'php', wasm: 'tree-sitter-php.wasm' },
  '.go': { lang: 'go', wasm: 'tree-sitter-go.wasm' },
  '.rb': { lang: 'ruby', wasm: 'tree-sitter-ruby.wasm' },
  '.rs': { lang: 'rust', wasm: 'tree-sitter-rust.wasm' },
};

export function grammarForExtension(ext: string): FileGrammarSpec | null {
  return EXT_GRAMMAR[ext.toLowerCase()] ?? null;
}

export const ALL_AST_LANGUAGES: AstLanguageId[] = [
  'typescript',
  'javascript',
  'python',
  'php',
  'go',
  'ruby',
  'rust',
];
